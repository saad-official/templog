import { useEffect } from 'react';

import { expireOverdueCooling } from '@/data/actions';
import { useLiveQuery } from '@/data/store';
import { COOLING_TICK_MS, type DayRange, useClockTick } from '@/data/time';
import { activeCoolingViews, coolingView, type CoolingView, coolingViewsBetween } from '@/data/views';
import { refreshSurfaces } from '@/native/surfaces';

const EMPTY: CoolingView[] = [];
const COOLING_TABLES = ['cooling_items', 'readings', 'kitchens', 'settings'] as const;

/**
 * Running cooling timers (oldest first) with `deadlines`, `prompt` (`{ kind: 'stage1' | 'stage2',
 * dueAt, minutesLeft }`, negative when overdue), `progress` (0…1 of the open stage), `label` and
 * their stage `readings`. Recomputed every 15 s; an item whose stage deadline passed is auto-failed
 * (shared `expireCooling`) on the next tick, and then leaves this list.
 */
export function useCoolingItems(): CoolingView[] {
  const tick = useClockTick(COOLING_TICK_MS);
  const items = useLiveQuery(
    'cooling-active',
    COOLING_TABLES,
    () => activeCoolingViews(new Date(tick).toISOString()),
    EMPTY,
    String(tick),
  );
  const overdue = items.some((i) => i.prompt && i.prompt.minutesLeft < 0);
  useEffect(() => {
    if (!overdue) return;
    const failed = expireOverdueCooling();
    if (failed.length) refreshSurfaces({ coolingItemIds: failed }).catch(() => undefined);
  }, [overdue, tick]);
  return items;
}

/** One cooling item (any status) with prompt / progress / readings, re-evaluated every 15 s. */
export function useCoolingItem(id: string | null | undefined): CoolingView | null {
  const tick = useClockTick(COOLING_TICK_MS);
  return useLiveQuery(`cooling:${id ?? ''}`, COOLING_TABLES, () => (id ? coolingView(id, new Date(tick).toISOString()) : null), null, String(tick));
}

/** Cooling items started in a day range (any status, newest first): History and reports. */
export function useCoolingHistory(range: DayRange): CoolingView[] {
  return useLiveQuery(`cooling-range:${range.from}:${range.to}`, COOLING_TABLES, () => coolingViewsBetween(range), EMPTY);
}
