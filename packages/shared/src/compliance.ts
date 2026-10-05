/** Compliance roll-ups over checks (from `expandChecks`) and readings. */
import { type Check, classifyChecks, DEFAULT_GRACE_MINUTES } from "./schedule";
import type { Reading, ReadingResult } from "./schemas";
import { addDaysToKey, type DayKey, dayKeyOf, type IsoString } from "./tz";
import { roundTenth } from "./units";

export interface DailyCompliance {
  /** Checks scheduled that local day (with `now`: minus unlogged checks still upcoming or due). */
  scheduled: number;
  /** Scheduled checks with at least one reading (late ones included). */
  logged: number;
  /** Logged checks whose first reading was within ±grace of `scheduledFor`. */
  onTime: number;
  /** Failing checkpoint readings taken that local day, scheduled or ad-hoc (re-checks count separately). */
  failed: number;
  /** logged / scheduled; null when nothing was scheduled. */
  rate: number | null;
}

export interface ComplianceOptions {
  /** Exclude unlogged checks that are not yet past their grace period (for "today so far"). */
  now?: IsoString;
  graceMinutes?: number;
}

const liveCheckpointReading = (r: Reading) => !r.deletedAt && !!r.checkpointId;

export function dailyCompliance(
  checks: readonly Check[],
  readings: readonly Reading[],
  dayKey: DayKey,
  tz: string,
  options: ComplianceOptions = {},
): DailyCompliance {
  const dayChecks = checks.filter((c) => dayKeyOf(c.scheduledFor, tz) === dayKey);
  // Far future: every unlogged check is past due, so only `logged` and `onTime` matter.
  const entries = classifyChecks(dayChecks, readings, options.now ?? "9999-12-31T00:00:00.000Z", options.graceMinutes ?? DEFAULT_GRACE_MINUTES);
  const counted = entries.filter((e) => e.state !== "upcoming" && e.state !== "due");
  const scheduled = counted.length;
  const logged = counted.filter((e) => e.state === "logged").length;
  const onTime = counted.filter((e) => e.onTime).length;
  const failed = readings.filter((r) => liveCheckpointReading(r) && r.result === "fail" && dayKeyOf(r.takenAt, tz) === dayKey).length;
  return { scheduled, logged, onTime, failed, rate: scheduled ? logged / scheduled : null };
}

export interface WeeklyCompliance extends DailyCompliance {
  days: (DailyCompliance & { dayKey: DayKey })[];
}

/** Seven days from `startDayKey`, plus totals (rate = total logged / total scheduled). */
export function weeklyCompliance(
  checks: readonly Check[],
  readings: readonly Reading[],
  startDayKey: DayKey,
  tz: string,
  options: ComplianceOptions = {},
): WeeklyCompliance {
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayKey = addDaysToKey(startDayKey, i);
    return { dayKey, ...dailyCompliance(checks, readings, dayKey, tz, options) };
  });
  const sum = (k: "scheduled" | "logged" | "onTime" | "failed") => days.reduce((n, d) => n + d[k], 0);
  const scheduled = sum("scheduled");
  const logged = sum("logged");
  return { days, scheduled, logged, onTime: sum("onTime"), failed: sum("failed"), rate: scheduled ? logged / scheduled : null };
}

export interface SparkPoint {
  takenAt: IsoString;
  valueF: number;
  result: ReadingResult;
}

export interface CheckpointStats {
  count: number;
  min: number | null;
  max: number | null;
  /** Mean to 0.1 °F. */
  avg: number | null;
  fails: number;
  /** Oldest first. */
  points: SparkPoint[];
}

/** Stats over a checkpoint's readings in the last `days` local days (today included). */
export function checkpointStats(
  readings: readonly Reading[],
  checkpointId: string,
  days: number,
  now: IsoString,
  tz: string,
): CheckpointStats {
  const today = dayKeyOf(now, tz);
  const first = addDaysToKey(today, -(days - 1));
  const rows = readings
    .filter((r) => !r.deletedAt && r.checkpointId === checkpointId)
    .filter((r) => {
      const k = dayKeyOf(r.takenAt, tz);
      return k >= first && k <= today;
    })
    .sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  if (!rows.length) return { count: 0, min: null, max: null, avg: null, fails: 0, points: [] };
  const values = rows.map((r) => r.valueF);
  return {
    count: rows.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: roundTenth(values.reduce((a, b) => a + b, 0) / values.length),
    fails: rows.filter((r) => r.result === "fail").length,
    points: rows.map((r) => ({ takenAt: r.takenAt, valueF: r.valueF, result: r.result })),
  };
}

/**
 * Consecutive fully logged days (every scheduled check has a reading) ending at `todayKey`.
 * An incomplete today does not break the streak; days with nothing scheduled are skipped.
 * Looks back no further than the earliest check, so pass checks covering the span you care about.
 */
export function fullyLoggedStreak(
  checks: readonly Check[],
  readings: readonly Reading[],
  todayKey: DayKey,
  tz: string,
): number {
  if (!checks.length) return 0;
  const earliest = checks.reduce((min, c) => {
    const k = dayKeyOf(c.scheduledFor, tz);
    return k < min ? k : min;
  }, todayKey);
  let streak = 0;
  for (let key = todayKey; key >= earliest; key = addDaysToKey(key, -1)) {
    const d = dailyCompliance(checks, readings, key, tz);
    if (d.scheduled === 0) continue;
    if (d.logged === d.scheduled) streak++;
    else if (key !== todayKey) break;
  }
  return streak;
}
