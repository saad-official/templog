import { useStore } from '@/data/store';
import { type SyncStatus, syncStatus } from '@/data/sync-client';

/** Shared-kitchen sync status `{ running, lastSyncAt, error }`. Trigger a sync with `syncNow()` from `@/data`. */
export function useSyncStatus(): SyncStatus {
  return useStore(syncStatus);
}
