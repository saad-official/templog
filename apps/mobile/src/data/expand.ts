// Daily planning entry point. Checks are derived on demand (see checks.ts), so "expanding" means:
// make sure the active kitchen exists, drop expired snoozes and return the checks the next `days`
// local days hold (what reminders and widgets are planned from).
import { type Check, DEFAULT_EXPANSION_DAYS, pruneCheckSnoozes, upcomingChecks } from './checks';
import { ensureKitchen } from './kitchen-repo';

export { DEFAULT_EXPANSION_DAYS } from './checks';

/**
 * Idempotent and cheap; run on launch, foreground, after a sync pull and from the daily background
 * task. Returns the upcoming checks of the active kitchen (shared `expandChecks`, deterministic ids).
 */
export function ensureChecksExpanded(days = DEFAULT_EXPANSION_DAYS): { checks: Check[] } {
  const kitchen = ensureKitchen();
  pruneCheckSnoozes();
  return { checks: upcomingChecks(kitchen, days) };
}
