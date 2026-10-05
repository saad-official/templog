/**
 * Two-stage cooling, FDA Food Code 3-501.14(A): cooked TCS food is cooled
 *   (1) from 135 °F to 70 °F within 2 hours, and
 *   (2) from 135 °F to 41 °F or less within a total of 6 hours (the 6 h runs from the start,
 *       not from the stage-1 pass).
 * Food that misses a stage must be reheated to 165 °F (3-403.11) and restarted, or discarded
 * (3-501.14 corrective actions, Annex 3). Deadlines are elapsed time, so DST does not move them.
 *
 * States: cooling (stage 1 open) → stage1-pass (stage 2 open) → done; either open stage → failed
 * (late or warm reading, or `expireCooling`); any open stage → discarded.
 */
import type { CoolingItem, CoolingStatus } from "./schemas";
import type { IsoString } from "./tz";
import { displayTemp, formatTemp, roundTenth, type Unit } from "./units";

export const COOLING_LIMITS = {
  startF: 135,
  stage1MaxF: 70,
  stage2MaxF: 41,
  stage1Hours: 2,
  totalHours: 6,
} as const;

const HOUR = 3_600_000;
const MINUTE = 60_000;
const iso = (ms: number): IsoString => new Date(ms).toISOString();

export interface CoolingDeadlines {
  stage1DueAt: IsoString;
  stage2DueAt: IsoString;
}

export function coolingDeadlines(startedAt: IsoString): CoolingDeadlines {
  const start = Date.parse(startedAt);
  return {
    stage1DueAt: iso(start + COOLING_LIMITS.stage1Hours * HOUR),
    stage2DueAt: iso(start + COOLING_LIMITS.totalHours * HOUR),
  };
}

export type CoolingStage = "stage1" | "stage2";

function openStage(item: Pick<CoolingItem, "status">): CoolingStage | null {
  if (item.status === "cooling") return "stage1";
  if (item.status === "stage1-pass") return "stage2";
  return null;
}

function stageFailReason(stage: CoolingStage, unit: Unit): string {
  const max = stage === "stage1" ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF;
  const hours = stage === "stage1" ? COOLING_LIMITS.stage1Hours : COOLING_LIMITS.totalHours;
  return `not ≤ ${formatTemp(displayTemp(max, unit), unit)} within ${hours} h`;
}

export interface CoolingEvaluation {
  stage: CoolingStage;
  /** pass: stage met; fail: stage missed; pending: on time but not cold enough yet (keep cooling). */
  outcome: "pass" | "fail" | "pending";
  /** Next item status. */
  status: CoolingStatus;
  /** `result` for the Reading row (a pending reading is on track, so it is recorded as a pass). */
  readingResult: "pass" | "fail";
  failReason: string | null;
  /** Fields to write onto the cooling item (empty when nothing changes). */
  patch: Partial<CoolingItem>;
}

export interface EvaluateCoolingOptions {
  /** The new Reading's id; fills `stage1ReadingId` / `stage2ReadingId` in the patch. */
  readingId?: string;
  /** Unit for `failReason` text (default °F). */
  unit?: Unit;
}

/**
 * Evaluate a cooling reading against the open stage.
 * - On time (≤ deadline) and ≤ the stage max: pass. Stage 1 at ≤ 41 °F completes both stages.
 * - On time but too warm: pending, unless taken exactly at the deadline (then fail).
 * - After the deadline: fail whatever the value; `failedAt` is the deadline.
 * Throws on a closed item, a reading before `startedAt`, or a non-finite value.
 */
export function evaluateCooling(
  item: CoolingItem,
  readingValueF: number,
  takenAt: IsoString,
  options: EvaluateCoolingOptions = {},
): CoolingEvaluation {
  const stage = openStage(item);
  if (!stage) throw new Error(`Cooling item is closed (${item.status})`);
  if (!Number.isFinite(readingValueF)) throw new RangeError("readingValueF must be a finite number");
  const taken = Date.parse(takenAt);
  if (taken < Date.parse(item.startedAt)) throw new RangeError("Reading taken before cooling started");

  const value = roundTenth(readingValueF);
  const deadlines = coolingDeadlines(item.startedAt);
  const dueAt = stage === "stage1" ? deadlines.stage1DueAt : deadlines.stage2DueAt;
  const due = Date.parse(dueAt);
  const max = stage === "stage1" ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF;
  const slot = stage === "stage1" ? "stage1ReadingId" : "stage2ReadingId";
  const ids = (keys: ("stage1ReadingId" | "stage2ReadingId")[]) =>
    options.readingId ? Object.fromEntries(keys.map((k) => [k, options.readingId])) : {};

  if (taken <= due && value <= max) {
    const done = stage === "stage2" || value <= COOLING_LIMITS.stage2MaxF;
    const patch: Partial<CoolingItem> = done
      ? {
          status: "done",
          ...ids(stage === "stage1" ? ["stage1ReadingId", "stage2ReadingId"] : ["stage2ReadingId"]),
          ...(stage === "stage1" ? { stage1At: takenAt } : {}),
          completedAt: takenAt,
        }
      : { status: "stage1-pass", ...ids(["stage1ReadingId"]), stage1At: takenAt };
    return { stage, outcome: "pass", status: patch.status as CoolingStatus, readingResult: "pass", failReason: null, patch };
  }
  if (taken < due) {
    return { stage, outcome: "pending", status: item.status, readingResult: "pass", failReason: null, patch: {} };
  }
  const failReason = stageFailReason(stage, options.unit ?? "F");
  return {
    stage,
    outcome: "fail",
    status: "failed",
    readingResult: "fail",
    failReason,
    patch: { status: "failed", ...ids([slot]), failedAt: dueAt, failReason },
  };
}

