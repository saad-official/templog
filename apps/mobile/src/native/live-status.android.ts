// Android: one Live Update (expo-live-updates) per running cooling timer on Android 16+, with a
// two-segment progress bar (stage 1: 2 h, stage 2: 4 h); an ongoing notification below that.
// Live Updates have no action buttons in expo-live-updates 0.1: a tap opens
// `templog://cooling/<id>`; "Log reading" / "Discarded" come from the `cooling` notification actions
// (prompts and the fallback ongoing notification).
import { COOLING_LIMITS } from '@templog/shared/cooling';
import { addNotificationStateChangeListener, startLiveUpdate, stopLiveUpdate, updateLiveUpdate } from 'expo-live-updates';
// The package index does not re-export its state/config types.
import type { LiveUpdateConfig, LiveUpdateState } from 'expo-live-updates/build/types';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { formatClock } from '@/data/time';
import { displayUnit, type CoolingView } from '@/data/views';

import { notificationStatusListener } from './live-status.shared';
import { type CoolingStatusView, type StatusActionListener, toCoolingStatusView } from './live-status.types';
import {
  dismissCoolingStatusNotification,
  getNotificationPermission,
  presentCoolingStatusNotification,
  presentedCoolingStatusIds,
} from './notifications';

export type { CoolingStatusView, StatusAction, StatusActionListener, StatusActionSource } from './live-status.types';

// Live Updates exist from API 36 (promoted to the status-bar chip on 36.1+; on 36.0 they render as a
// regular ongoing notification, which is still right). Older versions get our own notification.
const LIVE_UPDATES_MIN_API = 36;
const usesLiveUpdates = () => Number(Platform.Version) >= LIVE_UPDATES_MIN_API;
const TOTAL_MINUTES = COOLING_LIMITS.totalHours * 60;
const STAGE1_MINUTES = COOLING_LIMITS.stage1Hours * 60;

// Notification ids must survive an app kill, or a Live Update could never be stopped. itemId → id.
const STATE_KEY = 'templog.liveUpdate.cooling';

function stored(): Record<string, number> {
  try {
    const raw = Storage.getItemSync(STATE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function remember(map: Record<string, number>): void {
  try {
    if (Object.keys(map).length) Storage.setItemSync(STATE_KEY, JSON.stringify(map));
    else Storage.removeItemSync(STATE_KEY);
  } catch {
    // best effort
  }
}

function minutesLeftLabel(v: CoolingStatusView): string {
  const minutes = Math.ceil((v.dueAtMs - Date.now()) / 60_000);
  if (minutes <= 0) return 'late';
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes}m`;
}

function toLiveUpdate(v: CoolingStatusView): { state: LiveUpdateState; config: LiveUpdateConfig } {
  const c = v.palette.light;
  return {
    state: {
      title: v.name,
      text: v.label,
      subText: `${v.stageLabel} by ${formatClock(new Date(v.dueAtMs).toISOString())}`,
      progress: {
        max: TOTAL_MINUTES,
        progress: Math.round(v.totalProgress * TOTAL_MINUTES),
        segments: [
          { length: STAGE1_MINUTES, color: c.accent },
          { length: TOTAL_MINUTES - STAGE1_MINUTES, color: c.cold },
        ],
        points: [{ position: STAGE1_MINUTES, color: c.warning }],
      },
      // Status-bar chip (≤ 7 characters).
      shortCriticalText: minutesLeftLabel(v),
      showTime: true,
      time: v.dueAtMs,
    },
    config: { deepLinkUrl: v.url, iconBackgroundColor: c.accent },
  };
}

async function fallbackNotification(v: CoolingStatusView): Promise<void> {
  await presentCoolingStatusNotification({ itemId: v.itemId, title: v.name, body: v.label });
}

let chain: Promise<void> = Promise.resolve();

export function syncCoolingStatus(items: readonly CoolingView[]): Promise<void> {
  chain = chain.then(() => syncOnce(items)).catch((e) => console.warn('[live-status] sync failed', e));
  return chain;
}

async function syncOnce(items: readonly CoolingView[]): Promise<void> {
  const unit = displayUnit();
  const views = items.flatMap((i) => toCoolingStatusView(i, unit) ?? []);
  const wanted = new Set(views.map((v) => v.itemId));
  const map = stored();

  // End surfaces of closed items.
  for (const [itemId, id] of Object.entries(map)) {
    if (wanted.has(itemId)) continue;
    try {
      stopLiveUpdate(id);
    } catch {
      // already gone
    }
    delete map[itemId];
  }
  for (const itemId of await presentedCoolingStatusIds()) {
    if (!wanted.has(itemId) || usesLiveUpdates()) await dismissCoolingStatusNotification(itemId);
  }
  if (!views.length || (await getNotificationPermission()).status !== 'granted') {
    remember(map);
    return;
  }

  for (const v of views) {
    if (!usesLiveUpdates()) {
      await fallbackNotification(v);
      continue;
    }
    const { state, config } = toLiveUpdate(v);
    const existing = map[v.itemId];
    if (existing !== undefined) {
      try {
        updateLiveUpdate(existing, state, config);
        continue;
      } catch (error) {
        console.warn('[live-status] updateLiveUpdate failed; restarting', error);
        try {
          stopLiveUpdate(existing);
        } catch {
          // already gone
        }
      }
    }
    try {
      const id = startLiveUpdate(state, config);
      if (typeof id === 'number') map[v.itemId] = id;
      else await fallbackNotification(v);
    } catch (error) {
      console.warn('[live-status] startLiveUpdate failed; using an ongoing notification', error);
      await fallbackNotification(v);
    }
  }
  remember(map);
}

export function addStatusActionListener(listener: StatusActionListener): () => void {
  const liveSub = addNotificationStateChangeListener((event) => {
    if (event.action !== 'dismissed' && event.action !== 'stopped') return;
    const map = stored();
    const entry = Object.entries(map).find(([, id]) => id === event.notificationId);
    if (entry) {
      delete map[entry[0]];
      remember(map);
    }
  });
  const removeNotifications = notificationStatusListener(listener);
  return () => {
    liveSub?.remove();
    removeNotifications();
  };
}
