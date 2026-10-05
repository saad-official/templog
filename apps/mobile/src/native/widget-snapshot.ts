// What the home-screen / Lock Screen widgets and the cooling status surfaces show, built from SQLite
// (also from headless JS: widget handler, background task). Colours come from the shared tokens.
import { dailyCompliance } from '@templog/shared/compliance';
import { type Check, classifyChecks, DEFAULT_MISSED_AFTER_MINUTES, nextCheck } from '@templog/shared/schedule';
import type { Checkpoint, Kitchen, Reading, Settings } from '@templog/shared/schemas';
import { addDaysToKey, dayKeyOf } from '@templog/shared/tz';
import { colors } from '@templog/shared/tokens';

import { listCheckpoints } from '@/data/checkpoints-repo';
import { checksBetween } from '@/data/checks';
import { getActiveKitchen } from '@/data/kitchen-repo';
import { listReadingsForChecksBetween } from '@/data/readings-repo';
import { getSettings } from '@/data/settings-repo';
import { dayBounds, formatClock } from '@/data/time';

/** Theme colours a widget / Live Activity needs, for both schemes (it picks by `colorScheme`). */
export type WidgetColors = {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  cold: string;
  pass: string;
  warning: string;
  track: string;
};
export type WidgetPalette = { light: WidgetColors; dark: WidgetColors };

export function widgetPalette(): WidgetPalette {
  const pick = (scheme: 'light' | 'dark'): WidgetColors => {
    const c = colors[scheme];
    return {
      surface: c.surfaceElevated,
      text: c.text,
      textSecondary: c.textSecondary,
      accent: c.heat,
      accentText: c.heatText,
      cold: c.coldText,
      pass: c.passText,
      warning: c.warningText,
      track: c.surfaceSunken,
    };
  };
  return { light: pick('light'), dark: pick('dark') };
}

export type WidgetSnapshot = {
  /** The check to act on (due / overdue first, else the next upcoming). */
  next: {
    checkpointId: string;
    checkpointName: string;
    scheduledFor: string;
    dueLabel: string;
    state: 'due' | 'overdue' | 'upcoming';
  } | null;
  /** Today's compliance so far, 0…100, or null before anything was due. */
  compliancePct: number | null;
  logged: number;
  scheduled: number;
  /** Checks due or overdue at the snapshot instant (badge, widget accent). */
  openCount: number;
  kitchenName: string | null;
};

const EMPTY: WidgetSnapshot = { next: null, compliancePct: null, logged: 0, scheduled: 0, openCount: 0, kitchenName: null };
const MINUTE = 60_000;

type WidgetData = { kitchen: Kitchen; settings: Settings; byId: Map<string, Checkpoint>; checks: Check[]; readings: Reading[] };

/** One read of everything the widget needs from `now` to the end of tomorrow. */
function loadWidgetData(now: number): WidgetData | null {
  const kitchen = getActiveKitchen();
  if (!kitchen) return null;
  const settings = getSettings();
  const today = dayKeyOf(now, kitchen.tz);
  const start = new Date(Date.parse(dayBounds(today, kitchen.tz).start) - DEFAULT_MISSED_AFTER_MINUTES * MINUTE).toISOString();
  const end = dayBounds(addDaysToKey(today, 1), kitchen.tz).end;
  const checkpoints = listCheckpoints(kitchen.id);
  const byId = new Map(checkpoints.map((c) => [c.id, c]));
  const checks = checksBetween(kitchen, start, end).filter((c) => byId.has(c.checkpointId));
  return { kitchen, settings, byId, checks, readings: listReadingsForChecksBetween(kitchen.id, start, end) };
}

function snapshotAt(data: WidgetData, at: number): WidgetSnapshot {
  const { kitchen, settings, byId, checks, readings } = data;
  const iso = new Date(at).toISOString();
  const day = dayKeyOf(at, kitchen.tz);
  const grace = settings.graceMinutes;
  const n = nextCheck(checks, readings, iso, grace, DEFAULT_MISSED_AFTER_MINUTES);
  const todays = checks.filter((c) => c.dayKey === day);
  const compliance = dailyCompliance(todays, readings, day, kitchen.tz, { now: iso, graceMinutes: grace });
  const openCount = classifyChecks(checks, readings, iso, grace, DEFAULT_MISSED_AFTER_MINUTES).filter(
    (e) => e.state === 'due' || e.state === 'overdue',
  ).length;
  const checkpoint = n ? byId.get(n.check.checkpointId) : undefined;
  return {
    next:
      n && checkpoint
        ? {
            checkpointId: checkpoint.id,
            checkpointName: checkpoint.name,
            scheduledFor: n.check.scheduledFor,
            dueLabel: formatClock(n.check.scheduledFor, kitchen.tz),
            state: n.state,
          }
        : null,
    compliancePct: compliance.rate === null ? null : Math.round(compliance.rate * 100),
    logged: compliance.logged,
    scheduled: compliance.scheduled,
    openCount,
    kitchenName: kitchen.name,
  };
}

/** The snapshot as it will look at `at` (default now) if nothing else gets logged. */
export function buildWidgetSnapshot(at: number = Date.now()): WidgetSnapshot {
  const data = loadWidgetData(at);
  return data ? snapshotAt(data, at) : EMPTY;
}

/**
 * Snapshots for a widget timeline: now, each check's time and the end of its grace period
 * (due → overdue) over the next 24 h, and every 5 minutes for the next 2 hours so the Lock Screen
 * "minutes to next check" stays close. One database read for all entries; capped for WidgetKit.
 */
export function buildWidgetTimeline(limit = 60): { at: number; snapshot: WidgetSnapshot }[] {
  const now = Date.now();
  const data = loadWidgetData(now);
  if (!data) return [{ at: now, snapshot: EMPTY }];
  const instants = new Set<number>([now]);
  const step = 5 * MINUTE;
  for (let t = Math.ceil(now / step) * step; t < now + 2 * 3_600_000; t += step) instants.add(t);
  for (const c of data.checks) {
    const t = Date.parse(c.scheduledFor);
    for (const x of [t, t + data.settings.graceMinutes * MINUTE + 1000]) if (x > now && x < now + 24 * 3_600_000) instants.add(x);
  }
  return [...instants]
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((at) => ({ at, snapshot: snapshotAt(data, at + 1000) }));
}
