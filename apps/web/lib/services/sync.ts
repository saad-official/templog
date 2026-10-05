import "server-only";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { ApiError } from "@/app/api/_lib/respond";
import type { Db } from "@/lib/db/client";
import { checkpoints, coolingItems, kitchens, readings } from "@/lib/db/schema";
import {
  MAX_CLOCK_SKEW_MS,
  MIRROR_TABLES,
  PULL_OVERLAP_MS,
  ROW_SCHEMAS,
  type KitchenRow,
  type MirrorTable,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncTables,
} from "@/lib/sync/contract";
import { pickWinner, rowVersion, type Versioned } from "@/lib/sync/merge";
import { memberKitchenIds, requireMembership } from "./kitchens";

/** Merge rules and wire shape: lib/sync/contract.ts. */

/**
 * The three mirror tables share their sync columns (`id`, `kitchenId`,
 * `updatedAt`, `deletedAt`, `serverUpdatedAt`) and their remaining columns
 * are exactly the wire schema's keys, so one table type stands in for all.
 */
type AnyMirror = typeof checkpoints;
const TABLES: Record<MirrorTable, AnyMirror> = {
  checkpoints,
  readings: readings as unknown as AnyMirror,
  coolingItems: coolingItems as unknown as AnyMirror,
};

const WIRE_KEYS: Record<MirrorTable, string[]> = {
  checkpoints: Object.keys(ROW_SCHEMAS.checkpoints.shape),
  readings: Object.keys(ROW_SCHEMAS.readings.shape),
  coolingItems: Object.keys(ROW_SCHEMAS.coolingItems.shape),
};

const TIMESTAMP_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "deletedAt",
  "archivedAt",
  "scheduledFor",
  "takenAt",
  "startedAt",
  "stage1At",
  "completedAt",
  "failedAt",
  "discardedAt",
]);

type WireRow = Versioned & { id: string; kitchenId: string } & Record<string, unknown>;

/** Wire row -> column values (ISO strings become Dates, absent optionals become null). */
export function wireToColumns(table: MirrorTable, row: WireRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WIRE_KEYS[table]) {
    const value = row[key];
    if (TIMESTAMP_KEYS.has(key)) out[key] = typeof value === "string" ? new Date(value) : null;
    else out[key] = value ?? null;
  }
  return out;
}

