// Read models for the UI and the native surfaces. Pure functions over repositories (hooks wrap them
// in live queries; widgets, notifications and the background task call them directly).
import { type Check, type CheckEntry, classifyChecks, DEFAULT_MISSED_AFTER_MINUTES, nextCheck, type NextCheck } from '@templog/shared/schedule';
import { type CheckpointStats, checkpointStats, type DailyCompliance, dailyCompliance, fullyLoggedStreak } from '@templog/shared/compliance';
import {
  type CoolingDeadlines,
  coolingDeadlines,
  coolingLabel,
  coolingProgress,
  type CoolingPrompt,
  nextCoolingPrompt,
} from '@templog/shared/cooling';
import { checkpointTone, kindLabel, limitsLabel } from '@templog/shared/limits';
import { type RangeReportModel, rangeReportModel } from '@templog/shared/report';
import type { Checkpoint, CoolingItem, Kitchen, Reading, Settings } from '@templog/shared/schemas';
import { addDaysToKey, type DayKey, dayKeyOf } from '@templog/shared/tz';
import type { Unit } from '@templog/shared/units';

import { allCheckpointRows, getCheckpoint, listCheckpoints } from './checkpoints-repo';
import { checksBetween, checksForDays, getCheckSnoozes } from './checks';
import { getCoolingItem, listActiveCoolingItems, listCoolingItemsBetween } from './cooling-repo';
import { getActiveKitchen } from './kitchen-repo';
import { latestReadingsByCheckpoint, listCoolingReadings, listReadingsBetween, listReadingsForChecksBetween, recentReadings } from './readings-repo';
import { getSettings } from './settings-repo';
import { readLiveQuery } from './store';
import { dayBounds, type DayRange, nowIso, rangeBounds, todayKey } from './time';

const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Context

export type KitchenContext = { kitchen: Kitchen; settings: Settings; unit: Unit };

/** The active kitchen with the device settings and display unit, or null before setup. */
export function kitchenContext(): KitchenContext | null {
  const kitchen = getActiveKitchen();
  if (!kitchen) return null;
  const settings = getSettings();
  return { kitchen, settings, unit: settings.unit };
}

/** Display unit of this device (Settings → unit). Readings are typed and shown in it. */
export function displayUnit(): Unit {
  return getSettings().unit;
}

// ---------------------------------------------------------------------------
// Checks

/** A check with its state, readings and the snooze of its reminder. */
export type CheckView = CheckEntry & { snoozedUntil: string | null };

function toCheckViews(checks: readonly Check[], readings: readonly Reading[], now: string, settings: Settings): CheckView[] {
  const snoozes = getCheckSnoozes();
  return classifyChecks(checks, readings, now, settings.graceMinutes, DEFAULT_MISSED_AFTER_MINUTES).map((e) => ({
    ...e,
    snoozedUntil: snoozes[e.check.id] && snoozes[e.check.id]! > now ? snoozes[e.check.id]! : null,
  }));
}

/** Checks scheduled in `[startIso, endIso)` with their state at `now`. */
export function checkViewsBetween(ctx: KitchenContext, startIso: string, endIso: string, now = nowIso()): CheckView[] {
  // A reading answers a check through `scheduledFor`, so the same window covers both.
  const checks = checksBetween(ctx.kitchen, startIso, endIso);
  const readings = listReadingsForChecksBetween(ctx.kitchen.id, startIso, endIso);
  return toCheckViews(checks, readings, now, ctx.settings);
}

export type BoardStatus = 'overdue' | 'due' | 'upcoming' | 'done' | 'missed' | 'none';

