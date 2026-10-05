// User intents. Each one applies the shared rules (limits, cooling state machine, schedule),
// persists synchronously (hooks update immediately), then refreshes the native surfaces
// (reminders, cooling Live Activities / Live Updates, widgets) and schedules a kitchen sync.
// Await the returned promise in headless contexts (notification actions, background task) so the
// surfaces finish before JS is suspended; in UI code fire-and-forget is fine.
import { type CoolingEvaluation, discardCooling as sharedDiscard, evaluateCooling, expireCooling } from '@templog/shared/cooling';
import { type Evaluation, evaluateReading } from '@templog/shared/limits';
import { checkForReading, checkIdFor, DEFAULT_MISSED_AFTER_MINUTES } from '@templog/shared/schedule';
import type {
  Checkpoint,
  CoolingItem,
  CorrectiveAction,
  Kitchen,
  Reading,
  ReadingSource,
  Settings,
} from '@templog/shared/schemas';
import { toStoredF, type Unit } from '@templog/shared/units';

import { cancelAllTemplogNotifications } from '@/native/notifications';
import { refreshSurfaces } from '@/native/surfaces';

import {
  type CheckpointInput,
  type CheckpointPatch,
  getCheckpoint,
  insertCheckpoint,
  markCheckpointDeleted,
  patchCheckpoint,
  setCheckpointArchived,
} from './checkpoints-repo';
import { checksBetween, setCheckSnoozes } from './checks';
import { getCoolingItem, insertCoolingItem, listActiveCoolingItems, saveCoolingItem } from './cooling-repo';
import { ensureKitchen, getKitchen, type KitchenPatch, patchKitchen } from './kitchen-repo';
import { newId } from './mappers';
import { listReadingsForChecksBetween, saveReading } from './readings-repo';
import { wipeAllTables } from './reset';
import { getSettings, updateSettings as writeSettings } from './settings-repo';
import { scheduleSync } from './sync-client';
import { nowIso } from './time';

export const SNOOZE_MINUTES = 15;

type RefreshOptions = Parameters<typeof refreshSurfaces>[0];

function afterWrite(opts: RefreshOptions = {}): Promise<void> {
  scheduleSync();
  return refreshSurfaces(opts);
}

function rememberInitials(initials: string): void {
  const trimmed = initials.trim().toUpperCase();
  if (trimmed && getSettings().initialsDefault !== trimmed) writeSettings({ initialsDefault: trimmed });
}

// ---------------------------------------------------------------------------
// Checkpoint readings

export type LogReadingOptions = {
  /** Initials of the person logging (1–4 characters; remembered as the default). */
  initials: string;
  /**
   * The check this answers. Omit to pick it with shared `checkForReading` (the check the reading is
   * on time for, else the earliest open one); `null` logs an ad-hoc reading.
   */
  scheduledFor?: string | null;
  /** Required when the reading fails (`evaluateReading`); `previewReading` tells the UI first. */
  correctiveAction?: CorrectiveAction | null;
  source: ReadingSource;
  /** Unit of `valueInUnit`; defaults to the display unit (Settings). */
  unit?: Unit;
  /** Defaults to now. */
  takenAt?: string;
};

export type LogReadingResult =
  | { ok: true; reading: Reading; evaluation: Evaluation }
  | { ok: false; reason: 'not-found'; evaluation: null }
  | { ok: false; reason: 'corrective-action-required'; evaluation: Evaluation };

/**
 * Pass/fail for a value typed in `unit` (default: display unit) without saving: drive the keypad
 * colour and ask for a corrective action before calling `logReading`.
 */
export function previewReading(checkpointId: string, valueInUnit: number, unit: Unit = getSettings().unit): Evaluation | null {
  const checkpoint = getCheckpoint(checkpointId);
  if (!checkpoint) return null;
  return evaluateReading(checkpoint, toStoredF(valueInUnit, unit), unit);
}

