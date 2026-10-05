import { useLiveQuery } from '@/data/store';
import { type DayRange, useToday } from '@/data/time';
import { type ComplianceReport, complianceFor } from '@/data/views';

export { lastDays } from '@/data/time';

/**
 * Compliance over an inclusive local-day range (`lastDays(7)` = this week): per-day shared
 * `dailyCompliance` (`scheduled, logged, onTime, failed, rate`), totals, `missed`, overall `rate`
 * (null when nothing was scheduled) and the fully-logged `streak`. Today counts checks so far.
 */
export function useCompliance(range: DayRange): ComplianceReport | null {
  const today = useToday();
  return useLiveQuery(
    `compliance:${range.from}:${range.to}`,
    ['readings', 'checkpoints', 'kitchens', 'settings'],
    () => complianceFor(range),
    null,
    today,
  );
}