export type CheckpointBoardItem = {
  checkpoint: Checkpoint;
  kindLabel: string;
  tone: 'cold' | 'hot';
  /** `≤ 41 °F` etc. in the display unit (shared `limitsLabel`). */
  limitsLabel: string;
  /** Latest reading ever taken for the checkpoint (not only today). */
  latestReading: Reading | null;
  /** Today's checks (kitchen day) with state. */
  checks: CheckView[];
  /** The check to act on: earliest due/overdue (today or carried over from last night), else the next upcoming. */
  current: CheckView | null;
  /**
   * `overdue` / `due`: act now; `upcoming`: next check later; `done`: every check so far logged and
   * none left today; `missed`: none open but some missed today; `none`: no checks today.
   */
  status: BoardStatus;
  missedToday: number;
  loggedToday: number;
  scheduledToday: number;
};

export type TodayBoard = {
  kitchen: Kitchen;
  unit: Unit;
  dayKey: DayKey;
  items: CheckpointBoardItem[];
  /** Shared `nextCheck` over today's and still-open checks, with its checkpoint. */
  next: (NextCheck & { checkpoint: Checkpoint }) | null;
  /** Today so far (shared `dailyCompliance` with `now`). `rate` is null before anything is due. */
  compliance: DailyCompliance;
  counts: { due: number; overdue: number; missed: number; logged: number; upcoming: number };
  /** Consecutive fully logged days up to today (shared `fullyLoggedStreak`, last 60 days). */
  streak: number;
  generatedAt: string;
};

const STATE_ORDER: Record<BoardStatus, number> = { overdue: 0, due: 1, missed: 2, upcoming: 3, done: 4, none: 5 };

/**
 * The Today board at `now`: every live checkpoint with its latest reading and today's checks
 * (due / overdue / missed / logged / upcoming), the next check, today's compliance and the streak.
 * Open checks from late last night still count as due/overdue until they turn missed.
 */
export function todayBoard(now = nowIso()): TodayBoard | null {
  const ctx = kitchenContext();
  if (!ctx) return null;
  const { kitchen, settings } = ctx;
  const day = dayKeyOf(now, kitchen.tz);
  const { start, end } = dayBounds(day, kitchen.tz);
  const carryFrom = new Date(Math.min(Date.parse(start), Date.parse(now) - DEFAULT_MISSED_AFTER_MINUTES * 60_000)).toISOString();
  const views = checkViewsBetween(ctx, carryFrom, end, now);
  const checkpoints = listCheckpoints(kitchen.id);
  const latest = latestReadingsByCheckpoint(checkpoints.map((c) => c.id));
  const isToday = (v: CheckView) => v.check.dayKey === day;

  const items: CheckpointBoardItem[] = checkpoints.map((checkpoint) => {
    const mine = views.filter((v) => v.check.checkpointId === checkpoint.id);
    const today = mine.filter(isToday);
    const open = mine.find((v) => v.state === 'overdue' || v.state === 'due');
    const upcoming = today.find((v) => v.state === 'upcoming');
    const missedToday = today.filter((v) => v.state === 'missed').length;
    const loggedToday = today.filter((v) => v.state === 'logged').length;
    const status: BoardStatus = open
      ? open.state === 'overdue'
        ? 'overdue'
        : 'due'
      : upcoming
        ? 'upcoming'
        : today.length === 0
          ? 'none'
          : missedToday > 0
            ? 'missed'
            : 'done';
    return {
      checkpoint,
      kindLabel: kindLabel(checkpoint.kind),
      tone: checkpointTone(checkpoint.kind),
      limitsLabel: limitsLabel(checkpoint, ctx.unit),
      latestReading: latest.get(checkpoint.id) ?? null,
      checks: today,
      current: open ?? upcoming ?? null,
      status,
      missedToday,
      loggedToday,
      scheduledToday: today.length,
    };
  });
  items.sort(
    (a, b) =>
      STATE_ORDER[a.status] - STATE_ORDER[b.status] ||
      (a.current?.check.scheduledFor ?? '').localeCompare(b.current?.check.scheduledFor ?? '') ||
      a.checkpoint.sortOrder - b.checkpoint.sortOrder,
  );

  const liveIds = new Set(checkpoints.map((c) => c.id));
  const liveViews = views.filter((v) => liveIds.has(v.check.checkpointId));
  const checks = liveViews.map((v) => v.check);
  const readings = liveViews.flatMap((v) => v.readings);
  const nxt = nextCheck(checks, readings, now, settings.graceMinutes, DEFAULT_MISSED_AFTER_MINUTES);
  const byId = new Map(checkpoints.map((c) => [c.id, c]));
  const todays = liveViews.filter(isToday);
  const count = (s: CheckView['state']) => liveViews.filter((v) => v.state === s && (s === 'due' || s === 'overdue' || isToday(v))).length;

  return {
    kitchen,
    unit: ctx.unit,
    dayKey: day,
    items,
    next: nxt ? { ...nxt, checkpoint: byId.get(nxt.check.checkpointId)! } : null,
    compliance: dailyCompliance(
      todays.map((v) => v.check),
      todays.flatMap((v) => v.readings),
      day,
      kitchen.tz,
      { now, graceMinutes: settings.graceMinutes },
    ),
    counts: { due: count('due'), overdue: count('overdue'), missed: count('missed'), logged: count('logged'), upcoming: count('upcoming') },
    streak: streakUpTo(ctx, day),
    generatedAt: now,
  };
}

