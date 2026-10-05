// Default (web) implementation: no system status surface, but notification actions still flow
// through `addStatusActionListener`. iOS: live-status.ios.ts, Android: live-status.android.ts.
import type { CoolingView } from '@/data/views';

import { notificationStatusListener } from './live-status.shared';
import type { StatusActionListener } from './live-status.types';

export type { CoolingStatusView, StatusAction, StatusActionListener, StatusActionSource } from './live-status.types';

/**
 * Shows, updates or ends one status surface per running cooling timer: iOS Live Activity
 * `Cooling`, Android 16 Live Update, or an ongoing notification below Android 16. Items missing
 * from `items` (cooled, failed, discarded) end.
 */
export async function syncCoolingStatus(_items: readonly CoolingView[]): Promise<void> {}

/** Unified Log now / Snooze 15 / Log reading / Discarded events from every surface. Returns unsubscribe. */
export function addStatusActionListener(listener: StatusActionListener): () => void {
  return notificationStatusListener(listener);
}
