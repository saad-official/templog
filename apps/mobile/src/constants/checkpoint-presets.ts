// Starter checkpoints offered during kitchen setup. Limits are never written here: they come from
// the shared Food Code defaults (`defaultLimitsFor(kind)`) when the checkpoint is created.
import { kindLabel } from '@templog/shared/limits';
import { correctiveActionLabel } from '@templog/shared/report';
import type { CheckpointKind, CorrectiveActionKind } from '@templog/shared/schemas';

export type CheckpointPreset = { key: string; name: string; kind: CheckpointKind };

export const STARTER_CHECKPOINTS: readonly CheckpointPreset[] = [
  { key: 'walk-in', name: 'Walk-in cooler', kind: 'cold-holding' },
  { key: 'reach-in', name: 'Reach-in fridge', kind: 'cold-holding' },
  { key: 'hot-well', name: 'Hot well', kind: 'hot-holding' },
  { key: 'freezer', name: 'Freezer', kind: 'freezer' },
];

export const KIND_OPTIONS: readonly { value: CheckpointKind; label: string }[] = [
  { value: 'cold-holding', label: kindLabel('cold-holding') },
  { value: 'hot-holding', label: kindLabel('hot-holding') },
  { value: 'freezer', label: kindLabel('freezer') },
  { value: 'cooking', label: kindLabel('cooking') },
  { value: 'receiving', label: kindLabel('receiving') },
];

/** Corrective actions in the order a line cook reaches for them. */
export const CORRECTIVE_ACTIONS: readonly { kind: CorrectiveActionKind; label: string; hint: string }[] = [
  { kind: 'discard', label: correctiveActionLabel({ kind: 'discard' }), hint: 'Product thrown out' },
  { kind: 'reheat', label: correctiveActionLabel({ kind: 'reheat' }), hint: 'Reheated, then re-checked' },
  { kind: 'move', label: correctiveActionLabel({ kind: 'move' }), hint: 'Moved to a working unit' },
  { kind: 'service', label: correctiveActionLabel({ kind: 'service' }), hint: 'Unit reported for repair' },
  { kind: 'other', label: correctiveActionLabel({ kind: 'other' }), hint: 'Describe what you did' },
];

/** Cooling failures: only discard or reheat-and-restart are acceptable (3-501.14). */
export const COOLING_ACTIONS: readonly CorrectiveActionKind[] = ['discard', 'reheat', 'other'];

/** Opening-hours quick picks for kitchen setup (24-hour `HH:mm`). */
export const HOURS_PRESETS: readonly { key: string; label: string; open: string; close: string }[] = [
  { key: 'breakfast', label: 'Breakfast & lunch', open: '06:00', close: '15:00' },
  { key: 'all-day', label: 'All day', open: '07:00', close: '22:00' },
  { key: 'dinner', label: 'Lunch & dinner', open: '11:00', close: '23:00' },
  { key: 'late', label: 'Late night', open: '17:00', close: '02:00' },
  { key: '24h', label: 'Open 24 h', open: '00:00', close: '00:00' },
];
