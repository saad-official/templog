import { useEffect } from 'react';

import { type KitchenMemberView, type KitchensState, kitchensStore, refreshKitchens } from '@/data/kitchens-client';
import { useStore } from '@/data/store';

const NO_MEMBERS: KitchenMemberView[] = [];
const selectActiveMembers = (s: KitchensState) => s.active?.members ?? NO_MEMBERS;

/**
 * Members of the active kitchen when it is shared (`[]` for a solo kitchen or signed out), from the
 * cached `GET /api/kitchens` (works offline). Refreshes on mount unless `refreshOnMount: false`.
 */
export function useKitchenMembers(opts: { refreshOnMount?: boolean } = {}): KitchenMemberView[] {
  const members = useStore(kitchensStore, selectActiveMembers);
  const refreshOnMount = opts.refreshOnMount ?? true;
  useEffect(() => {
    if (refreshOnMount) refreshKitchens().catch(() => undefined);
  }, [refreshOnMount]);
  return members;
}

const refresh = () => refreshKitchens().then(() => undefined);

/**
 * All shared kitchens of the signed-in user (`{ kitchens, active, loading, error, updatedAt }`, cached)
 * plus `refresh()`. `active` is the server view of the active kitchen (with `joinCode` for the owner).
 */
export function useSharedKitchens(): KitchensState & { refresh: () => Promise<void> } {
  const state = useStore(kitchensStore);
  return { ...state, refresh };
}