/** Auto-fail patch when the open stage's deadline has passed (strictly) at `now`; null otherwise. */
export function expireCooling(item: CoolingItem, now: IsoString, unit: Unit = "F"): Partial<CoolingItem> | null {
  const stage = openStage(item);
  if (!stage) return null;
  const deadlines = coolingDeadlines(item.startedAt);
  const dueAt = stage === "stage1" ? deadlines.stage1DueAt : deadlines.stage2DueAt;
  if (Date.parse(now) <= Date.parse(dueAt)) return null;
  return { status: "failed", failedAt: dueAt, failReason: stageFailReason(stage, unit) };
}

/**
 * Patch that undoes the item change made by the stage reading `readingId` (a reading logged by
 * mistake): a stage pass reopens that stage, a stage fail reopens it and clears the reason and the
 * corrective action, a stage-1 reading that completed both stages reopens stage 1. `{}` for a
 * pending reading (it never changed the item). `null` when it cannot be undone on its own: a later
 * stage-2 result or a stage-2 expiry sits on top of it, or the item was discarded since.
 * The reopened stage may already be past its deadline; `expireCooling` then fails it again.
 */
export function revertCoolingReading(item: CoolingItem, readingId: string): Partial<CoolingItem> | null {
  const s1 = item.stage1ReadingId === readingId;
  const s2 = item.stage2ReadingId === readingId;
  if (!s1 && !s2) return {};
  if (item.status === "discarded") return null;
  const clearFail = { failedAt: null, failReason: null, correctiveAction: null };
  if (s1 && s2) {
    if (item.status !== "done") return null;
    return { status: "cooling", stage1ReadingId: null, stage2ReadingId: null, stage1At: null, completedAt: null };
  }
  if (s2) {
    if (item.status === "done") return { status: "stage1-pass", stage2ReadingId: null, completedAt: null };
    if (item.status === "failed") return { status: "stage1-pass", stage2ReadingId: null, ...clearFail };
    return null;
  }
  // Stage-1 reading only.
  if (item.stage2ReadingId) return null;
  if (item.status === "stage1-pass") return { status: "cooling", stage1ReadingId: null, stage1At: null };
  // Failed by this reading (a stage-1 fail never sets `stage1At`); with `stage1At` it was a stage-2 expiry.
  if (item.status === "failed" && !item.stage1At) return { status: "cooling", stage1ReadingId: null, ...clearFail };
  return null;
}

/** Patch for the "Discarded" action. */
export function discardCooling(_item: CoolingItem, now: IsoString): Partial<CoolingItem> {
  return { status: "discarded", discardedAt: now };
}

export interface CoolingPrompt {
  kind: CoolingStage;
  dueAt: IsoString;
  /** Whole minutes until `dueAt`, rounded up; negative once overdue. */
  minutesLeft: number;
}

export function nextCoolingPrompt(item: CoolingItem, now: IsoString): CoolingPrompt | null {
  const stage = openStage(item);
  if (!stage) return null;
  const deadlines = coolingDeadlines(item.startedAt);
  const dueAt = stage === "stage1" ? deadlines.stage1DueAt : deadlines.stage2DueAt;
  const minutesLeft = Math.ceil((Date.parse(dueAt) - Date.parse(now)) / MINUTE);
  return { kind: stage, dueAt, minutesLeft: minutesLeft === 0 ? 0 : minutesLeft };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Fraction of the open stage's time used, 0..1 (stage 2 runs from `stage1At` to the 6 h mark); 1 when closed. */
export function coolingProgress(item: CoolingItem, now: IsoString): number {
  const stage = openStage(item);
  if (!stage) return 1;
  const deadlines = coolingDeadlines(item.startedAt);
  const t = Date.parse(now);
  if (stage === "stage1") {
    const start = Date.parse(item.startedAt);
    return clamp01((t - start) / (Date.parse(deadlines.stage1DueAt) - start));
  }
  const from = Date.parse(item.stage1At ?? deadlines.stage1DueAt);
  const to = Date.parse(deadlines.stage2DueAt);
  return to > from ? clamp01((t - from) / (to - from)) : 1;
}

/** `45 m`, `1 h 12 m`, `3 h` (absolute value). */
export function formatMinutes(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} m`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} m`;
}

/** One-line status for cards and the Live Activity. */
export function coolingLabel(item: CoolingItem, now: IsoString, unit: Unit = "F"): string {
  const prompt = nextCoolingPrompt(item, now);
  if (prompt) {
    const name = prompt.kind === "stage1" ? "Stage 1" : "Stage 2";
    if (prompt.minutesLeft < 0) return `${name} overdue by ${formatMinutes(prompt.minutesLeft)}`;
    const max = prompt.kind === "stage1" ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF;
    return `${name}: ≤ ${formatTemp(displayTemp(max, unit), unit)} in ${formatMinutes(prompt.minutesLeft)}`;
  }
  if (item.status === "done") return "Cooled";
  if (item.status === "discarded") return "Discarded";
  return item.failReason ? `Failed: ${item.failReason}` : "Failed";
}
