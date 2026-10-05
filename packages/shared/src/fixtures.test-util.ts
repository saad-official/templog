import type { Checkpoint, CoolingItem, Kitchen, OpeningDay, Reading } from "./schemas";

export const KITCHEN_ID = "0199b3a0-0000-7000-8000-0000000000a1";
export const CP_FRIDGE = "0199b3a0-0000-7000-8000-0000000000b1";
export const CP_HOT = "0199b3a0-0000-7000-8000-0000000000b2";
export const CREATED = "2026-01-01T00:00:00.000Z";
export const TZ = "America/Toronto";

const day: OpeningDay = { open: "07:00", close: "23:00" };

/** Toronto kitchen open 07:00–23:00 every day unless overridden. */
export function makeKitchen(overrides: Partial<Kitchen> = {}): Kitchen {
  return {
    id: KITCHEN_ID,
    name: "Corner Café",
    tz: TZ,
    unit: "F",
    openingHours: [day, day, day, day, day, day, day],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: CP_FRIDGE,
    kitchenId: KITCHEN_ID,
    name: "Walk-in fridge",
    kind: "cold-holding",
    limits: { max: 41 },
    cadence: { kind: "every", hours: 4 },
    sortOrder: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

let seq = 0;
const nextId = () => `0199b3a0-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

/** A passing checkpoint reading taken at `takenAt`. */
export function makeReading(takenAt: string, overrides: Partial<Reading> = {}): Reading {
  return {
    id: nextId(),
    checkpointId: CP_FRIDGE,
    coolingItemId: null,
    kitchenId: KITCHEN_ID,
    scheduledFor: null,
    takenAt,
    valueF: 38,
    result: "pass",
    failReason: null,
    correctiveAction: null,
    initials: "SK",
    source: "manual",
    createdAt: takenAt,
    updatedAt: takenAt,
    deletedAt: null,
    ...overrides,
  };
}

export function makeCooling(startedAt: string, overrides: Partial<CoolingItem> = {}): CoolingItem {
  return {
    id: nextId(),
    kitchenId: KITCHEN_ID,
    name: "Chili",
    startedAt,
    status: "cooling",
    createdAt: startedAt,
    updatedAt: startedAt,
    ...overrides,
  };
}

export const plusMin = (at: string, minutes: number) => new Date(Date.parse(at) + minutes * 60_000).toISOString();
