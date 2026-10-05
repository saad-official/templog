import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getNotificationPermission, type NotificationPermission } from '@/native/notifications';

/**
 * Notification permission, re-read whenever the app returns to the foreground (it may have been
 * changed in Settings). Null while loading. Ask with `requestNotificationPermission()`.
 */
export function useNotificationPermission(): NotificationPermission | null {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => {
    const read = () => {
      getNotificationPermission()
        .then(setPermission)
        .catch(() => undefined);
    };
    read();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') read();
    });
    return () => sub.remove();
  }, []);
  return permission;
}
