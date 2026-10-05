// Background work. Task definitions must run at module scope of the JS entry (index.ts): the OS can
// start a headless JS runtime that never renders the root layout.
//  - TEMPLOG_DAILY (expo-background-task): auto-fail overdue cooling stages, plan 3 days of checks,
//    reschedule reminders, refresh widgets, Live Activities / Live Updates and the badge, then sync a
//    shared kitchen.
//  - TEMPLOG_NOTIFICATION_ACTIONS (expo-notifications): Android runs it for action-button taps
//    (Snooze 15, Discarded) while the app is backgrounded or killed.
import * as BackgroundTask from 'expo-background-task';
import type { NotificationTaskPayload } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ensureKitchen } from '@/data/kitchen-repo';
import { ensureDatabaseReady } from '@/data/migrate';
import { syncNow } from '@/data/sync-client';

import { claimNotificationResponse } from './notifications';
import { handleStatusAction } from './status-actions';
import { runMaintenance } from './surfaces';

export const DAILY_TASK = 'TEMPLOG_DAILY';
export const NOTIFICATION_TASK = 'TEMPLOG_NOTIFICATION_ACTIONS';
/** Minutes. Android WorkManager's floor is 15; the OS decides the real cadence. */
const DAILY_INTERVAL_MINUTES = 6 * 60;

export function defineBackgroundTasks(): void {
  if (!TaskManager.isTaskDefined(DAILY_TASK)) {
    TaskManager.defineTask(DAILY_TASK, async () => {
      try {
        await ensureDatabaseReady();
        ensureKitchen();
        await runMaintenance();
        await syncNow();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (error) {
        console.warn('[background] daily task failed', error);
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  }
  if (!TaskManager.isTaskDefined(NOTIFICATION_TASK)) {
    TaskManager.defineTask<NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
      if (error || !data || !('actionIdentifier' in data)) return;
      const event = claimNotificationResponse(data);
      if (!event || (event.action !== 'snooze-15' && event.action !== 'discarded')) return;
      await handleStatusAction({
        action: event.action,
        checkIds: event.checkIds,
        checkpointId: event.checkpointId,
        itemId: event.itemId,
        source: 'notification',
      });
    });
  }
}

/** Registers both tasks with the OS. Called by `startNativeServices`; safe to repeat. */
export async function registerBackgroundTasks(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Available && !(await TaskManager.isTaskRegisteredAsync(DAILY_TASK))) {
      await BackgroundTask.registerTaskAsync(DAILY_TASK, { minimumInterval: DAILY_INTERVAL_MINUTES });
    }
  } catch (error) {
    console.warn('[background] daily task registration failed', error);
  }
  if (Platform.OS === 'android') {
    try {
      await Notifications.registerTaskAsync(NOTIFICATION_TASK);
    } catch (error) {
      console.warn('[background] notification task registration failed', error);
    }
  }
}

/** Dev only: run the daily task now (debug builds). */
export function triggerDailyTaskForTesting(): Promise<boolean> {
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}
