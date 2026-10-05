// Checkpoints (walk-in, reach-in, hot well, …): kind, °F limits, cadence. Soft deletes so a shared
// kitchen syncs them; archiving keeps history but stops new checks.
import { defaultLimitsFor } from '@templog/shared/limits';
import { type Cadence, type Checkpoint, type CheckpointKind, CheckpointSchema, type Limits } from '@templog/shared/schemas';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from './db';
import { fromCheckpoint, newId, toCheckpoint } from './mappers';
import { checkpoints } from './schema';
import { notifyTables } from './store';
import { nowIso } from './time';

export type CheckpointInput = {
  name: string;
  kind: CheckpointKind;
  /** Defaults to the Food Code limits for `kind` (shared `defaultLimitsFor`). */
  limits?: Limits;
  /** Defaults to every 4 hours while open. */
  cadence?: Cadence;
  sortOrder?: number;
};

export type CheckpointPatch = Partial<Pick<Checkpoint, 'name' | 'kind' | 'limits' | 'cadence' | 'sortOrder'>>;

/** Live checkpoints of a kitchen by `sortOrder`; archived ones only when asked. */
export function listCheckpoints(kitchenId: string, opts: { includeArchived?: boolean } = {}): Checkpoint[] {
  const where = [eq(checkpoints.kitchenId, kitchenId), isNull(checkpoints.deletedAt)];
  if (!opts.includeArchived) where.push(isNull(checkpoints.archivedAt));
  return db
    .select()
    .from(checkpoints)
    .where(and(...where))
    .orderBy(asc(checkpoints.sortOrder), asc(checkpoints.createdAt))
    .all()
    .map(toCheckpoint);
}

export function getCheckpoint(id: string): Checkpoint | null {
  const row = db.select().from(checkpoints).where(eq(checkpoints.id, id)).get();
  return row ? toCheckpoint(row) : null;
}

/** Validates and inserts. Callers go through `actions.addCheckpoint` (expands checks, reschedules). */
export function insertCheckpoint(kitchenId: string, input: CheckpointInput): Checkpoint {
  const at = nowIso();
  const existing = listCheckpoints(kitchenId, { includeArchived: true });
  const checkpoint = CheckpointSchema.parse({
    id: newId(),
    kitchenId,
    name: input.name,
    kind: input.kind,
    limits: input.limits ?? defaultLimitsFor(input.kind),
    cadence: input.cadence ?? { kind: 'every', hours: 4 },
    sortOrder: input.sortOrder ?? existing.reduce((max, c) => Math.max(max, c.sortOrder + 1), 0),
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  db.insert(checkpoints).values(fromCheckpoint(checkpoint)).run();
  notifyTables('checkpoints');
  return checkpoint;
}

/** Validates and writes a full checkpoint. */
export function saveCheckpoint(checkpoint: Checkpoint): Checkpoint {
  const valid = CheckpointSchema.parse(checkpoint);
  const row = fromCheckpoint(valid);
  db.insert(checkpoints).values(row).onConflictDoUpdate({ target: checkpoints.id, set: row }).run();
  notifyTables('checkpoints');
  return valid;
}

export function patchCheckpoint(id: string, patch: CheckpointPatch): Checkpoint {
  const current = getCheckpoint(id);
  if (!current) throw new Error(`Checkpoint ${id} not found`);
  return saveCheckpoint({ ...current, ...patch, updatedAt: nowIso() });
}

export function setCheckpointArchived(id: string, archived: boolean): Checkpoint {
  const current = getCheckpoint(id);
  if (!current) throw new Error(`Checkpoint ${id} not found`);
  const at = nowIso();
  return saveCheckpoint({ ...current, archivedAt: archived ? at : null, updatedAt: at });
}

export function markCheckpointDeleted(id: string): void {
  const at = nowIso();
  db.update(checkpoints).set({ deletedAt: at, updatedAt: at }).where(eq(checkpoints.id, id)).run();
  notifyTables('checkpoints');
}

/** Raw rows including tombstones (sync). */
export function allCheckpointRows(kitchenId?: string): Checkpoint[] {
  const q = db.select().from(checkpoints);
  return (kitchenId ? q.where(eq(checkpoints.kitchenId, kitchenId)) : q).all().map(toCheckpoint);
}

/** Writes pulled rows as-is (sync). */
export function putCheckpoints(rows: readonly Checkpoint[]): void {
  if (!rows.length) return;
  db.transaction((tx) => {
    for (const c of rows) {
      const row = fromCheckpoint(c);
      tx.insert(checkpoints).values(row).onConflictDoUpdate({ target: checkpoints.id, set: row }).run();
    }
  });
  notifyTables('checkpoints');
}
