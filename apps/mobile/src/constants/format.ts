// Locale-aware display formatting for the UI (no domain maths: limits, cooling and reports live in
// @templog/shared; temperatures always go through shared `formatTemp` / `displayTemp`).
import { formatMinutes } from '@templog/shared/cooling';
import type { Cadence } from '@templog/shared/schemas';
import type { DayKey } from '@templog/shared/tz';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayLongFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const dayShortFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayNumberFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', timeZone: 'UTC' });
const weekdayShortFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const weekdayNarrowFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' });

/** `08:30` → `8:30 AM` / `08:30` per device locale. */
export function formatHhmm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return timeFormat.format(new Date(2000, 0, 1, h ?? 0, m ?? 0));
}

/** Local wall-clock `HH:mm` of a Date. */
export function toHhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** `HH:mm` → a Date today at that local time (for time pickers). */
export function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 8, m ?? 0, 0, 0);
  return d;
}

function keyToUtcDate(key: DayKey): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** `2026-10-05` → `Monday, October 5`. */
export function formatDayLong(key: DayKey): string {
  return dayLongFormat.format(keyToUtcDate(key));
}

/** `2026-10-05` → `Oct 5`. */
export function formatDayShort(key: DayKey): string {
  return dayShortFormat.format(keyToUtcDate(key));
}

/** `2026-10-05` → `5`. */
export function formatDayNumber(key: DayKey): string {
  return dayNumberFormat.format(keyToUtcDate(key));
}

/** `2026-10-05` → `Mon`. */
export function weekdayOfKeyShort(key: DayKey): string {
  return weekdayShortFormat.format(keyToUtcDate(key));
}

// 2023-01-01 was a Sunday: index 0..6 = Sunday..Saturday, matching opening-hours indexes.
const WEEK_BASE = Date.UTC(2023, 0, 1, 12);
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export function weekdayShort(day: number): string {
  return weekdayShortFormat.format(new Date(WEEK_BASE + day * 86_400_000));
}
export function weekdayNarrow(day: number): string {
  return weekdayNarrowFormat.format(new Date(WEEK_BASE + day * 86_400_000));
}

/** `0.923` → `92%`; null → `–`. */
export function formatPercent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '–' : `${Math.round(rate * 100)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Minutes until a check: `in 25 m`, `now`, `12 m overdue`. */
export function relativeMinutes(minutes: number): string {
  if (minutes === 0) return 'now';
  return minutes > 0 ? `in ${formatMinutes(minutes)}` : `${formatMinutes(minutes)} ago`;
}

/** Whole minutes from now until `iso` (rounded up; negative once passed). */
export function minutesUntil(iso: string, now: number = Date.now()): number {
  const m = Math.ceil((Date.parse(iso) - now) / 60_000);
  return m === 0 ? 0 : m;
}

/** One line describing a cadence: `Every 4 h while open` / `8:00 AM, 2:00 PM`. */
export function cadenceSummary(cadence: Cadence): string {
  if (cadence.kind === 'every') {
    const h = cadence.hours;
    const label = h < 1 ? `${Math.round(h * 60)} min` : `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
    return `Every ${label} while open`;
  }
  return [...cadence.times].sort().map(formatHhmm).join(', ');
}

/** Spoken digits for codes: `K 7 Q 2`. */
export function spelled(code: string): string {
  return code.split('').join(' ');
}