/** Fully-logged streak over the last 60 days, cached until readings / checkpoints / kitchen / day change. */
function streakUpTo(ctx: KitchenContext, day: DayKey): number {
  return readLiveQuery(`streak:${ctx.kitchen.id}`, STREAK_TABLES, () => computeStreak(ctx, day), day);
}

const STREAK_TABLES = ['readings', 'checkpoints', 'kitchens'] as const;

function computeStreak(ctx: KitchenContext, day: DayKey): number {
  const from = addDaysToKey(day, -59);
  const { start } = dayBounds(from, ctx.kitchen.tz);
  const { end } = dayBounds(day, ctx.kitchen.tz);
  const checks = checksForDays(ctx.kitchen, listCheckpoints(ctx.kitchen.id, { includeArchived: true }), from, day);
  if (!checks.length) return 0;
  return fullyLoggedStreak(checks, listReadingsForChecksBetween(ctx.kitchen.id, start, end), day, ctx.kitchen.tz);
}

export type DueCheck = CheckView & { checkpoint: Checkpoint; state: 'due' | 'overdue' };

/** Checks to act on now (due, then overdue; oldest first), with their checkpoint. */
export function dueCheckViews(now = nowIso()): DueCheck[] {
  const ctx = kitchenContext();
  if (!ctx) return [];
  const start = new Date(Date.parse(now) - DEFAULT_MISSED_AFTER_MINUTES * 60_000 - HOUR).toISOString();
  const end = new Date(Date.parse(now) + HOUR).toISOString();
  const byId = new Map(listCheckpoints(ctx.kitchen.id).map((c) => [c.id, c]));
  return checkViewsBetween(ctx, start, end, now).flatMap((v) => {
    const checkpoint = byId.get(v.check.checkpointId);
    if (!checkpoint || (v.state !== 'due' && v.state !== 'overdue')) return [];
    return [{ ...v, checkpoint, state: v.state }];
  });
}

/** Checks of any local day with their state (History day view: missed checks are listed explicitly, never filled in). */
export function dayCheckViews(dayKey: DayKey, now = nowIso()): (CheckView & { checkpoint: Checkpoint })[] {
  const ctx = kitchenContext();
  if (!ctx) return [];
  const { start, end } = dayBounds(dayKey, ctx.kitchen.tz);
  const checks = checksBetween(ctx.kitchen, start, end);
  const readings = listReadingsForChecksBetween(ctx.kitchen.id, start, end);
  const byId = new Map(allCheckpointRows(ctx.kitchen.id).map((c) => [c.id, c]));
  return toCheckViews(checks, readings, now, ctx.settings).flatMap((v) => {
    const checkpoint = byId.get(v.check.checkpointId);
    return checkpoint ? [{ ...v, checkpoint }] : [];
  });
}

