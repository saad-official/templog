import type { Kitchen } from '@templog/shared/schemas';

import { getActiveKitchen } from '@/data/kitchen-repo';
import { useLiveQuery } from '@/data/store';

/**
 * The active kitchen (`{ id, name, tz, unit, openingHours, joinCode, … }`), or null until the
 * database is ready / the first launch created it. Edit with `updateKitchen(patch)` from `@/data`.
 */
export function useKitchen(): Kitchen | null {
  return useLiveQuery('kitchen', ['kitchens', 'settings'], getActiveKitchen, null);
}