/** The check a reading taken now would answer (its `scheduledFor`), or null for ad hoc. */
export function suggestedCheckFor(checkpointId: string, takenAt = nowIso()): string | null {
  const checkpoint = getCheckpoint(checkpointId);
  const kitchen = checkpoint ? getKitchen(checkpoint.kitchenId) : null;
  if (!checkpoint || !kitchen) return null;
  const t = Date.parse(takenAt);
  const start = new Date(t - (DEFAULT_MISSED_AFTER_MINUTES + 60) * 60_000).toISOString();
  const end = new Date(t + 24 * 3_600_000).toISOString();
  const checks = checksBetween(kitchen, start, end, checkpointId);
  const readings = listReadingsForChecksBetween(checkpoint.kitchenId, start, end);
  const { graceMinutes } = getSettings();
  return checkForReading(checks, readings, checkpointId, takenAt, graceMinutes, DEFAULT_MISSED_AFTER_MINUTES)?.scheduledFor ?? null;
}

/**
 * Logs a checkpoint reading: converts to °F (shared `toStoredF`), evaluates with shared
 * `evaluateReading`, attaches it to the check it answers, persists, clears that check's snooze and
 * refreshes reminders, badge and widgets. A failing reading without `correctiveAction` is not saved.
 */
export async function logReading(checkpointId: string, valueInUnit: number, opts: LogReadingOptions): Promise<LogReadingResult> {
  const checkpoint = getCheckpoint(checkpointId);
  if (!checkpoint || checkpoint.deletedAt) return { ok: false, reason: 'not-found', evaluation: null };
  const unit = opts.unit ?? getSettings().unit;
  const valueF = toStoredF(valueInUnit, unit);
  const evaluation = evaluateReading(checkpoint, valueF, unit);
  if (evaluation.result === 'fail' && !opts.correctiveAction) {
    return { ok: false, reason: 'corrective-action-required', evaluation };
  }
  const takenAt = opts.takenAt ?? nowIso();
  const scheduledFor = opts.scheduledFor === undefined ? suggestedCheckFor(checkpointId, takenAt) : opts.scheduledFor;
  const at = nowIso();
  const reading = saveReading({
    id: newId(),
    kitchenId: checkpoint.kitchenId,
    checkpointId,
    coolingItemId: null,
    scheduledFor,
    takenAt,
    valueF,
    result: evaluation.result,
    failReason: evaluation.failReason,
    correctiveAction: opts.correctiveAction ?? null,
    initials: opts.initials.trim().toUpperCase(),
    source: opts.source,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  rememberInitials(opts.initials);
  const answered = scheduledFor ? [checkIdFor(checkpointId, scheduledFor)] : [];
  setCheckSnoozes(answered, null);
  await afterWrite({ checkIds: answered });
  return { ok: true, reading, evaluation };
}

/** Soft-deletes a reading logged by mistake (the check becomes open / missed again). */
export async function deleteReading(reading: Reading): Promise<void> {
  const at = nowIso();
  saveReading({ ...reading, deletedAt: at, updatedAt: at });
  await afterWrite();
}

/** "Snooze 15": the check's reminder re-fires in `minutes` (the check keeps its scheduled time). */
export async function snoozeChecks(checkIds: readonly string[], minutes = SNOOZE_MINUTES): Promise<void> {
  if (!checkIds.length) return;
  setCheckSnoozes(checkIds, new Date(Date.now() + minutes * 60_000).toISOString());
  await refreshSurfaces({ checkIds: [...checkIds] });
}

// ---------------------------------------------------------------------------
// Cooling

export type StartCoolingOptions = {
  initials?: string | null;
  /** Temperature when the food came off heat, in `unit`. */
  startValue?: number | null;
  unit?: Unit;
  /** Defaults to now (back-date when the food came off heat a few minutes ago). */
  startedAt?: string;
};

/** Starts a two-stage cooling timer (stage 1: ≤ 70 °F within 2 h; stage 2: ≤ 41 °F within 6 h). */
export async function startCooling(name: string, opts: StartCoolingOptions = {}): Promise<CoolingItem> {
  const kitchen = ensureKitchen();
  const unit = opts.unit ?? getSettings().unit;
  const item = insertCoolingItem({
    kitchenId: kitchen.id,
    name: name.trim(),
    startedAt: opts.startedAt,
    startValueF: opts.startValue == null ? null : toStoredF(opts.startValue, unit),
    initials: opts.initials ? opts.initials.trim().toUpperCase() : null,
  });
  if (opts.initials) rememberInitials(opts.initials);
  await afterWrite({ coolingItemIds: [item.id] });
  return item;
}

export type LogCoolingOptions = {
  correctiveAction?: CorrectiveAction | null;
  unit?: Unit;
  source?: ReadingSource;
  takenAt?: string;
};

export type LogCoolingResult =
  | { ok: true; reading: Reading; item: CoolingItem; evaluation: CoolingEvaluation }
  | { ok: false; reason: 'not-found' | 'closed'; evaluation: null }
  | { ok: false; reason: 'corrective-action-required'; evaluation: CoolingEvaluation };

/** Shared `evaluateCooling` for a value typed now, without saving (UI preview). */
export function previewCoolingReading(itemId: string, valueInUnit: number, unit: Unit = getSettings().unit): CoolingEvaluation | null {
  const item = getCoolingItem(itemId);
  if (!item || (item.status !== 'cooling' && item.status !== 'stage1-pass')) return null;
  return evaluateCooling(item, toStoredF(valueInUnit, unit), nowIso(), { unit });
}

/**
 * Logs a cooling-stage reading with shared `evaluateCooling`: pass advances the stage (or completes),
 * pending keeps cooling, a late or warm-at-deadline reading fails the item and needs a corrective
 * action (reheat to 165 °F and restart, or discard).
 */
export async function logCoolingReading(
  itemId: string,
  valueInUnit: number,
  initials: string,
  opts: LogCoolingOptions = {},
): Promise<LogCoolingResult> {
  const item = getCoolingItem(itemId);
  if (!item || item.deletedAt) return { ok: false, reason: 'not-found', evaluation: null };
  if (item.status !== 'cooling' && item.status !== 'stage1-pass') return { ok: false, reason: 'closed', evaluation: null };
  const unit = opts.unit ?? getSettings().unit;
  const valueF = toStoredF(valueInUnit, unit);
  const takenAt = opts.takenAt ?? nowIso();
  const readingId = newId();
  const evaluation = evaluateCooling(item, valueF, takenAt, { readingId, unit });
  if (evaluation.readingResult === 'fail' && !opts.correctiveAction) {
    return { ok: false, reason: 'corrective-action-required', evaluation };
  }
  const at = nowIso();
  const reading = saveReading({
    id: readingId,
    kitchenId: item.kitchenId,
    checkpointId: null,
    coolingItemId: item.id,
    scheduledFor: null,
    takenAt,
    valueF,
    result: evaluation.readingResult,
    failReason: evaluation.failReason,
    correctiveAction: opts.correctiveAction ?? null,
    initials: initials.trim().toUpperCase(),
    source: opts.source ?? 'manual',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  const next = saveCoolingItem({
    ...item,
    ...evaluation.patch,
    ...(evaluation.readingResult === 'fail' ? { correctiveAction: opts.correctiveAction ?? null } : {}),
    updatedAt: at,
  });
  rememberInitials(initials);
  await afterWrite({ coolingItemIds: [item.id] });
  return { ok: true, reading, item: next, evaluation };
}

/** "Discarded": closes the timer with a discard corrective action. */
export async function discardCooling(itemId: string, note?: string): Promise<CoolingItem | null> {
  const item = getCoolingItem(itemId);
  if (!item || item.deletedAt) return null;
  if (item.status !== 'cooling' && item.status !== 'stage1-pass') return item;
  const at = nowIso();
  const trimmed = note?.trim();
  const next = saveCoolingItem({
    ...item,
    ...sharedDiscard(item, at),
    correctiveAction: { kind: 'discard', ...(trimmed ? { note: trimmed } : {}) },
    note: trimmed || item.note || null,
    updatedAt: at,
  });
  await afterWrite({ coolingItemIds: [itemId] });
  return next;
}

/** Records the corrective action for an item that failed by itself (missed deadline). */
export async function setCoolingCorrectiveAction(itemId: string, action: CorrectiveAction): Promise<CoolingItem | null> {
  const item = getCoolingItem(itemId);
  if (!item) return null;
  const next = saveCoolingItem({ ...item, correctiveAction: action, updatedAt: nowIso() });
  await afterWrite({ coolingItemIds: [itemId], skipNotifications: true });
  return next;
}

/**
 * Auto-fails items whose open stage deadline passed (shared `expireCooling`). Run by maintenance
 * (launch, foreground, background task) and the foreground watcher; returns the failed ids.
 */
export function expireOverdueCooling(now = nowIso()): string[] {
  const kitchen = ensureKitchen();
  const unit = getSettings().unit;
  const failed: string[] = [];
  for (const item of listActiveCoolingItems(kitchen.id)) {
    const patch = expireCooling(item, now, unit);
    if (!patch) continue;
    saveCoolingItem({ ...item, ...patch, updatedAt: now });
    failed.push(item.id);
  }
  if (failed.length) scheduleSync();
  return failed;
}

// ---------------------------------------------------------------------------
// Checkpoints and kitchen (checks are derived, so a change only needs reminders rescheduled)

export async function addCheckpoint(input: CheckpointInput): Promise<Checkpoint> {
  const kitchen = ensureKitchen();
  const checkpoint = insertCheckpoint(kitchen.id, input);
  await afterWrite();
  return checkpoint;
}

/** Edits a checkpoint; reminders follow the new cadence. */
export async function updateCheckpoint(id: string, patch: CheckpointPatch): Promise<Checkpoint> {
  const checkpoint = patchCheckpoint(id, patch);
  await afterWrite();
  return checkpoint;
}

/** Archives (stops new checks, keeps history) or restores a checkpoint. */
export async function archiveCheckpoint(id: string, archived = true): Promise<Checkpoint> {
  const checkpoint = setCheckpointArchived(id, archived);
  await afterWrite();
  return checkpoint;
}

/** Soft-deletes a checkpoint (its readings stay in history and reports). */
export async function deleteCheckpoint(id: string): Promise<void> {
  markCheckpointDeleted(id);
  await afterWrite();
}

/**
 * Edits the active kitchen (name, zone, unit, opening hours). Opening hours and zone change which checks
 * exist (reminders are rescheduled); a unit change also becomes this device's display unit.
 */
export async function updateKitchen(patch: KitchenPatch): Promise<Kitchen> {
  const kitchen = patchKitchen(ensureKitchen().id, patch);
  if (patch.unit) writeSettings({ unit: patch.unit });
  await afterWrite();
  return kitchen;
}

// ---------------------------------------------------------------------------
// Settings

/** Saves device settings; reminder lead / quiet hours / grace reschedule reminders, unit recolours widgets. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = writeSettings(patch);
  const affectsReminders = 'reminderLeadMinutes' in patch || 'quietOutsideHours' in patch || 'graceMinutes' in patch;
  await refreshSurfaces({ skipNotifications: !affectsReminders });
  return next;
}

// ---------------------------------------------------------------------------
// Danger zone

/**
 * Deletes every local row (kitchen, checkpoints, checks, readings, cooling items, settings, sync
 * state), cancels reminders, clears the Live Activities / widgets and starts over with a fresh
 * default kitchen (onboarding shows again). Server data of a shared
 * kitchen is not touched (leave the kitchen or delete the account for that).
 */
export async function deleteAllLocalData(): Promise<void> {
  await cancelAllTemplogNotifications();
  wipeAllTables();
  ensureKitchen(); // a fresh default kitchen, as on first launch (settings are back to defaults)
  await refreshSurfaces({ skipNotifications: true });
}
