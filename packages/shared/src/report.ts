/** Inspector report view models (PDF and CSV) for one day or a range of days. */
import { COOLING_LIMITS, coolingLabel } from "./cooling";
import type { CsvCell } from "./csv";
import { checkpointTone, kindLabel, limitsLabel } from "./limits";
import { classifyChecks, DEFAULT_GRACE_MINUTES, expandChecks } from "./schedule";
import type { Checkpoint, CheckpointKind, CorrectiveAction, CoolingItem, CoolingStatus, Kitchen, Reading, ReadingResult } from "./schemas";
import { addDaysToKey, type DayKey, dayKeyOf, type IsoString, localTime } from "./tz";
import { displayTemp, formatTemp, type Unit } from "./units";

export interface ReportHeader {
  kitchenName: string;
  tz: string;
  unit: Unit;
  from: DayKey;
  to: DayKey;
}

export interface ReportRow {
  readingId: string;
  dayKey: DayKey;
  /** Local `HH:mm` the reading was taken. */
  time: string;
  takenAt: IsoString;
  /** Local `HH:mm` of the check it answers; null for ad-hoc readings. */
  scheduledTime: string | null;
  /** In the report unit, to 0.1. */
  value: number;
  valueLabel: string;
  result: ReadingResult;
  failReason: string | null;
  correctiveAction: string;
  initials: string;
  /** Taken more than grace minutes from its scheduled time. */
  late: boolean;
}

export interface MissedCheck {
  checkId: string;
  scheduledFor: IsoString;
  time: string;
}

export interface CheckpointSection {
  checkpointId: string;
  name: string;
  kind: CheckpointKind;
  kindLabel: string;
  tone: "cold" | "hot";
  limitsLabel: string;
  rows: ReportRow[];
  missed: MissedCheck[];
  scheduled: number;
  logged: number;
}

export interface CoolingStageCell {
  time: string;
  value: number;
  valueLabel: string;
  limitLabel: string;
  result: ReadingResult;
}

export interface CoolingSection {
  coolingItemId: string;
  name: string;
  startedTime: string;
  stage1: CoolingStageCell | null;
  stage2: CoolingStageCell | null;
  status: CoolingStatus;
  statusLabel: string;
  failReason: string | null;
  correctiveAction: string;
  initials: string;
}

export interface ReportTotals {
  scheduled: number;
  logged: number;
  onTime: number;
  missed: number;
  /** Failing checkpoint readings. */
  failed: number;
  rate: number | null;
  cooling: number;
  coolingFailed: number;
}

export interface DailyReportModel {
  header: ReportHeader;
  checkpoints: CheckpointSection[];
  cooling: CoolingSection[];
  totals: ReportTotals;
}

export interface RangeReportModel {
  header: ReportHeader;
  days: DailyReportModel[];
  totals: ReportTotals;
}

export interface ReportOptions {
  /** For a day still in progress: only checks past their grace period are listed as missed. */
  now?: IsoString;
  graceMinutes?: number;
}

/** `now` for a closed day: every unlogged check is past due. */
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

const ACTION_LABELS: Record<CorrectiveAction["kind"], string> = {
  discard: "Discarded",
  reheat: "Reheated",
  move: "Moved product",
  service: "Called service",
  other: "Other",
};

export function correctiveActionLabel(action: CorrectiveAction | null | undefined): string {
  if (!action) return "";
  const label = ACTION_LABELS[action.kind];
  return action.note ? `${label}: ${action.note}` : label;
}

/** Static status for a report (no countdown). */
function reportCoolingLabel(item: CoolingItem): string {
  if (item.status === "cooling") return "Stage 1 in progress";
  if (item.status === "stage1-pass") return "Stage 2 in progress";
  return coolingLabel(item, item.updatedAt);
}

function stageLimitLabel(stage: 1 | 2, unit: Unit): string {
  const max = stage === 1 ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF;
  const hours = stage === 1 ? COOLING_LIMITS.stage1Hours : COOLING_LIMITS.totalHours;
  return `≤ ${formatTemp(displayTemp(max, unit), unit)} within ${hours} h`;
}

