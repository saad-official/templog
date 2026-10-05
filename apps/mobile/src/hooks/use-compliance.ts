import { useKitchenToday } from '@/data/kitchen-time';
import { useLiveQuery } from '@/data/store';
import type { DayRange } from '@/data/time';
import { type ComplianceReport, complianceFor } from '@/data/views';

export { lastKitchenDays } from '@/data/kitchen-time';
export { lastDays } from '@/data/time';

/**
 * Compliance over an inclusive kitchen-day range (`lastKitchenDays(7, useKitchenToday())` = this week): per-day shared
 * `dailyCompliance` (`scheduled, logged, onTime, failed, rate`), totals, `missed`, overall `rate`
 * (null when nothing was scheduled) and the fully-logged `streak`. Today counts checks so far.
 */
export function useCompliance(range: DayRange): ComplianceReport | null {
  const today = useKitchenToday();
  return useLiveQuery(
    `compliance:${range.from}:${range.to}`,
    ['readings', 'checkpoints', 'kitchens', 'settings'],
    () => complianceFor(range),
    null,
    today,
  );
}
