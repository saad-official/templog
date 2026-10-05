// Cooling labels for the UI, all derived from the shared FDA two-stage limits (never typed in).
import { COOLING_LIMITS } from '@templog/shared/cooling';
import { COOKING_MINIMUMS_F } from '@templog/shared/limits';
import type { CoolingStatus } from '@templog/shared/schemas';
import { displayTemp, formatTemp, type Unit } from '@templog/shared/units';

import type { StampResult } from '@/components/result-stamp';

/** `≤ 70 °F within 2 h` / `≤ 41 °F within 6 h` (stage 2 counts from the start). */
export function stageLimitLabel(stage: 1 | 2, unit: Unit): string {
  const max = stage === 1 ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF;
  const hours = stage === 1 ? COOLING_LIMITS.stage1Hours : COOLING_LIMITS.totalHours;
  return `≤ ${formatTemp(displayTemp(max, unit), unit)} within ${hours} h`;
}

/** `135 °F` the clock assumes food starts from. */
export function startLimitLabel(unit: Unit): string {
  return formatTemp(displayTemp(COOLING_LIMITS.startF, unit), unit);
}

export const OPEN_STATUSES: readonly CoolingStatus[] = ['cooling', 'stage1-pass'];

export function isOpen(status: CoolingStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Closed item → stamp (`Cooled` pass, `Failed`, `Discarded`). */
export function closedStamp(status: CoolingStatus): { result: StampResult; label: string } | null {
  if (status === 'done') return { result: 'pass', label: 'Cooled' };
  if (status === 'failed') return { result: 'fail', label: 'Failed' };
  if (status === 'discarded') return { result: 'fail', label: 'Discarded' };
  return null;
}

/** `165 °F`: reheating for hot holding (3-403.11), the restart after a missed cooling stage. */
export function reheatLabel(unit: Unit): string {
  return formatTemp(displayTemp(COOKING_MINIMUMS_F.reheat, unit), unit);
}