/**
 * One local day: a section per checkpoint with checks or readings that day (deleted checkpoints
 * left out, archived ones kept), ordered by `sortOrder` then name; readings by time; unlogged
 * checks listed under `missed` (never filled in); cooling items started that day; totals.
 */
export function dailyReportModel(
  kitchen: Kitchen,
  checkpoints: readonly Checkpoint[],
  readings: readonly Reading[],
  coolingItems: readonly CoolingItem[],
  dayKey: DayKey,
  tz: string,
  unit: Unit,
  options: ReportOptions = {},
): DailyReportModel {
  const grace = (options.graceMinutes ?? DEFAULT_GRACE_MINUTES) * 60_000;
  const now = options.now ? Date.parse(options.now) : Infinity;
  const live = readings.filter((r) => !r.deletedAt);
  const onDay = (at: IsoString) => dayKeyOf(at, tz) === dayKey;
  const zoned = { ...kitchen, tz };

  const sections: CheckpointSection[] = [];
  const sorted = checkpoints
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  let onTime = 0;
  for (const cp of sorted) {
    // Start a day early so checks of a kitchen open past midnight land on this day too.
    const checks = expandChecks(cp, zoned, addDaysToKey(dayKey, -1), 2).filter((c) => onDay(c.scheduledFor));
    const cpReadings = live.filter((r) => r.checkpointId === cp.id);
    const entries = classifyChecks(checks, cpReadings, options.now ?? FAR_FUTURE, grace / 60_000);
    const rows = cpReadings
      .filter((r) => onDay(r.takenAt))
      .sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt))
      .map((r): ReportRow => {
        const value = displayTemp(r.valueF, unit);
        return {
          readingId: r.id,
          dayKey,
          time: localTime(r.takenAt, tz),
          takenAt: r.takenAt,
          scheduledTime: r.scheduledFor ? localTime(r.scheduledFor, tz) : null,
          value,
          valueLabel: formatTemp(value, unit),
          result: r.result,
          failReason: r.failReason ?? null,
          correctiveAction: correctiveActionLabel(r.correctiveAction),
          initials: r.initials,
          late: r.scheduledFor ? Math.abs(Date.parse(r.takenAt) - Date.parse(r.scheduledFor)) > grace : false,
        };
      });
    if (!checks.length && !rows.length) continue;
    const missed = entries
      .filter((e) => e.state !== "logged" && Date.parse(e.check.scheduledFor) + grace < now)
      .map((e) => ({ checkId: e.check.id, scheduledFor: e.check.scheduledFor, time: localTime(e.check.scheduledFor, tz) }));
    onTime += entries.filter((e) => e.onTime).length;
    sections.push({
      checkpointId: cp.id,
      name: cp.name,
      kind: cp.kind,
      kindLabel: kindLabel(cp.kind),
      tone: checkpointTone(cp.kind),
      limitsLabel: limitsLabel(cp, unit),
      rows,
      missed,
      scheduled: checks.length,
      logged: entries.filter((e) => e.state === "logged").length,
    });
  }

  const byId = new Map(live.map((r) => [r.id, r]));
  const stageCell = (id: string | null | undefined, stage: 1 | 2): CoolingStageCell | null => {
    const r = id ? byId.get(id) : undefined;
    if (!r) return null;
    const value = displayTemp(r.valueF, unit);
    return { time: localTime(r.takenAt, tz), value, valueLabel: formatTemp(value, unit), limitLabel: stageLimitLabel(stage, unit), result: r.result };
  };
  const cooling = coolingItems
    .filter((c) => !c.deletedAt && onDay(c.startedAt))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map(
      (c): CoolingSection => ({
        coolingItemId: c.id,
        name: c.name,
        startedTime: localTime(c.startedAt, tz),
        stage1: stageCell(c.stage1ReadingId, 1),
        stage2: stageCell(c.stage2ReadingId, 2),
        status: c.status,
        statusLabel: reportCoolingLabel(c),
        failReason: c.failReason ?? null,
        correctiveAction: correctiveActionLabel(c.correctiveAction),
        initials: c.initials ?? "",
      }),
    );

  const scheduled = sections.reduce((n, s) => n + s.scheduled, 0);
  const logged = sections.reduce((n, s) => n + s.logged, 0);
  return {
    header: { kitchenName: kitchen.name, tz, unit, from: dayKey, to: dayKey },
    checkpoints: sections,
    cooling,
    totals: {
      scheduled,
      logged,
      onTime,
      missed: sections.reduce((n, s) => n + s.missed.length, 0),
      failed: sections.reduce((n, s) => n + s.rows.filter((r) => r.result === "fail").length, 0),
      rate: scheduled ? logged / scheduled : null,
      cooling: cooling.length,
      coolingFailed: cooling.filter((c) => c.status === "failed").length,
    },
  };
}

