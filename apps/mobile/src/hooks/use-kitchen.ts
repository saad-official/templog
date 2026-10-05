import { DEFAULT_SETTINGS, type Kitchen } from '@templog/shared/schemas';
import type { Unit } from '@templog/shared/units';

import { getActiveKitchen } from '@/data/kitchen-repo';
import { useLiveQuery } from '@/data/store';
import { displayUnit } from '@/data/views';

/**
 * The active kitchen (`{ id, name, tz, unit, openingHours, joinCode, … }`), or null until the
 * database is ready / the first launch created it. Edit with `updateKitchen(patch)` from `@/data`.
 */
export function useKitchen(): Kitchen | null {
  return useLiveQuery('kitchen', ['kitchens', 'settings'], getActiveKitchen, null);
}

/**
 * The display unit: `kitchen.unit` (every phone of a shared kitchen types and reads the same unit);
 * `settings.unit` only before a kitchen exists. Values are stored in °F: show them with shared
 * `formatTemp(displayTemp(valueF, unit), unit)`.
 */
export function useDisplayUnit(): Unit {
  return useLiveQuery('display-unit', ['kitchens', 'settings'], displayUnit, DEFAULT_SETTINGS.unit);
}
