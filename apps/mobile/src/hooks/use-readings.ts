import type { DayKey } from '@templog/shared/tz';

import { useLiveQuery } from '@/data/store';
import { BOARD_TICK_MS, type DayRange, useClockTick } from '@/data/time';
import { type CheckView, dayCheckViews, readingViews, type ReadingView } from '@/data/views';
import type { Checkpoint } from '@templog/shared/schemas';

const EMPTY: ReadingView[] = [];
const EMPTY_CHECKS: (CheckView & { checkpoint: Checkpoint })[] = [];
const TABLES = ['readings', 'checkpoints', 'cooling_items', 'kitchens', 'settings'] as const;

/**
 * Readings taken in an inclusive local-day range (oldest first), optionally one checkpoint's, each
 * with its `checkpoint` or `coolingItem` and the display `unit` (values are °F: show them with
 * shared `formatTemp(displayTemp(r.valueF, r.unit), r.unit)`).
 */
export function useReadings(range: DayRange, checkpointId?: string | null): ReadingView[] {
  return useLiveQuery(
    `readings:${range.from}:${range.to}:${checkpointId ?? ''}`,
    TABLES,
    () => readingViews(range, checkpointId ?? undefined),
    EMPTY,
  );
}

/**
 * Every check of a local day with its state (`logged | missed | overdue | due | upcoming`), readings
 * and checkpoint: the History day timeline, where missed checks are shown explicitly.
 */
export function useDayChecks(dayKey: DayKey): (CheckView & { checkpoint: Checkpoint })[] {
  const tick = useClockTick(BOARD_TICK_MS);
  return useLiveQuery(`day-checks:${dayKey}`, TABLES, () => dayCheckViews(dayKey, new Date(tick).toISOString()), EMPTY_CHECKS, String(tick));
}
