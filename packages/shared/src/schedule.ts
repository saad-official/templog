/** Check schedule: checkpoint cadence + kitchen opening hours → concrete check instants, DST-safe. */
import { idFromKey } from "./ids";
import type { Checkpoint, Kitchen, Reading } from "./schemas";
import { addDaysToKey, type DayKey, dayKeyOf, type IsoString, weekdayOfKey, zonedInstant } from "./tz";

const MINUTE = 60_000;
const DAY_MINUTES = 1440;
const iso = (ms: number): IsoString => new Date(ms).toISOString();
const ms = (at: IsoString | number) => (typeof at === "number" ? at : Date.parse(at));

/** Default minutes a check stays "due" (on time) after `scheduledFor`, and may be logged early. */
export const DEFAULT_GRACE_MINUTES = 30;
/** Default minutes after which an unlogged check with no later check counts as missed. */
export const DEFAULT_MISSED_AFTER_MINUTES = 240;

/** A scheduled check. Not stored: re-derived from the checkpoint and kitchen whenever needed. */
export interface Check {
  /** `checkIdFor(checkpointId, scheduledFor)`. */
  id: string;
  checkpointId: string;
  kitchenId: string;
  scheduledFor: IsoString;
  /** Local calendar day of `scheduledFor` in the kitchen zone. */
  dayKey: DayKey;
}

/** Deterministic check id: UUIDv7 with `scheduledFor` as its timestamp, rest hashed from the checkpoint id. */
export function checkIdFor(checkpointId: string, scheduledFor: IsoString | number): string {
  return idFromKey(ms(scheduledFor), checkpointId);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toHhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Wall-clock (day offset, minute-of-day) slots for one opening day. */
function wallSlots(checkpoint: Checkpoint, open: string, close: string): number[] {
  const cadence = checkpoint.cadence;
  if (cadence.kind === "times") return cadence.times.map(toMinutes);
  const start = toMinutes(open);
  let end = toMinutes(close);
  if (end <= start) end += DAY_MINUTES; // closes after midnight; open == close = around the clock
  const step = cadence.hours * 60;
  const out: number[] = [];
  for (let k = 0; start + k * step < end; k++) out.push(Math.round(start + k * step));
  return out;
}

/**
 * Checks for `days` local days from `fromDayKey` in the kitchen zone.
 * - `every`: from opening time in steps of N wall-clock hours, strictly before closing time
 *   (a kitchen that closes after midnight keeps stepping into the next calendar day).
 * - `times`: each fixed time on the calendar day, on days the kitchen opens.
 * - Closed days (`openingHours[weekday] === null`) have no checks.
 * - DST: wall-clock times stay put; a time in a spring-forward gap moves forward by the gap
 *   (02:00 → 03:00); a repeated fall-back time uses its first occurrence. Collisions collapse.
 * - Checks before the checkpoint's `createdAt` or at/after its `archivedAt` are dropped;
 *   a deleted checkpoint has none.
 * Ids come from `checkIdFor`, so expansion is idempotent.
 */
export function expandChecks(checkpoint: Checkpoint, kitchen: Kitchen, fromDayKey: DayKey, days: number): Check[] {
  if (checkpoint.deletedAt || days <= 0) return [];
  const created = ms(checkpoint.createdAt);
  const archived = checkpoint.archivedAt ? ms(checkpoint.archivedAt) : Infinity;
  const instants = new Set<number>();
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(fromDayKey, i);
    const hours = kitchen.openingHours[weekdayOfKey(key)];
    if (!hours) continue;
    for (const minute of wallSlots(checkpoint, hours.open, hours.close)) {
      const dayOffset = Math.floor(minute / DAY_MINUTES);
      const t = zonedInstant(addDaysToKey(key, dayOffset), toHhmm(minute % DAY_MINUTES), kitchen.tz);
      if (t >= created && t < archived) instants.add(t);
    }
  }
  return [...instants]
    .sort((a, b) => a - b)
    .map((t) => ({
      id: checkIdFor(checkpoint.id, t),
      checkpointId: checkpoint.id,
      kitchenId: kitchen.id,
      scheduledFor: iso(t),
      dayKey: dayKeyOf(t, kitchen.tz),
    }));
}

export type CheckState = "upcoming" | "due" | "overdue" | "missed" | "logged";

export interface CheckEntry {
  check: Check;
  state: CheckState;
  /** Latest non-deleted reading answering the check (a re-check after a fail supersedes the first). */
  reading: Reading | null;
  /** Every non-deleted reading answering the check, oldest first. */
  readings: Reading[];
  /** Whether the first reading was within ±grace of `scheduledFor`; null when unlogged. */
  onTime: boolean | null;
}

const slotKey = (checkpointId: string, at: number) => `${checkpointId}|${at}`;

/** Non-deleted checkpoint readings with a `scheduledFor`, grouped by check slot, oldest first. */
export function readingsBySlot(readings: readonly Reading[]): Map<string, Reading[]> {
  const out = new Map<string, Reading[]>();
  for (const r of readings) {
    if (r.deletedAt || !r.checkpointId || !r.scheduledFor) continue;
    const k = slotKey(r.checkpointId, ms(r.scheduledFor));
    const list = out.get(k) ?? [];
    list.push(r);
    out.set(k, list);
  }
  for (const list of out.values()) list.sort((a, b) => ms(a.takenAt) - ms(b.takenAt));
  return out;
}

