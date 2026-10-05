import { useLiveQuery } from '@/data/store';
import { BOARD_TICK_MS, useClockTick } from '@/data/time';
import { type DueCheck, dueCheckViews } from '@/data/views';

const EMPTY: DueCheck[] = [];

/**
 * Checks to act on now (state `due` or `overdue`, oldest first) with their checkpoint and readings;
 * drives the glass "due now" card and the badge. Recomputed every 30 s and on every write.
 */
export function useDueChecks(): DueCheck[] {
  const tick = useClockTick(BOARD_TICK_MS);
  return useLiveQuery(
    'due-checks',
    ['kitchens', 'checkpoints', 'readings', 'settings'],
    () => dueCheckViews(new Date(tick).toISOString()),
    EMPTY,
    String(tick),
  );
}
