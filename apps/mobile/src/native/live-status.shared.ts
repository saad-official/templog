// Notification actions as status actions (used by every live-status platform file).
import type { StatusActionListener } from './live-status.types';
import { addNotificationResponseListener } from './notifications';

export function notificationStatusListener(listener: StatusActionListener): () => void {
  return addNotificationResponseListener((e) => {
    if (e.action === 'open') return;
    listener({
      action: e.action,
      checkIds: e.checkIds,
      checkpointId: e.checkpointId,
      itemId: e.itemId,
      url: e.url,
      source: 'notification',
    });
  });
}
