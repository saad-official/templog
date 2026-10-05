// Readings: checkpoint checks and cooling-stage readings, stored in °F. Soft deletes (sync).
import { type Reading, ReadingSchema } from '@templog/shared/schemas';
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { db } from './db';
import { chunks, fromReading, toReading } from './mappers';
import { readings } from './schema';
import { notifyTables } from './store';

export function getReading(id: string): Reading | null {
  const row = db.select().from(readings).where(eq(readings.id, id)).get();
  return row ? toReading(row) : null;
}

/** Live readings of a kitchen with `takenAt` in `[startIso, endIso)`, oldest first; optionally one checkpoint's. */
export function listReadingsBetween(kitchenId: string, startIso: string, endIso: string, checkpointId?: string): Reading[] {
  const where = [
    eq(readings.kitchenId, kitchenId),
    isNull(readings.deletedAt),
    gte(readings.takenAt, startIso),
    lt(readings.takenAt, endIso),
  ];
  if (checkpointId) where.push(eq(readings.checkpointId, checkpointId));
  return db
    .select()
    .from(readings)
    .where(and(...where))
    .orderBy(asc(readings.takenAt))
    .all()
    .map(toReading);
}

/**
 * Live checkpoint readings answering checks scheduled in `[startIso, endIso)` (a reading logged a
 * little after midnight can answer the last check of the previous day).
 */
export function listReadingsForChecksBetween(kitchenId: string, startIso: string, endIso: string): Reading[] {
  return db
    .select()
    .from(readings)
    .where(
      and(
        eq(readings.kitchenId, kitchenId),
        isNull(readings.deletedAt),
        gte(readings.scheduledFor, startIso),
        lt(readings.scheduledFor, endIso),
      ),
    )
    .orderBy(asc(readings.takenAt))
    .all()
    .map(toReading);
}

/** The latest live reading of each checkpoint (Today board). */
export function latestReadingsByCheckpoint(checkpointIds: readonly string[]): Map<string, Reading> {
  const out = new Map<string, Reading>();
  for (const id of checkpointIds) {
    const row = db
      .select()
      .from(readings)
      .where(and(eq(readings.checkpointId, id), isNull(readings.deletedAt)))
      .orderBy(desc(readings.takenAt))
      .limit(1)
      .get();
    if (row) out.set(id, toReading(row));
  }
  return out;
}

/** The most recent readings of one checkpoint, newest first (sparkline, "recent readings" chips). */
export function recentReadings(checkpointId: string, limit = 10): Reading[] {
  return db
    .select()
    .from(readings)
    .where(and(eq(readings.checkpointId, checkpointId), isNull(readings.deletedAt)))
    .orderBy(desc(readings.takenAt))
    .limit(limit)
    .all()
    .map(toReading);
}

/** Live readings of cooling items, oldest first. */
export function listCoolingReadings(itemIds: readonly string[]): Reading[] {
  if (!itemIds.length) return [];
  return chunks(itemIds)
    .flatMap((part) =>
      db
        .select()
        .from(readings)
        .where(and(inArray(readings.coolingItemId, part), isNull(readings.deletedAt)))
        .all()
        .map(toReading),
    )
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** Validates (shared `ReadingSchema`: a fail needs a corrective action) and writes. */
export function saveReading(reading: Reading): Reading {
  const valid = ReadingSchema.parse(reading);
  const row = fromReading(valid);
  db.insert(readings).values(row).onConflictDoUpdate({ target: readings.id, set: row }).run();
  notifyTables('readings');
  return valid;
}

/** Raw rows including tombstones (sync), optionally one kitchen's. */
export function allReadingRows(kitchenId?: string): Reading[] {
  const q = db.select().from(readings);
  return (kitchenId ? q.where(eq(readings.kitchenId, kitchenId)) : q).all().map(toReading);
}

/** Raw rows by id, tombstones included (sync merge). */
export function getReadings(ids: readonly string[]): Reading[] {
  if (!ids.length) return [];
  return chunks(ids).flatMap((part) => db.select().from(readings).where(inArray(readings.id, part)).all().map(toReading));
}

/** Writes pulled rows as-is (sync). */
export function putReadings(rows: readonly Reading[]): void {
  if (!rows.length) return;
  db.transaction((tx) => {
    for (const r of rows) {
      const row = fromReading(r);
      tx.insert(readings).values(row).onConflictDoUpdate({ target: readings.id, set: row }).run();
    }
  });
  notifyTables('readings');
}
