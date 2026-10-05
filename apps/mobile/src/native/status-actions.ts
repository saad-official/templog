// Routes Snooze 15 / Discarded from notifications and the cooling Live Activity into actions.ts, and
// remembers the deep link of a Log now / Log reading / tap that cold-launched the app. Started at JS
// entry (index.ts) so presses that wake the app in the background are handled even when no screen is
// mounted.
import { discardCooling, snoozeChecks } from '@/data/actions';
import { ensureDatabaseReady } from '@/data/migrate';
import { createStore } from '@/data/store';

import { haptics } from './haptics';
import { addStatusActionListener, type StatusAction } from './live-status';
import { consumeLaunchNotificationResponse, SNOOZE_MINUTES } from './notifications';

/**
 * Applies a background status action (`snooze-15`, `discarded`). `log-now` / `log-reading` only
 * navigate: the open listener (surface-sync) or `pendingOpenUrl` handles them.
 */
export async function handleStatusAction(event: StatusAction): Promise<void> {
  await ensureDatabaseReady();
  switch (event.action) {
    case 'snooze-15':
      if (event.checkIds?.length) {
        await snoozeChecks(event.checkIds, SNOOZE_MINUTES);
        haptics.acknowledged();
      }
      break;
    case 'discarded':
      if (event.itemId) {
        await discardCooling(event.itemId);
        haptics.acknowledged();
      }
      break;
    default:
      break;
  }
}

/** A deep link from a notification response received before the UI subscribed (cold launch). */
export const pendingOpenUrl = createStore<string | null>(null);

let started = false;

/** Idempotent. Subscribes the unified listener and handles the response that launched the app. */
export function startStatusActionHandling(): void {
  if (started) return;
  started = true;
  addStatusActionListener((event) => {
    handleStatusAction(event).catch((e) => console.warn('[status-actions] failed', event.action, e));
  });
  consumeLaunchNotificationResponse()
    .then(async (event) => {
      if (!event) return;
      if (event.url) pendingOpenUrl.setState(event.url);
      if (event.action === 'snooze-15' || event.action === 'discarded') {
        await handleStatusAction({
          action: event.action,
          checkIds: event.checkIds,
          checkpointId: event.checkpointId,
          itemId: event.itemId,
          source: 'notification',
        });
      }
    })
    .catch(() => undefined);
}

/** Returns (and clears) the deep link of the notification response that opened the app, if any. */
export function takePendingOpenUrl(): string | null {
  const url = pendingOpenUrl.getSnapshot();
  if (url) pendingOpenUrl.setState(null);
  return url;
}
