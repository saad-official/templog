import { useLiveQuery } from '@/data/store';
import { BOARD_TICK_MS, useClockTick } from '@/data/time';
import { todayBoard, type TodayBoard } from '@/data/views';

const BOARD_TABLES = ['kitchens', 'checkpoints', 'readings', 'settings'] as const;

/**
 * The Today board (null until the database is ready): every live checkpoint with its latest reading,
 * today's checks and a `status` (`overdue | due | missed | upcoming | done | none`, items sorted by
 * urgency), the `next` check, today's `compliance` so far, `counts` and the fully-logged `streak`.
 * Recomputed every 30 s and on every write.
 */
export function useTodayBoard(): TodayBoard | null {
  const tick = useClockTick(BOARD_TICK_MS);
  return useLiveQuery('today-board', BOARD_TABLES, () => todayBoard(new Date(tick).toISOString()), null, String(tick));
}