/** Stored row -> wire row (Dates become ISO strings; server-only columns dropped). */
export function columnsToWire(table: MirrorTable, row: Record<string, unknown>): WireRow {
  const out: Record<string, unknown> = {};
  for (const key of WIRE_KEYS[table]) {
    const value = row[key];
    out[key] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out as WireRow;
}

type StoredKitchen = typeof kitchens.$inferSelect;

/** A kitchen as the shared `KitchenSchema` row. The join code is the owner's to share. */
export function kitchenToWire(kitchen: StoredKitchen, viewerId: string): KitchenRow {
  return {
    id: kitchen.id,
    name: kitchen.name,
    tz: kitchen.tz,
    unit: kitchen.unit,
    openingHours: kitchen.openingHours,
    ownerUserId: kitchen.ownerUserId,
    joinCode: kitchen.ownerUserId === viewerId ? kitchen.inviteCode : null,
    createdAt: kitchen.createdAt.toISOString(),
    updatedAt: kitchen.updatedAt.toISOString(),
    deletedAt: null,
  };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function applyMirror(tx: Tx, name: MirrorTable, rows: WireRow[], now: Date): Promise<number> {
  if (rows.length === 0) return 0;
  const table = TABLES[name];
  const limit = now.getTime() + MAX_CLOCK_SKEW_MS;
  const stored = new Map<string, WireRow>();
  const byKitchen = new Map<string, string[]>();
  for (const row of rows) byKitchen.set(row.kitchenId, [...(byKitchen.get(row.kitchenId) ?? []), row.id]);
  for (const [kitchenId, ids] of byKitchen) {
    const existing = await tx
      .select()
      .from(table)
      .where(and(eq(table.kitchenId, kitchenId), inArray(table.id, [...new Set(ids)])));
    for (const row of existing) stored.set(`${kitchenId}\u0000${row.id}`, columnsToWire(name, row));
  }

  let accepted = 0;
  for (const incoming of rows) {
    if (rowVersion(incoming) > limit) continue;
    const key = `${incoming.kitchenId}\u0000${incoming.id}`;
    const current = stored.get(key);
    if (current && pickWinner(current, incoming) !== incoming) continue;
    const values = { ...wireToColumns(name, incoming), serverUpdatedAt: now } as typeof table.$inferInsert;
    await tx
      .insert(table)
      .values(values)
      .onConflictDoUpdate({ target: [table.kitchenId, table.id], set: values });
    stored.set(key, incoming);
    accepted += 1;
  }
  return accepted;
}

/** Owner-only settings changes, last-write-wins on `updatedAt`. Rows from staff or strangers are ignored. */
async function applyKitchens(tx: Tx, userId: string, rows: KitchenRow[], now: Date): Promise<number> {
  const limit = now.getTime() + MAX_CLOCK_SKEW_MS;
  let accepted = 0;
  for (const row of rows) {
    const updatedAt = Date.parse(row.updatedAt);
    if (updatedAt > limit) continue;
    const [current] = await tx.select().from(kitchens).where(eq(kitchens.id, row.id));
    if (!current || current.ownerUserId !== userId) continue;
    if (updatedAt < current.updatedAt.getTime()) continue;
    await tx
      .update(kitchens)
      .set({
        name: row.name,
        tz: row.tz,
        unit: row.unit,
        openingHours: row.openingHours,
        updatedAt: new Date(updatedAt),
        serverUpdatedAt: now,
      })
      .where(eq(kitchens.id, row.id));
    accepted += 1;
  }
  return accepted;
}

export async function pushChanges(db: Db, userId: string, body: SyncPushRequest, now = new Date()): Promise<SyncPushResponse> {
  const named = new Set<string>();
  for (const name of MIRROR_TABLES) for (const row of body.tables[name]) named.add(row.kitchenId);
  if (named.size > 0) {
    const allowed = new Set(await memberKitchenIds(db, userId));
    const refused = [...named].filter((id) => !allowed.has(id));
    if (refused.length > 0) {
      throw new ApiError(403, "You can only sync kitchens you are a member of.", "not_a_member", { kitchenIds: refused });
    }
  }
  return db.transaction(async (tx) => {
    let accepted = await applyKitchens(tx, userId, body.tables.kitchens, now);
    for (const name of MIRROR_TABLES) {
      accepted += await applyMirror(tx, name, body.tables[name] as unknown as WireRow[], now);
    }
    return { serverTime: now.toISOString(), accepted };
  });
}

export async function pullChanges(
  db: Db,
  userId: string,
  options: { since?: Date; kitchenId?: string },
  now = new Date(),
): Promise<SyncPullResponse> {
  const after = options.since ?? new Date(0);
  let kitchenIds: string[];
  if (options.kitchenId) {
    await requireMembership(db, options.kitchenId, userId);
    kitchenIds = [options.kitchenId];
  } else {
    kitchenIds = await memberKitchenIds(db, userId);
  }

  const tables: SyncTables = { kitchens: [], checkpoints: [], readings: [], coolingItems: [] };
  if (kitchenIds.length > 0) {
    const kitchenRows = await db
      .select()
      .from(kitchens)
      .where(and(inArray(kitchens.id, kitchenIds), gt(kitchens.serverUpdatedAt, after)))
      .orderBy(asc(kitchens.serverUpdatedAt), asc(kitchens.id));
    tables.kitchens = kitchenRows.map((row) => kitchenToWire(row, userId));
    for (const name of MIRROR_TABLES) {
      const table = TABLES[name];
      const rows = await db
        .select()
        .from(table)
        .where(and(inArray(table.kitchenId, kitchenIds), gt(table.serverUpdatedAt, after)))
        .orderBy(asc(table.serverUpdatedAt), asc(table.id));
      (tables[name] as unknown as WireRow[]) = rows.map((row) => columnsToWire(name, row));
    }
  }
  // The cursor lags the clock (never moving backwards) so a push committing
  // during this pull is re-sent next time rather than skipped.
  const cursor = Math.max(after.getTime(), now.getTime() - PULL_OVERLAP_MS);
  return { serverTime: new Date(cursor).toISOString(), tables };
}
