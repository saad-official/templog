// Keeps every system surface in line with the data: scheduled reminders + badge, one cooling Live
// Activity / Live Update per running timer, and widgets. Actions call `refreshSurfaces` after each
// write; the root layout calls `startSurfaceWatcher` so cooling stages auto-fail on time and the
// Android Live Update text stays current while the app is open.
import { AppState, type AppStateStatus } from 'react-native';

import { expireOverdueCooling } from '@/data/actions';
import { getCoolingItems } from '@/data/cooling-repo';
import { ensureChecksExpanded } from '@/data/expand';
import { isDatabaseReady } from '@/data/store';
import { activeCoolingViews, dueCheckViews } from '@/data/views';

import { syncCoolingStatus } from './live-status';
import {
  addTemplogNotificationReceivedListener,
  dismissDeliveredFor,
  rescheduleAll,
  setOpenChecksBadge,
} from './notifications';
import { refreshWidgetsFromDatabase } from './widgets';

export type RefreshOptions = {
  /** Checks just logged (their delivered reminders are dismissed). */
  checkIds?: string[];
  /** Cooling items just changed (prompts of closed ones are dismissed). */
  coolingItemIds?: string[];
  /** Skip rescheduling reminders (nothing that affects them changed). */
  skipNotifications?: boolean;
};

/** Badge = checks due or overdue right now. */
async function refreshBadge(): Promise<void> {
  await setOpenChecksBadge(dueCheckViews().length);
}

async function refreshCoolingStatus(): Promise<void> {
  await syncCoolingStatus(activeCoolingViews());
}

let chain: Promise<void> = Promise.resolve();

/**
 * Reschedules reminders (diffed), dismisses delivered reminders that no longer apply, syncs the
 * cooling status surfaces, refreshes widgets and the badge. Calls are serialised; failures are
 * logged, never thrown.
 */
export function refreshSurfaces(opts: RefreshOptions = {}): Promise<void> {
  chain = chain.then(async () => {
    if (!isDatabaseReady()) return;
    const closed = getCoolingItems(opts.coolingItemIds ?? [])
      .filter((i) => i.status !== 'cooling' && i.status !== 'stage1-pass')
      .map((i) => i.id);
    const jobs: Promise<unknown>[] = [];
    if (!opts.skipNotifications) jobs.push(rescheduleAll());
    if (opts.checkIds?.length || closed.length) jobs.push(dismissDeliveredFor({ checkIds: opts.checkIds, closedCoolingItemIds: closed }));
    jobs.push(refreshCoolingStatus());
    jobs.push(refreshWidgetsFromDatabase());
    jobs.push(refreshBadge());
    const results = await Promise.allSettled(jobs);
    for (const r of results) if (r.status === 'rejected') console.warn('[surfaces] refresh failed', r.reason);
  });
  return chain;
}

/**
 * Launch / foreground / daily maintenance: auto-fail cooling stages past their deadline (shared
 * `expireCooling`), plan the next 3 days of checks, then refresh everything.
 */
export async function runMaintenance(): Promise<void> {
  const failed = expireOverdueCooling();
  ensureChecksExpanded();
  await refreshSurfaces({ coolingItemIds: failed });
}

const COOLING_TICK_MS = 15_000;

let watcher: { stop(): void } | null = null;

/**
 * While the app is in the foreground: every 15 s auto-fail cooling stages whose deadline passed,
 * every minute refresh the cooling surfaces (Android Live Update text) and the badge, and run
 * maintenance on every return to the foreground. Returns a stop function. Idempotent.
 */
export function startSurfaceWatcher(): () => void {
  if (watcher) return watcher.stop;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticks = 0;
  const tick = () => {
    ticks++;
    const failed = expireOverdueCooling();
    if (failed.length) {
      refreshSurfaces({ coolingItemIds: failed }).catch(() => undefined);
    } else if (ticks % 4 === 0) {
      refreshCoolingStatus().catch(() => undefined);
      refreshBadge().catch(() => undefined);
    }
  };
  const startTimer = () => {
    if (!timer) timer = setInterval(tick, COOLING_TICK_MS);
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') {
      startTimer();
      runMaintenance().catch(() => undefined);
    } else {
      stopTimer();
    }
  };
  const appSub = AppState.addEventListener('change', onChange);
  const removeReceived = addTemplogNotificationReceivedListener(() => {
    refreshSurfaces({ skipNotifications: true }).catch(() => undefined);
  });
  if (AppState.currentState === 'active') onChange('active');
  watcher = {
    stop: () => {
      stopTimer();
      appSub.remove();
      removeReceived();
      watcher = null;
    },
  };
  return watcher.stop;
}