// ---------------------------------------------------------------------------
// Readings, compliance, checkpoint history

export type ReadingView = Reading & {
  checkpoint: Checkpoint | null;
  coolingItem: CoolingItem | null;
  /** Value in the display unit (to 0.1). */
  unit: Unit;
};

/** Readings taken in a day range (oldest first), optionally one checkpoint's, with their checkpoint / cooling item. */
export function readingViews(range: DayRange, checkpointId?: string): ReadingView[] {
  const ctx = kitchenContext();
  if (!ctx) return [];
  const { start, end } = rangeBounds(range, ctx.kitchen.tz);
  const rows = listReadingsBetween(ctx.kitchen.id, start, end, checkpointId);
  const checkpoints = new Map(allCheckpointRows(ctx.kitchen.id).map((c) => [c.id, c]));
  const items = new Map<string, CoolingItem | null>();
  return rows.map((r) => {
    let coolingItem: CoolingItem | null = null;
    if (r.coolingItemId) {
      if (!items.has(r.coolingItemId)) items.set(r.coolingItemId, getCoolingItem(r.coolingItemId));
      coolingItem = items.get(r.coolingItemId) ?? null;
    }
    return { ...r, checkpoint: r.checkpointId ? (checkpoints.get(r.checkpointId) ?? null) : null, coolingItem, unit: ctx.unit };
  });
}

export type ComplianceReport = {
  range: DayRange;
  days: (DailyCompliance & { dayKey: DayKey })[];
  scheduled: number;
  logged: number;
  onTime: number;
  failed: number;
  missed: number;
  /** logged / scheduled over the range; null when nothing was scheduled. */
  rate: number | null;
  streak: number;
};

/** Compliance per local day over a range (today counted so far) plus totals and the streak. */
export function complianceFor(range: DayRange, now = nowIso()): ComplianceReport | null {
  const ctx = kitchenContext();
  if (!ctx) return null;
  const tz = ctx.kitchen.tz;
  const { start, end } = rangeBounds(range, tz);
  const checks = checksForDays(ctx.kitchen, listCheckpoints(ctx.kitchen.id, { includeArchived: true }), range.from, range.to);
  const readings = [
    ...listReadingsForChecksBetween(ctx.kitchen.id, start, end),
    ...listReadingsBetween(ctx.kitchen.id, start, end).filter((r) => !r.scheduledFor),
  ];
  const days: ComplianceReport['days'] = [];
  for (let key = range.from; key <= range.to; key = addDaysToKey(key, 1)) {
    days.push({ dayKey: key, ...dailyCompliance(checks, readings, key, tz, { now, graceMinutes: ctx.settings.graceMinutes }) });
    if (days.length > 400) break;
  }
  const sum = (k: 'scheduled' | 'logged' | 'onTime' | 'failed') => days.reduce((n, d) => n + d[k], 0);
  const scheduled = sum('scheduled');
  const logged = sum('logged');
  return {
    range,
    days,
    scheduled,
    logged,
    onTime: sum('onTime'),
    failed: sum('failed'),
    missed: scheduled - logged,
    rate: scheduled ? logged / scheduled : null,
    streak: streakUpTo(ctx, todayKey(tz)),
  };
}

export type CheckpointHistory = {
  checkpoint: Checkpoint;
  stats: CheckpointStats;
  recent: Reading[];
  limitsLabel: string;
};

