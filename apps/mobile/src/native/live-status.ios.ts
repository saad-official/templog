// iOS: one `Cooling` Live Activity (expo-widgets) per running cooling timer, on the Lock Screen and
// in the Dynamic Island.
import Storage from 'expo-sqlite/kv-store';
import { addUserInteractionListener, type LiveActivity } from 'expo-widgets';

import { formatClock } from '@/data/time';
import { displayUnit, type CoolingView } from '@/data/views';
import CoolingActivity, { type CoolingActivityProps } from '@/widgets/cooling.activity';

import { notificationStatusListener } from './live-status.shared';
import { type CoolingStatusView, type StatusActionListener, toCoolingStatusView } from './live-status.types';

export type { CoolingStatusView, StatusAction, StatusActionListener, StatusActionSource } from './live-status.types';

// Survives app restarts: Live Activities outlive the JS runtime. itemId → ActivityKit id.
const STATE_KEY = 'templog.liveActivity.cooling';

function stored(): Record<string, string> {
  try {
    const raw = Storage.getItemSync(STATE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function remember(map: Record<string, string>): void {
  try {
    if (Object.keys(map).length) Storage.setItemSync(STATE_KEY, JSON.stringify(map));
    else Storage.removeItemSync(STATE_KEY);
  } catch {
    // best effort
  }
}

function toProps(v: CoolingStatusView): CoolingActivityProps {
  const pick = (c: CoolingStatusView['palette']['light']) => ({
    surface: c.surface,
    text: c.text,
    textSecondary: c.textSecondary,
    accent: c.accent,
    accentText: c.accentText,
    warning: c.warning,
  });
  return {
    itemId: v.itemId,
    name: v.name,
    stageLabel: v.stageLabel,
    dueLabel: formatClock(new Date(v.dueAtMs).toISOString()),
    stageStartMs: v.stageStartMs,
    dueAtMs: v.dueAtMs,
    url: v.url,
    palette: { light: pick(v.palette.light), dark: pick(v.palette.dark) },
  };
}

function instances(): LiveActivity<CoolingActivityProps>[] {
  try {
    return CoolingActivity.getInstances();
  } catch {
    return [];
  }
}

const idOf = (a: LiveActivity<CoolingActivityProps>) => {
  try {
    return a.getId();
  } catch {
    return '';
  }
};

let chain: Promise<void> = Promise.resolve();

export function syncCoolingStatus(items: readonly CoolingView[]): Promise<void> {
  chain = chain.then(() => syncOnce(items)).catch((e) => console.warn('[live-status] sync failed', e));
  return chain;
}

async function syncOnce(items: readonly CoolingView[]): Promise<void> {
  const unit = displayUnit();
  const views = items.flatMap((i) => toCoolingStatusView(i, unit) ?? []);
  const map = stored();
  const live = instances();
  const byActivityId = new Map(live.map((a) => [idOf(a), a]));
  const next: Record<string, string> = {};
  const used = new Set<string>();

  for (const v of views) {
    const props = toProps(v);
    // Stale at the deadline: the activity shows "Overdue" by itself if the app is not running.
    const staleDate = new Date(v.dueAtMs);
    const existing = map[v.itemId] ? byActivityId.get(map[v.itemId]!) : undefined;
    if (existing) {
      try {
        await existing.update(props, staleDate);
        next[v.itemId] = idOf(existing);
        used.add(idOf(existing));
        continue;
      } catch (error) {
        console.warn('[live-status] Live Activity update failed; restarting', error);
        await existing.end('immediate').catch(() => undefined);
      }
    }
    try {
      // Starting needs the app in the foreground (no push-to-start in v0.1).
      const activity = CoolingActivity.start(props, v.url, staleDate);
      next[v.itemId] = idOf(activity);
      used.add(idOf(activity));
    } catch (error) {
      // Live Activities off in Settings, app in background, or the system limit reached.
      console.warn('[live-status] Live Activity start failed', error);
    }
  }
  // End activities of closed items (cooled, failed, discarded) and strays.
  await Promise.all(live.filter((a) => !used.has(idOf(a))).map((a) => a.end('default').catch(() => undefined)));
  remember(next);
}

export function addStatusActionListener(listener: StatusActionListener): () => void {
  const sub = addUserInteractionListener((event) => {
    const [action, itemId] = event.target.split(':');
    if (action !== 'discarded' || !itemId) return;
    listener({ action: 'discarded', itemId, source: 'live-activity' });
  });
  const removeNotifications = notificationStatusListener(listener);
  return () => {
    sub.remove();
    removeNotifications();
  };
}
