// The kitchen's calendar. Kitchen data (checks, the Today board, History, compliance, reports,
// exports) is bucketed into local days of the **kitchen** zone (`kitchen.tz`), not the phone's: a
// food truck owner checking the log from another zone still sees the kitchen's day. Device-zone
// helpers in `time.ts` (`todayKey()`, `useToday()`, `lastDays(n)`) stay for device-only concerns.
import { addDaysToKey, type DayKey } from '@templog/shared/tz';

import { getActiveKitchen } from './kitchen-repo';
import { isDatabaseReady, useLiveQuery, useStore } from './store';
import { dayStore, type DayRange, deviceTimeZone, todayKey } from './time';

/** IANA zone of the active kitchen; the device zone before setup / migrations. */
export function kitchenTimeZone(): string {
  if (!isDatabaseReady()) return deviceTimeZone();
  return getActiveKitchen()?.tz ?? deviceTimeZone();
}

/** The kitchen's local day key at `now` (default: now). */
export function kitchenDayKey(now: number | string = Date.now()): DayKey {
  return todayKey(kitchenTimeZone(), typeof now === 'string' ? Date.parse(now) : now);
}

/**
 * The last `n` kitchen days ending `to` (default: the kitchen's today), inclusive. Pass the key from
 * `useKitchenToday()` in render so the range rolls at the kitchen's midnight.
 */
export function lastKitchenDays(n: number, to: DayKey = kitchenDayKey()): DayRange {
  return { from: addDaysToKey(to, -(Math.max(1, n) - 1)), to };
}

/** The kitchen zone as a reactive value (re-renders when the kitchen or its zone changes). */
export function useKitchenTimeZone(): string {
  return useLiveQuery('kitchen-tz', ['kitchens', 'settings'], kitchenTimeZone, deviceTimeZone());
}

/** The kitchen's local day key; re-renders at the kitchen's midnight, on a zone edit and on foreground. */
export function useKitchenToday(): DayKey {
  const tz = useKitchenTimeZone();
  return useStore(dayStore(tz));
}