/**
 * State of each check at `now`, ordered by `scheduledFor`. A reading answers a check when its
 * `checkpointId` matches and its `scheduledFor` is the same instant. Unlogged checks are:
 * upcoming before `scheduledFor`; due until `scheduledFor + grace` (inclusive); then overdue
 * until the same checkpoint's next check comes due or `missedAfterMinutes` pass; then missed.
 */
export function classifyChecks(
  checks: readonly Check[],
  readings: readonly Reading[],
  now: IsoString,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  missedAfterMinutes = DEFAULT_MISSED_AFTER_MINUTES,
): CheckEntry[] {
  const t = ms(now);
  const grace = graceMinutes * MINUTE;
  const slots = readingsBySlot(readings);
  const sorted = [...checks].sort((a, b) => ms(a.scheduledFor) - ms(b.scheduledFor));
  const nextOf = new Map<string, number>();
  const lastSeen = new Map<string, Check>();
  for (const c of sorted) {
    const prev = lastSeen.get(c.checkpointId);
    if (prev) nextOf.set(prev.id, ms(c.scheduledFor));
    lastSeen.set(c.checkpointId, c);
  }
  return sorted.map((check) => {
    const at = ms(check.scheduledFor);
    const list = slots.get(slotKey(check.checkpointId, at)) ?? [];
    if (list.length) {
      const first = list[0] as Reading;
      return {
        check,
        state: "logged",
        reading: list[list.length - 1] as Reading,
        readings: list,
        onTime: Math.abs(ms(first.takenAt) - at) <= grace,
      };
    }
    let state: CheckState;
    if (t < at) state = "upcoming";
    else if (t <= at + grace) state = "due";
    else {
      const next = nextOf.get(check.id);
      const superseded = next !== undefined && next <= t;
      state = superseded || t >= at + missedAfterMinutes * MINUTE ? "missed" : "overdue";
    }
    return { check, state, reading: null, readings: [], onTime: null };
  });
}

export interface DueChecks {
  upcoming: Check[];
  due: Check[];
  overdue: Check[];
  missed: Check[];
  logged: Check[];
}

/** `classifyChecks` grouped by state, each group ordered by `scheduledFor`. */
export function dueChecks(
  checks: readonly Check[],
  readings: readonly Reading[],
  now: IsoString,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  missedAfterMinutes = DEFAULT_MISSED_AFTER_MINUTES,
): DueChecks {
  const out: DueChecks = { upcoming: [], due: [], overdue: [], missed: [], logged: [] };
  for (const e of classifyChecks(checks, readings, now, graceMinutes, missedAfterMinutes)) out[e.state].push(e.check);
  return out;
}

export interface NextCheck {
  check: Check;
  state: "due" | "overdue" | "upcoming";
  /** Whole minutes until `scheduledFor`, rounded up; negative once it has passed. */
  minutesUntil: number;
}

/** The check to act on: the earliest due/overdue one, else the earliest upcoming one; null if none. */
export function nextCheck(
  checks: readonly Check[],
  readings: readonly Reading[],
  now: IsoString,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  missedAfterMinutes = DEFAULT_MISSED_AFTER_MINUTES,
): NextCheck | null {
  const entries = classifyChecks(checks, readings, now, graceMinutes, missedAfterMinutes);
  const pick =
    entries.find((e) => e.state === "due" || e.state === "overdue") ?? entries.find((e) => e.state === "upcoming");
  if (!pick) return null;
  const minutes = Math.ceil((ms(pick.check.scheduledFor) - ms(now)) / MINUTE);
  return { check: pick.check, state: pick.state as NextCheck["state"], minutesUntil: minutes === 0 ? 0 : minutes };
}

/**
 * The check a reading of `checkpointId` taken at `takenAt` should answer (its `scheduledFor`):
 * the earliest unlogged check it is on time for (within ±grace), else the earliest open
 * (due/overdue) one; null means an ad-hoc reading.
 */
export function checkForReading(
  checks: readonly Check[],
  readings: readonly Reading[],
  checkpointId: string,
  takenAt: IsoString,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  missedAfterMinutes = DEFAULT_MISSED_AFTER_MINUTES,
): Check | null {
  const t = ms(takenAt);
  const grace = graceMinutes * MINUTE;
  const open = classifyChecks(
    checks.filter((c) => c.checkpointId === checkpointId),
    readings,
    takenAt,
    graceMinutes,
    missedAfterMinutes,
  ).filter((e) => e.state === "upcoming" || e.state === "due" || e.state === "overdue");
  const onTime = open.find((e) => Math.abs(ms(e.check.scheduledFor) - t) <= grace);
  if (onTime) return onTime.check;
  return open.find((e) => e.state !== "upcoming")?.check ?? null;
}

/** Unlogged checks that are past saving at `now` (see `classifyChecks`). Never filled in silently. */
export function missedChecks(
  checks: readonly Check[],
  readings: readonly Reading[],
  now: IsoString,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  missedAfterMinutes = DEFAULT_MISSED_AFTER_MINUTES,
): Check[] {
  return dueChecks(checks, readings, now, graceMinutes, missedAfterMinutes).missed;
}
