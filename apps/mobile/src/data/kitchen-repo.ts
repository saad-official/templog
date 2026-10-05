// Kitchens. The device works in one *active* kitchen at a time (app value `activeKitchenId`): a
// local kitchen created on first launch, which becomes the shared kitchen when the owner creates it
// on the server (same id), or the server kitchen a member joined with a code.
import { type Kitchen, KitchenSchema, type OpeningHours } from '@templog/shared/schemas';
import type { Unit } from '@templog/shared/units';
import { asc, eq, isNull } from 'drizzle-orm';

import { db } from './db';
import { DEFAULT_OPENING_HOURS, fromKitchen, newId, toKitchen } from './mappers';
import { kitchens } from './schema';
import { getAppValue, setAppValue } from './settings-repo';
import { notifyTables } from './store';
import { deviceTimeZone, nowIso } from './time';

const ACTIVE_KEY = 'activeKitchenId';

export function getKitchen(id: string): Kitchen | null {
  const row = db.select().from(kitchens).where(eq(kitchens.id, id)).get();
  return row ? toKitchen(row) : null;
}

/** Live kitchens on this device, oldest first. */
export function listKitchens(): Kitchen[] {
  return db.select().from(kitchens).where(isNull(kitchens.deletedAt)).orderBy(asc(kitchens.createdAt)).all().map(toKitchen);
}

/** The kitchen the app shows and logs into, or null before `ensureKitchen()` ran. */
export function getActiveKitchen(): Kitchen | null {
  const id = getAppValue<string | null>(ACTIVE_KEY, null);
  const active = id ? getKitchen(id) : null;
  if (active && !active.deletedAt) return active;
  return listKitchens()[0] ?? null;
}

export function getActiveKitchenId(): string | null {
  return getActiveKitchen()?.id ?? null;
}

export function setActiveKitchen(id: string): void {
  setAppValue(ACTIVE_KEY, id);
  notifyTables('kitchens');
}

export type KitchenInput = { name?: string; tz?: string; unit?: Unit; openingHours?: OpeningHours };

/** Creates a local kitchen (device zone, °F, open 06:00–22:00) and makes it active. */
export function createKitchen(input: KitchenInput = {}): Kitchen {
  const at = nowIso();
  const kitchen = KitchenSchema.parse({
    id: newId(),
    name: input.name ?? 'My kitchen',
    tz: input.tz ?? deviceTimeZone(),
    unit: input.unit ?? 'F',
    openingHours: input.openingHours ?? DEFAULT_OPENING_HOURS,
    ownerUserId: null,
    joinCode: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  db.insert(kitchens).values(fromKitchen(kitchen)).run();
  setAppValue(ACTIVE_KEY, kitchen.id);
  notifyTables('kitchens');
  return kitchen;
}

/** The active kitchen, created on first call. Idempotent; run at startup before anything else. */
export function ensureKitchen(): Kitchen {
  return getActiveKitchen() ?? createKitchen();
}

/** Validates and writes a full kitchen. */
export function saveKitchen(kitchen: Kitchen): Kitchen {
  const valid = KitchenSchema.parse(kitchen);
  const row = fromKitchen(valid);
  db.insert(kitchens).values(row).onConflictDoUpdate({ target: kitchens.id, set: row }).run();
  notifyTables('kitchens');
  return valid;
}

export type KitchenPatch = Partial<Pick<Kitchen, 'name' | 'tz' | 'unit' | 'openingHours' | 'ownerUserId' | 'joinCode'>>;

export function patchKitchen(id: string, patch: KitchenPatch): Kitchen {
  const current = getKitchen(id);
  if (!current) throw new Error(`Kitchen ${id} not found`);
  return saveKitchen({ ...current, ...patch, updatedAt: nowIso() });
}

/** Raw rows including tombstones (sync). */
export function allKitchenRows(): Kitchen[] {
  return db.select().from(kitchens).all().map(toKitchen);
}

/** Writes pulled rows as-is (sync). */
export function putKitchens(rows: readonly Kitchen[]): void {
  if (!rows.length) return;
  db.transaction((tx) => {
    for (const k of rows) {
      const row = fromKitchen(k);
      tx.insert(kitchens).values(row).onConflictDoUpdate({ target: kitchens.id, set: row }).run();
    }
  });
  notifyTables('kitchens');
}
