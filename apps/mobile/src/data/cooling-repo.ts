// Cooling items (two-stage cooling timers). Status transitions come from shared `cooling.ts`.
import { type CoolingItem, CoolingItemSchema } from '@templog/shared/schemas';
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { db } from './db';
import { chunks, fromCoolingItem, newId, toCoolingItem } from './mappers';
import { coolingItems } from './schema';
import { notifyTables } from './store';
import { nowIso } from './time';

/** Statuses with an open stage (timer running). */
export const ACTIVE_COOLING_STATUSES: CoolingItem['status'][] = ['cooling', 'stage1-pass'];

export function getCoolingItem(id: string): CoolingItem | null {
  const row = db.select().from(coolingItems).where(eq(coolingItems.id, id)).get();
  return row ? toCoolingItem(row) : null;
}

/** Items with a running timer, oldest first. */
export function listActiveCoolingItems(kitchenId: string): CoolingItem[] {
  return db
    .select()
    .from(coolingItems)
    .where(
      and(
        eq(coolingItems.kitchenId, kitchenId),
        isNull(coolingItems.deletedAt),
        inArray(coolingItems.status, ACTIVE_COOLING_STATUSES),
      ),
    )
    .orderBy(asc(coolingItems.startedAt))
    .all()
    .map(toCoolingItem);
}

/** Items started in `[startIso, endIso)` (any status), newest first (History, reports). */
export function listCoolingItemsBetween(kitchenId: string, startIso: string, endIso: string): CoolingItem[] {
  return db
    .select()
    .from(coolingItems)
    .where(
      and(
        eq(coolingItems.kitchenId, kitchenId),
        isNull(coolingItems.deletedAt),
        gte(coolingItems.startedAt, startIso),
        lt(coolingItems.startedAt, endIso),
      ),
    )
    .orderBy(desc(coolingItems.startedAt))
    .all()
    .map(toCoolingItem);
}

export type CoolingItemInput = {
  kitchenId: string;
  name: string;
  startedAt?: string;
  startValueF?: number | null;
  initials?: string | null;
};

export function insertCoolingItem(input: CoolingItemInput): CoolingItem {
  const at = nowIso();
  const item = CoolingItemSchema.parse({
    id: newId(),
    kitchenId: input.kitchenId,
    name: input.name,
    startedAt: input.startedAt ?? at,
    startValueF: input.startValueF ?? null,
    stage1ReadingId: null,
    stage1At: null,
    stage2ReadingId: null,
    status: 'cooling',
    completedAt: null,
    failedAt: null,
    failReason: null,
    discardedAt: null,
    correctiveAction: null,
    initials: input.initials ?? null,
    note: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  db.insert(coolingItems).values(fromCoolingItem(item)).run();
  notifyTables('cooling_items');
  return item;
}

/** Validates and writes a full item. */
export function saveCoolingItem(item: CoolingItem): CoolingItem {
  const valid = CoolingItemSchema.parse(item);
  const row = fromCoolingItem(valid);
  db.insert(coolingItems).values(row).onConflictDoUpdate({ target: coolingItems.id, set: row }).run();
  notifyTables('cooling_items');
  return valid;
}

/** Raw rows including tombstones (sync), optionally one kitchen's. */
export function allCoolingItemRows(kitchenId?: string): CoolingItem[] {
  const q = db.select().from(coolingItems);
  return (kitchenId ? q.where(eq(coolingItems.kitchenId, kitchenId)) : q).all().map(toCoolingItem);
}

export function getCoolingItems(ids: readonly string[]): CoolingItem[] {
  if (!ids.length) return [];
  return chunks(ids).flatMap((part) =>
    db.select().from(coolingItems).where(inArray(coolingItems.id, part)).all().map(toCoolingItem),
  );
}

/** Writes pulled rows as-is (sync). */
export function putCoolingItems(rows: readonly CoolingItem[]): void {
  if (!rows.length) return;
  db.transaction((tx) => {
    for (const c of rows) {
      const row = fromCoolingItem(c);
      tx.insert(coolingItems).values(row).onConflictDoUpdate({ target: coolingItems.id, set: row }).run();
    }
  });
  notifyTables('cooling_items');
}
