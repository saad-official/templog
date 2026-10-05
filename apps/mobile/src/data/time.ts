// Time zones, "today", and ticking clocks for hooks whose result depends on the time (due /
// overdue / missed checks every 30 s, cooling countdowns every 15 s, the day rolling at midnight).
// Kitchen schedules are expanded in the kitchen's zone (`kitchen.tz`); helpers take the zone
// explicitly and default to the device zone. Kitchen-zone shortcuts (`kitchenDayKey`,
// `lastKitchenDays`, `useKitchenToday`) live in `kitchen-time.ts`.
import { addDaysToKey, type DayKey, dayKeyOf, zonedMidnight } from '@templog/shared/tz';
import { getCalendars } from 'expo-localization';
import { AppState } from 'react-native';

import { createStore, type Store, useStore } from './store';

/** IANA zone of the device right now (re-read every call: food trucks travel). */
export function deviceTimeZone(): string {
  try {
    const tz = getCalendars()[0]?.timeZone;
    if (tz) return tz;
  } catch {
    // fall through
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const nowIso = () => new Date().toISOString();

export function todayKey(tz = deviceTimeZone(), at: number = Date.now()): DayKey {
  return dayKeyOf(at, tz);
}

/** UTC ISO bounds `[start, end)` of local day `key` in `tz`. */
export function dayBounds(key: DayKey, tz = deviceTimeZone()): { start: string; end: string } {
  return {
    start: new Date(zonedMidnight(key, tz)).toISOString(),
    end: new Date(zonedMidnight(addDaysToKey(key, 1), tz)).toISOString(),
  };
}

/** Inclusive local-day range `{ from, to }` (e.g. History, compliance, exports). */
export type DayRange = { from: DayKey; to: DayKey };

/** UTC ISO bounds `[start, end)` of an inclusive day range. */
export function rangeBounds(range: DayRange, tz = deviceTimeZone()): { start: string; end: string } {
  return { start: dayBounds(range.from, tz).start, end: dayBounds(range.to, tz).end };
}

/** The last `n` local days ending today (`lastDays(7)` = this week so far + 6 days back). */
export function lastDays(n: number, tz = deviceTimeZone()): DayRange {
  const to = todayKey(tz);
  return { from: addDaysToKey(to, -(Math.max(1, n) - 1)), to };
}

/** `8:00 PM` / `20:00` per device locale, in `tz`. */
export function formatClock(iso: string, tz = deviceTimeZone()): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(
      new Date(Date.parse(iso)),
    );
  } catch {
    return iso.slice(11, 16);
  }
}

// ---------------------------------------------------------------------------
// Ticking stores. Timers start with the first subscriber and stop with the last, and both
// re-sync when the app returns to the foreground (JS timers do not run in the background).

function tickingStore<T>(read: () => T, schedule: (fire: () => void) => () => void, equal: (a: T, b: T) => boolean): Store<T> {
  const inner = createStore<T>(read());
  let stop: (() => void) | null = null;
  let appSub: { remove(): void } | null = null;
  let count = 0;
  const refresh = () => {
    const next = read();
    if (!equal(inner.getSnapshot(), next)) inner.setState(next);
  };
  const start = () => {
    stop = schedule(() => {
      refresh();
      stop?.();
      start();
    });
  };
  return {
    getSnapshot: inner.getSnapshot,
    setState: inner.setState,
    subscribe(listener) {
      const unsub = inner.subscribe(listener);
      if (count++ === 0) {
        refresh();
        start();
        appSub = AppState.addEventListener('change', (s) => {
          if (s === 'active') refresh();
        });
      }
      return () => {
        unsub();
        if (--count === 0) {
          stop?.();
          stop = null;
          appSub?.remove();
          appSub = null;
        }
      };
    },
  };
}

const ticks = new Map<number, Store<number>>();

/** Epoch ms floored to `ms`, ticking on the boundary while subscribed. */
export function tickStore(ms: number): Store<number> {
  let store = ticks.get(ms);
  if (!store) {
    store = tickingStore(
      () => Math.floor(Date.now() / ms) * ms,
      (fire) => {
        const id = setTimeout(fire, ms - (Date.now() % ms) + 50);
        return () => clearTimeout(id);
      },
      (a, b) => a === b,
    );
    ticks.set(ms, store);
  }
  return store;
}

export const BOARD_TICK_MS = 30_000;
export const COOLING_TICK_MS = 15_000;

const dayStores = new Map<string, Store<DayKey>>();

/**
 * Local day key in `tz` (omitted: the device zone, re-read on every tick), flipping at local
 * midnight in that zone. One store per zone, shared by every subscriber.
 */
export function dayStore(tz?: string): Store<DayKey> {
  const key = tz ?? '';
  let store = dayStores.get(key);
  if (!store) {
    const zone = () => tz ?? deviceTimeZone();
    store = tickingStore(
      () => todayKey(zone()),
      (fire) => {
        const z = zone();
        const next = zonedMidnight(addDaysToKey(todayKey(z), 1), z);
        // Cap the wait so a time-zone change or clock jump is noticed within an hour.
        const id = setTimeout(fire, Math.min(Math.max(next - Date.now() + 250, 1000), 3_600_000));
        return () => clearTimeout(id);
      },
      (a, b) => a === b,
    );
    dayStores.set(key, store);
  }
  return store;
}

/** Local day key of the device, flipping at local midnight. */
export const todayStore: Store<DayKey> = dayStore();

/**
 * Device-local day key; re-renders at local midnight (and on return to the foreground). For
 * device-only concerns; kitchen data (board, history, reports) uses `useKitchenToday()`.
 */
export function useToday(): DayKey {
  return useStore(todayStore);
}

/** Epoch ms floored to `ms` (default 30 s); re-renders on each tick while mounted. */
export function useClockTick(ms: number = BOARD_TICK_MS): number {
  return useStore(tickStore(ms));
}