/** Daily models for `fromDayKey`..`toDayKey` inclusive, with summed totals. */
export function rangeReportModel(
  kitchen: Kitchen,
  checkpoints: readonly Checkpoint[],
  readings: readonly Reading[],
  coolingItems: readonly CoolingItem[],
  fromDayKey: DayKey,
  toDayKey: DayKey,
  tz: string,
  unit: Unit,
  options: ReportOptions = {},
): RangeReportModel {
  const days: DailyReportModel[] = [];
  for (let key = fromDayKey; key <= toDayKey; key = addDaysToKey(key, 1)) {
    days.push(dailyReportModel(kitchen, checkpoints, readings, coolingItems, key, tz, unit, options));
  }
  const sum = (k: Exclude<keyof ReportTotals, "rate">) => days.reduce((n, d) => n + d.totals[k], 0);
  const scheduled = sum("scheduled");
  const logged = sum("logged");
  return {
    header: { kitchenName: kitchen.name, tz, unit, from: fromDayKey, to: toDayKey },
    days,
    totals: {
      scheduled,
      logged,
      onTime: sum("onTime"),
      missed: sum("missed"),
      failed: sum("failed"),
      rate: scheduled ? logged / scheduled : null,
      cooling: sum("cooling"),
      coolingFailed: sum("coolingFailed"),
    },
  };
}

export const CSV_HEADER = ["Date", "Time", "Checkpoint", "Kind", "Value", "Unit", "Limit", "Result", "Corrective action", "Initials"];

function dayRows(day: DailyReportModel): { at: string; row: CsvCell[] }[] {
  const date = day.header.from;
  const unit = `°${day.header.unit}`;
  const out: { at: string; row: CsvCell[] }[] = [];
  for (const s of day.checkpoints) {
    for (const r of s.rows) {
      out.push({ at: r.time, row: [date, r.time, s.name, s.kindLabel, r.value, unit, s.limitsLabel, r.result, r.correctiveAction, r.initials] });
    }
    for (const m of s.missed) {
      out.push({ at: m.time, row: [date, m.time, s.name, s.kindLabel, "", unit, s.limitsLabel, "missed", "", ""] });
    }
  }
  for (const c of day.cooling) {
    ([c.stage1, c.stage2] as const).forEach((cell, i) => {
      if (!cell) return;
      const action = cell.result === "fail" ? c.correctiveAction : "";
      out.push({
        at: cell.time,
        row: [date, cell.time, `Cooling: ${c.name}`, `Cooling stage ${i + 1}`, cell.value, unit, cell.limitLabel, cell.result, action, c.initials],
      });
    });
  }
  // Stable sort keeps a reading before a missed row at the same minute.
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** CSV rows (header first) for a daily or range report: readings, missed checks and cooling stages by time. */
export function toCsvRows(model: DailyReportModel | RangeReportModel): CsvCell[][] {
  const days = "days" in model ? model.days : [model];
  return [[...CSV_HEADER], ...days.flatMap((d) => dayRows(d).map((x) => x.row))];
}
