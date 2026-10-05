// Scheduled checks are not stored: they are re-derived from the checkpoints and the kitchen's
// opening hours with shared `expandChecks` (DST-safe, deterministic ids via `checkIdFor`), so every
// phone of a shared kitchen derives the same checks and a cadence edit never rewrites history rows.
// The only per-check state on the device is the "Snooze 15" of a reminder (app-local setting).
import { type Check, expandChecks } from '@templog/shared/schedule';
import type { Checkpoint, Kitchen } from '@templog/shared/schemas';
import { addDaysToKey, type DayKey, dayKeyOf, zonedParts } from '@templog/shared/tz';

import { allCheckpointRows } from './checkpoints-repo';
import { getAppValue, setAppValue } from './settings-repo';
import { nowIso } from './time';

export type { Check } from '@templog/shared/schedule';

/** Days of checks reminders are planned for (today + 2): enough for a weekend without the app. */
export const DEFAULT_EXPANSION_DAYS = 3;

// Expansion goes through Intl (time zones), which is slow on Hermes; the board re-reads every 30 s,
// so results are memoised by kitchen + checkpoint versions + day range (small LRU).
const MEMO_SIZE = 48;
const memo = new Map<string, Check[]>();

/** Checks of the given checkpoints for local days `from…to` (inclusive, kitchen zone), by time. */
export function checksForDays(
  kitchen: Kitchen,
  checkpoints: readonly Checkpoint[],
  from: DayKey,
  to: DayKey,
): Check[] {
  const key = `${kitchen.id}|${kitchen.updatedAt}|${kitchen.tz}|${from}|${to}|${checkpoints.map((c) => `${c.id}@${c.updatedAt}`).join(',')}`;
  const hit = memo.get(key);
  if (hit) {
    memo.delete(key);
    memo.set(key, hit);
    return hit;
  }
  let days = 0;
  for (let k = from; k <= to && days <= 400; k = addDaysToKey(k, 1)) days++;
  const checks = days
    ? checkpoints.flatMap((c) => expandChecks(c, kitchen, from, days)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    : [];
  memo.set(key, checks);
  if (memo.size > MEMO_SIZE) memo.delete(memo.keys().next().value as string);
  return checks;
}

/**
 * Checks of the kitchen's checkpoints (archived ones up to their archive time; deleted ones never)
 * scheduled in `[startIso, endIso)`. Expands the local days covering the window.
 */
export function checksBetween(kitchen: Kitchen, startIso: string, endIso: string, checkpointId?: string): Check[] {
  const checkpoints = allCheckpointRows(kitchen.id).filter((c) => !c.deletedAt && (!checkpointId || c.id === checkpointId));
  // One extra day on each side: an `every` cadence after midnight belongs to the previous day.
  const from = addDaysToKey(dayKeyOf(startIso, kitchen.tz), -1);
  const to = addDaysToKey(dayKeyOf(new Date(Date.parse(endIso) - 1).toISOString(), kitchen.tz), 1);
  return checksForDays(kitchen, checkpoints, from, to).filter((c) => c.scheduledFor >= startIso && c.scheduledFor < endIso);
}

/** Upcoming checks for reminders: `[now, now + days)` (kitchen days). */
export function upcomingChecks(kitchen: Kitchen, days = DEFAULT_EXPANSION_DAYS, now = nowIso()): Check[] {
  return checksBetween(kitchen, now, new Date(Date.parse(now) + days * 86_400_000).toISOString());
}

/** Minutes since midnight of `HH:mm`. */
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * True when the kitchen is open at `at` (kitchen zone): inside today's hours, or inside yesterday's
 * hours when they run past midnight. `open === close` means around the clock; null = closed.
 */
export function isOpenAt(kitchen: Kitchen, at: string | number): boolean {
  const p = zonedParts(at, kitchen.tz);
  const minute = p.hour * 60 + p.minute;
  const today = kitchen.openingHours[p.weekday];
  if (today) {
    const open = minutesOf(today.open);
    const close = minutesOf(today.close);
    if (open === close) return true;
    if (close > open ? minute >= open && minute < close : minute >= open) return true;
  }
  const yesterday = kitchen.openingHours[(p.weekday + 6) % 7];
  if (yesterday) {
    const open = minutesOf(yesterday.open);
    const close = minutesOf(yesterday.close);
    if (close < open && minute < close) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Snoozes ("Snooze 15" on a check reminder)

const SNOOZE_KEY = 'checkSnoozes';

/** Check id → ISO instant its reminder re-fires. Expired entries are dropped on write. */
export function getCheckSnoozes(): Record<string, string> {
  const value = getAppValue<Record<string, string> | null>(SNOOZE_KEY, null);
  return value && typeof value === 'object' ? value : {};
}

export function setCheckSnoozes(ids: readonly string[], until: string | null): void {
  const now = nowIso();
  const next: Record<string, string> = {};
  for (const [id, at] of Object.entries(getCheckSnoozes())) if (at > now) next[id] = at;
  for (const id of ids) {
    if (until) next[id] = until;
    else delete next[id];
  }
  const current = getCheckSnoozes();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  setAppValue(SNOOZE_KEY, Object.keys(next).length ? next : undefined);
}

/** Drops expired snoozes (maintenance). */
export function pruneCheckSnoozes(): void {
  setCheckSnoozes([], null);
}
