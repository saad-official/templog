// One call from the root layout starts everything native: `startNativeServices()`.
// Headless entry points (background task, Android widget handler, notification / Live Activity
// actions) are registered separately at JS entry (native/entry.ts, imported by index.ts).
import { registerPushDevice } from '@/data/devices';
import { ensureKitchen } from '@/data/kitchen-repo';
import { hydrateKitchens, refreshKitchens } from '@/data/kitchens-client';
import { ensureDatabaseReady } from '@/data/migrate';
import { hydrateSyncStatus, syncNow } from '@/data/sync-client';
import { todayStore } from '@/data/time';

import { registerBackgroundTasks } from './background';
import { addNotificationOpenListener, setupNotifications } from './notifications';
import { takePendingOpenUrl } from './status-actions';
import { refreshSurfaces, runMaintenance, startSurfaceWatcher } from './surfaces';

export { refreshSurfaces as syncNativeSurfaces, runMaintenance } from './surfaces';

let boot: Promise<void> | null = null;

/**
 * Idempotent start sequence: migrate, create the local kitchen on first launch, notification
 * channels / categories, background task registration, auto-fail overdue cooling + plan checks +
 * reschedule reminders + cooling Live Activities / Live Updates + widgets + badge, then (when signed
 * in) refresh shared kitchens, register the push token and sync.
 */
export function initializeNativeServices(): Promise<void> {
  if (!boot) {
    boot = (async () => {
      await ensureDatabaseReady();
      ensureKitchen();
      hydrateKitchens();
      hydrateSyncStatus();
      await setupNotifications().catch((e) => console.warn('[surface-sync] notification setup failed', e));
      await registerBackgroundTasks();
      await runMaintenance().catch((e) => console.warn('[surface-sync] maintenance failed', e));
      void (async () => {
        await refreshKitchens().catch(() => undefined);
        await registerPushDevice().catch(() => undefined);
        await syncNow();
      })();
    })().catch((error) => {
      boot = null;
      throw error;
    });
  }
  return boot;
}

export type NativeServicesOptions = {
  /**
   * A notification response that should navigate: `templog://log/<checkpointId>[?scheduledFor=…]`
   * (check reminder tap / Log now), `templog://cooling/<itemId>` (cooling prompt tap / Log reading),
   * `templog://today` (grouped reminders). Typically `(url) => router.push(url)`.
   */
  onOpenUrl?: (url: string) => void;
};

/**
 * Root layout: `useEffect(() => (db.success ? startNativeServices({ onOpenUrl }) : undefined), [db.success])`.
 * Runs `initializeNativeServices`, then while mounted: auto-fails cooling stages every 15 s in the
 * foreground, runs maintenance on every return to the foreground and at local midnight, and forwards
 * notification responses to `onOpenUrl` (including the one that cold-launched the app). Returns a
 * cleanup function.
 */
export function startNativeServices(opts: NativeServicesOptions = {}): () => void {
  let disposed = false;
  initializeNativeServices()
    .then(() => {
      if (disposed) return;
      const pending = takePendingOpenUrl();
      if (pending) opts.onOpenUrl?.(pending);
    })
    .catch((e) => console.warn('[surface-sync] start failed', e));

  const stopWatcher = startSurfaceWatcher();
  const offOpen = addNotificationOpenListener((url) => opts.onOpenUrl?.(url));

  let day = todayStore.getSnapshot();
  const offDay = todayStore.subscribe(() => {
    const next = todayStore.getSnapshot();
    if (next === day) return;
    day = next;
    runMaintenance()
      .then(() => refreshSurfaces({ skipNotifications: true }))
      .catch(() => undefined);
  });

  return () => {
    disposed = true;
    stopWatcher();
    offOpen();
    offDay();
  };
}
