// Row ↔ domain mapping. Domain types and validation come from @templog/shared.
import { newIdFrom } from '@templog/shared/ids';
import {
  type Cadence,
  CadenceSchema,
  type Checkpoint,
  type CheckpointKind,
  type CoolingItem,
  type CoolingStatus,
  type CorrectiveAction,
  CorrectiveActionSchema,
  type Kitchen,
  type OpeningHours,
  OpeningHoursSchema,
  type Reading,
  type ReadingSource,
} from '@templog/shared/schemas';
import * as Crypto from 'expo-crypto';

import type { CheckpointRow, CoolingItemRow, KitchenRow, ReadingRow } from './schema';

/** New random UUIDv7 (kitchens, checkpoints, readings, cooling items). */
export function newId(at: number = Date.now()): string {
  return newIdFrom(at, Crypto.getRandomBytes(10));
}

/** Open 06:00–22:00 every day: the default for a new kitchen (editable in Settings). */
export const DEFAULT_OPENING_HOURS: OpeningHours = Array.from({ length: 7 }, () => ({ open: '06:00', close: '22:00' }));

const parseJson = (json: string | null): unknown => {
  if (json === null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

/** A corrupt value degrades to the defaults (logged) instead of crashing every screen. */
export function parseOpeningHours(json: string): OpeningHours {
  const parsed = OpeningHoursSchema.safeParse(parseJson(json));
  if (parsed.success) return parsed.data;
  console.warn('[data] invalid opening hours JSON; using defaults');
  return DEFAULT_OPENING_HOURS;
}

/** A corrupt cadence degrades to fixed 09:00 checks. */
export function parseCadence(json: string): Cadence {
  const parsed = CadenceSchema.safeParse(parseJson(json));
  if (parsed.success) return parsed.data;
  console.warn('[data] invalid cadence JSON; using 09:00');
  return { kind: 'times', times: ['09:00'] };
}

function parseCorrectiveAction(json: string | null): CorrectiveAction | null {
  if (json === null) return null;
  const parsed = CorrectiveActionSchema.safeParse(parseJson(json));
  return parsed.success ? parsed.data : { kind: 'other', note: String(json).slice(0, 500) };
}

const optional = (n: number | null): number | undefined => (n === null ? undefined : n);

export function toKitchen(r: KitchenRow): Kitchen {
  return {
    id: r.id,
    name: r.name,
    tz: r.tz,
    unit: r.unit,
    openingHours: parseOpeningHours(r.openingHoursJson),
    ownerUserId: r.ownerUserId,
    joinCode: r.joinCode,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromKitchen(k: Kitchen): KitchenRow {
  return {
    id: k.id,
    name: k.name,
    tz: k.tz,
    unit: k.unit,
    openingHoursJson: JSON.stringify(OpeningHoursSchema.parse(k.openingHours)),
    ownerUserId: k.ownerUserId ?? null,
    joinCode: k.joinCode ?? null,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    deletedAt: k.deletedAt ?? null,
  };
}

export function toCheckpoint(r: CheckpointRow): Checkpoint {
  const limits: Checkpoint['limits'] = {};
  if (r.minF !== null) limits.min = r.minF;
  if (r.maxF !== null) limits.max = r.maxF;
  return {
    id: r.id,
    kitchenId: r.kitchenId,
    name: r.name,
    kind: r.kind as CheckpointKind,
    limits,
    cadence: parseCadence(r.cadenceJson),
    sortOrder: r.sortOrder,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromCheckpoint(c: Checkpoint): CheckpointRow {
  return {
    id: c.id,
    kitchenId: c.kitchenId,
    name: c.name,
    kind: c.kind,
    minF: c.limits.min ?? null,
    maxF: c.limits.max ?? null,
    cadenceJson: JSON.stringify(CadenceSchema.parse(c.cadence)),
    sortOrder: c.sortOrder,
    archivedAt: c.archivedAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt ?? null,
  };
}

export function toReading(r: ReadingRow): Reading {
  return {
    id: r.id,
    kitchenId: r.kitchenId,
    checkpointId: r.checkpointId,
    coolingItemId: r.coolingItemId,
    scheduledFor: r.scheduledFor,
    takenAt: r.takenAt,
    valueF: r.valueF,
    result: r.result,
    failReason: r.failReason,
    correctiveAction: parseCorrectiveAction(r.correctiveActionJson),
    initials: r.initials,
    source: r.source as ReadingSource,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromReading(r: Reading): ReadingRow {
  return {
    id: r.id,
    kitchenId: r.kitchenId,
    checkpointId: r.checkpointId ?? null,
    coolingItemId: r.coolingItemId ?? null,
    scheduledFor: r.scheduledFor ?? null,
    takenAt: r.takenAt,
    valueF: r.valueF,
    result: r.result,
    failReason: r.failReason ?? null,
    correctiveActionJson: r.correctiveAction ? JSON.stringify(r.correctiveAction) : null,
    initials: r.initials,
    source: r.source,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt ?? null,
  };
}

export function toCoolingItem(r: CoolingItemRow): CoolingItem {
  return {
    id: r.id,
    kitchenId: r.kitchenId,
    name: r.name,
    startedAt: r.startedAt,
    startValueF: optional(r.startValueF) ?? null,
    stage1ReadingId: r.stage1ReadingId,
    stage1At: r.stage1At,
    stage2ReadingId: r.stage2ReadingId,
    status: r.status as CoolingStatus,
    completedAt: r.completedAt,
    failedAt: r.failedAt,
    failReason: r.failReason,
    discardedAt: r.discardedAt,
    correctiveAction: parseCorrectiveAction(r.correctiveActionJson),
    initials: r.initials,
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromCoolingItem(c: CoolingItem): CoolingItemRow {
  return {
    id: c.id,
    kitchenId: c.kitchenId,
    name: c.name,
    startedAt: c.startedAt,
    startValueF: c.startValueF ?? null,
    stage1ReadingId: c.stage1ReadingId ?? null,
    stage1At: c.stage1At ?? null,
    stage2ReadingId: c.stage2ReadingId ?? null,
    status: c.status,
    completedAt: c.completedAt ?? null,
    failedAt: c.failedAt ?? null,
    failReason: c.failReason ?? null,
    discardedAt: c.discardedAt ?? null,
    correctiveActionJson: c.correctiveAction ? JSON.stringify(c.correctiveAction) : null,
    initials: c.initials ?? null,
    note: c.note ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt ?? null,
  };
}

/** Chunks for `IN (...)` lists and batched inserts (SQLite variable limit). */
export function chunks<T>(xs: readonly T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