/** Sparkline stats over the last `days` days plus the 10 most recent readings of a checkpoint. */
export function checkpointHistory(checkpointId: string, days = 7, now = nowIso()): CheckpointHistory | null {
  const ctx = kitchenContext();
  const checkpoint = getCheckpoint(checkpointId);
  if (!ctx || !checkpoint) return null;
  const tz = ctx.kitchen.tz;
  const range = { from: addDaysToKey(dayKeyOf(now, tz), -(days - 1)), to: dayKeyOf(now, tz) };
  const { start, end } = rangeBounds(range, tz);
  const readings = listReadingsBetween(ctx.kitchen.id, start, end, checkpointId);
  return {
    checkpoint,
    stats: checkpointStats(readings, checkpointId, days, now, tz),
    recent: recentReadings(checkpointId, 10),
    limitsLabel: limitsLabel(checkpoint, ctx.unit),
  };
}

// ---------------------------------------------------------------------------
// Cooling

export type CoolingView = CoolingItem & {
  deadlines: CoolingDeadlines;
  /** The open stage's prompt (`minutesLeft` < 0 once overdue); null when closed. */
  prompt: CoolingPrompt | null;
  /** 0…1 of the open stage's time used (shared `coolingProgress`). */
  progress: number;
  /** One-line status (shared `coolingLabel`) in the display unit. */
  label: string;
  /** Stage readings, oldest first. */
  readings: Reading[];
};

function toCoolingView(item: CoolingItem, readings: readonly Reading[], now: string, unit: Unit): CoolingView {
  return {
    ...item,
    deadlines: coolingDeadlines(item.startedAt),
    prompt: nextCoolingPrompt(item, now),
    progress: coolingProgress(item, now),
    label: coolingLabel(item, now, unit),
    readings: readings.filter((r) => r.coolingItemId === item.id),
  };
}

/** Cooling items with a running timer (oldest first) with prompt, progress and label at `now`. */
export function activeCoolingViews(now = nowIso()): CoolingView[] {
  const ctx = kitchenContext();
  if (!ctx) return [];
  const items = listActiveCoolingItems(ctx.kitchen.id);
  const readings = listCoolingReadings(items.map((i) => i.id));
  return items.map((i) => toCoolingView(i, readings, now, ctx.unit));
}

/** Cooling items started in a day range (any status, newest first). */
export function coolingViewsBetween(range: DayRange, now = nowIso()): CoolingView[] {
  const ctx = kitchenContext();
  if (!ctx) return [];
  const { start, end } = rangeBounds(range, ctx.kitchen.tz);
  const items = listCoolingItemsBetween(ctx.kitchen.id, start, end);
  const readings = listCoolingReadings(items.map((i) => i.id));
  return items.map((i) => toCoolingView(i, readings, now, ctx.unit));
}

export function coolingView(id: string, now = nowIso()): CoolingView | null {
  const item = getCoolingItem(id);
  if (!item) return null;
  return toCoolingView(item, listCoolingReadings([id]), now, displayUnit());
}

// ---------------------------------------------------------------------------
// Reports

/** Shared `rangeReportModel` for the inspector PDF / CSV (display unit, kitchen zone). */
export function reportModel(range: DayRange, now = nowIso()): RangeReportModel | null {
  const ctx = kitchenContext();
  if (!ctx) return null;
  const { start, end } = rangeBounds(range, ctx.kitchen.tz);
  // Cooling items started a little before the range can still have readings inside it.
  const coolingStart = new Date(Date.parse(start) - 6 * HOUR).toISOString();
  const coolingItems = listCoolingItemsBetween(ctx.kitchen.id, coolingStart, end);
  const readings = [
    ...listReadingsBetween(ctx.kitchen.id, start, end),
    ...listCoolingReadings(coolingItems.map((c) => c.id)).filter((r) => r.takenAt < start || r.takenAt >= end),
  ];
  return rangeReportModel(
    ctx.kitchen,
    allCheckpointRows(ctx.kitchen.id),
    readings,
    coolingItems,
    range.from,
    range.to,
    ctx.kitchen.tz,
    ctx.unit,
    { now, graceMinutes: ctx.settings.graceMinutes },
  );
}


