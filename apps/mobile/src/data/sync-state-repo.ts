// Sync bookkeeping: one `sync_state` row per (kitchen, synced table) with the push high-water mark
// and the pull cursor, plus the per-install device id (an app-local setting, so it survives resets).
import { pullCursor as sharedPullCursor } from '@templog/shared/sync';
import { and, eq } from 'drizzle-orm';

import { db } from './db';
import { newId } from './mappers';
import { syncState } from './schema';
import { getAppValue, setAppValue } from './settings-repo';
import { notifyTables } from './store';
import { nowIso } from './time';

/** Wire keys of `SyncTablesSchema` (shared `SYNC_TABLE_NAMES`). */
export const SYNCED_TABLES = ['kitchens', 'checkpoints', 'readings', 'coolingItems'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type SyncState = {
  kitchenId: string;
  tableName: SyncedTable;
  /** Highest row version (ISO) the server accepted; rows newer than this are pushed next. */
  pushedUpTo: string | null;
  /** Server `serverTime` from the last pull; sent as `?since=`. */
  pulledAt: string | null;
};

export function getSyncState(kitchenId: string, table: SyncedTable): SyncState {
  const row = db
    .select()
    .from(syncState)
    .where(and(eq(syncState.kitchenId, kitchenId), eq(syncState.tableName, table)))
    .get();
  return { kitchenId, tableName: table, pushedUpTo: row?.pushedUpTo ?? null, pulledAt: row?.pulledAt ?? null };
}

function upsert(kitchenId: string, table: SyncedTable, patch: Partial<Pick<SyncState, 'pushedUpTo' | 'pulledAt'>>): void {
  const current = getSyncState(kitchenId, table);
  const row = {
    kitchenId,
    tableName: table,
    pushedUpTo: patch.pushedUpTo !== undefined ? patch.pushedUpTo : current.pushedUpTo,
    pulledAt: patch.pulledAt !== undefined ? patch.pulledAt : current.pulledAt,
    updatedAt: nowIso(),
  };
  db.insert(syncState)
    .values(row)
    .onConflictDoUpdate({ target: [syncState.kitchenId, syncState.tableName], set: row })
    .run();
}

export function setPushedUpTo(kitchenId: string, table: SyncedTable, iso: string): void {
  upsert(kitchenId, table, { pushedUpTo: iso });
  notifyTables('sync_state');
}

/** Stores the pull cursor for every table pulled in one request. */
export function setPulledAt(kitchenId: string, tables: readonly SyncedTable[], iso: string): void {
  db.transaction(() => {
    for (const t of tables) upsert(kitchenId, t, { pulledAt: iso });
  });
  notifyTables('sync_state');
}

/** The `?since=` cursor for a pull covering `tables` (shared `pullCursor`: oldest, or undefined = everything). */
export function pullCursor(kitchenId: string, tables: readonly SyncedTable[] = SYNCED_TABLES): string | undefined {
  return sharedPullCursor(tables.map((t) => getSyncState(kitchenId, t).pulledAt));
}

/** Forget cursors (sign-out, leaving or joining a kitchen) so the next sync pushes and pulls everything. */
export function resetSyncCursors(kitchenId?: string): void {
  if (kitchenId) db.delete(syncState).where(eq(syncState.kitchenId, kitchenId)).run();
  else db.delete(syncState).run();
  notifyTables('sync_state');
}

/** Stable id of this install (sent with sync pushes and device registration). */
export function getDeviceId(): string {
  const existing = getAppValue<string | null>('deviceId', null);
  if (existing) return existing;
  const id = newId();
  setAppValue('deviceId', id);
  return id;
}
