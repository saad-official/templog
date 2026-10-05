// Shared-kitchen API wrapper (`/api/kitchens*`) plus a cached view for `useKitchenMembers()` /
// `useSharedKitchens()`. Solo use needs none of this: a kitchen only goes to the server when the
// owner shares it (same id as the local kitchen) or a teammate joins with the code.
import type { CheckState } from '@templog/shared/schedule';
import type { Checkpoint, CorrectiveAction, Kitchen } from '@templog/shared/schemas';

import { ApiError, apiFetch } from './api';
import { isSignedIn } from './auth-client';
import { createKitchen, getActiveKitchen, getKitchen, listKitchens, patchKitchen, setActiveKitchen } from './kitchen-repo';
import { getAppValue, setAppValue } from './settings-repo';
import { createStore } from './store';
import { resetSyncCursors } from './sync-state-repo';
import { deviceTimeZone, todayKey } from './time';

// Response types mirror apps/web/lib/services/{kitchens,today}.ts.
export type KitchenRole = 'owner' | 'staff';

export type KitchenMemberView = {
  userId: string;
  displayName: string;
  initials: string | null;
  role: KitchenRole;
  joinedAt: string;
};

export type SharedKitchenView = {
  id: string;
  name: string;
  tz: string;
  unit: 'F' | 'C';
  openingHours: Kitchen['openingHours'];
  /** The owner's account name (Better Auth `user.name`). */
  ownerName: string;
  isOwner: boolean;
  role: KitchenRole;
  /** Only the owner sees (and shares) the invite code. */
  inviteCode: string | null;
  createdAt: string;
  members: KitchenMemberView[];
};

type CheckCounts = Record<CheckState, number>;

/** Server "today" view of a shared kitchen (`GET /api/kitchens/:id/today`): the kitchen at a glance. */
export type KitchenTodayView = {
  kitchenId: string;
  name: string;
  tz: string;
  unit: 'F' | 'C';
  date: string;
  generatedAt: string;
  counts: CheckCounts & { failsToday: number };
  checkpoints: {
    id: string;
    name: string;
    kind: string;
    limits: Checkpoint['limits'];
    sortOrder: number;
    latestReading: {
      id: string;
      valueF: number;
      result: 'pass' | 'fail';
      takenAt: string;
      initials: string;
      correctiveAction: CorrectiveAction | null;
    } | null;
    next: { scheduledFor: string; state: 'due' | 'overdue' | 'upcoming'; minutesUntil: number } | null;
    checks: CheckCounts;
  }[];
  openCooling: {
    id: string;
    name: string;
    status: string;
    startedAt: string;
    stage: 'stage1' | 'stage2';
    dueAt: string;
    minutesLeft: number;
    initials: string | null;
  }[];
};

export type KitchensState = {
  kitchens: SharedKitchenView[];
  /** The server view of the active kitchen, when it is shared. */
  active: SharedKitchenView | null;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
};

const CACHE_KEY = 'sharedKitchens';

function stateFrom(kitchens: SharedKitchenView[], extra: Partial<KitchensState> = {}): KitchensState {
  const activeId = getActiveKitchen()?.id ?? null;
  return {
    kitchens,
    active: kitchens.find((k) => k.id === activeId) ?? null,
    loading: false,
    error: null,
    updatedAt: null,
    ...extra,
  };
}

/** Cached shared kitchens (persisted, so sync knows offline whether the active kitchen is shared). */
export const kitchensStore = createStore<KitchensState>({ kitchens: [], active: null, loading: false, error: null, updatedAt: null });
let hydrated = false;

/** Loads the persisted cache once (after migrations). */
export function hydrateKitchens(): void {
  if (hydrated) return;
  hydrated = true;
  const cached = getAppValue<{ kitchens: SharedKitchenView[]; updatedAt: string } | null>(CACHE_KEY, null);
  if (cached) kitchensStore.setState(stateFrom(cached.kitchens, { updatedAt: cached.updatedAt }));
}

function save(kitchens: SharedKitchenView[]): SharedKitchenView[] {
  const updatedAt = new Date().toISOString();
  setAppValue(CACHE_KEY, { kitchens, updatedAt });
  kitchensStore.setState(stateFrom(kitchens, { updatedAt }));
  return kitchens;
}

/** Recomputes `active` after the active kitchen changed. */
function refreshActive(): void {
  kitchensStore.setState((s) => stateFrom(s.kitchens, { updatedAt: s.updatedAt, error: s.error }));
}

/** True when the active kitchen is shared on the server (sync runs only then). */
export function isActiveKitchenShared(): boolean {
  hydrateKitchens();
  const id = getActiveKitchen()?.id;
  return !!id && kitchensStore.getSnapshot().kitchens.some((k) => k.id === id);
}

/** GET /api/kitchens → refreshes the cache. Signed out → empty. */
export async function refreshKitchens(): Promise<SharedKitchenView[]> {
  hydrateKitchens();
  if (!(await isSignedIn())) return save([]);
  kitchensStore.setState((s) => ({ ...s, loading: true, error: null }));
  try {
    const { kitchens } = await apiFetch<{ kitchens: SharedKitchenView[] }>('/api/kitchens');
    syncJoinCode(kitchens);
    return save(kitchens);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return save([]);
    kitchensStore.setState((s) => ({ ...s, loading: false, error: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}

/** Keeps the local kitchen's join code in line with the server (owner only). */
function syncJoinCode(kitchens: readonly SharedKitchenView[]): void {
  for (const k of kitchens) {
    const local = getKitchen(k.id);
    if (local && k.inviteCode && local.joinCode !== k.inviteCode) patchKitchen(k.id, { joinCode: k.inviteCode });
  }
}

export type MemberProfile = { displayName?: string; initials?: string };

/**
 * POST /api/kitchens `{ id, name, tz, unit, openingHours, displayName?, initials? }`: shares the active
 * local kitchen (same id, so rows already on the phone keep their kitchenId) and returns it with the
 * invite code for staff. One owned kitchen per account: a repeat returns the existing one (200).
 * Sharing starts syncing (see sync-client).
 */
export async function createSharedKitchen(profile: MemberProfile = {}): Promise<SharedKitchenView> {
  const local = getActiveKitchen();
  if (!local) throw new Error('No kitchen to share');
  const body = { id: local.id, name: local.name, tz: local.tz, unit: local.unit, openingHours: local.openingHours, ...profile };
  const { kitchen } = await apiFetch<{ kitchen: SharedKitchenView }>('/api/kitchens', { method: 'POST', body });
  if (kitchen.id !== local.id) {
    // The account already owns another shared kitchen: work in that one (its rows arrive by sync).
    setAppValue('soloKitchenId', local.id);
    setActiveKitchen(kitchen.id);
  } else if (kitchen.inviteCode) {
    patchKitchen(local.id, { joinCode: kitchen.inviteCode });
  }
  resetSyncCursors(kitchen.id);
  await refreshKitchens().catch(() => undefined);
  refreshActive();
  return kitchen;
}

/**
 * POST /api/kitchens/join with a code. Switches this device to the joined kitchen (its checkpoints
 * and readings arrive with the next sync) as staff. Errors: 404 `kitchen_not_found`, 409 `own_kitchen`
 * / `kitchen_full`.
 */
export async function joinKitchen(code: string, profile: MemberProfile = {}): Promise<SharedKitchenView> {
  const { kitchen } = await apiFetch<{ kitchen: SharedKitchenView }>('/api/kitchens/join', {
    method: 'POST',
    body: { code: code.trim().toUpperCase(), ...profile },
  });
  setAppValue('soloKitchenId', getActiveKitchen()?.id ?? null);
  resetSyncCursors(kitchen.id);
  setActiveKitchen(kitchen.id);
  await refreshKitchens().catch(() => undefined);
  refreshActive();
  return kitchen;
}

/** GET /api/kitchens/:id/today: counts, latest reading per checkpoint (with initials) and open cooling items. */
export async function getKitchenToday(kitchenId: string, opts: { date?: string; tz?: string } = {}): Promise<KitchenTodayView> {
  const tz = opts.tz ?? getKitchen(kitchenId)?.tz ?? deviceTimeZone();
  return apiFetch<KitchenTodayView>(`/api/kitchens/${encodeURIComponent(kitchenId)}/today`, {
    query: { tz, date: opts.date ?? todayKey(tz) },
  });
}

/** Owner removes a staff member, or staff leave (`userId` = their own id). */
export async function removeKitchenMember(kitchenId: string, userId: string): Promise<void> {
  await apiFetch(`/api/kitchens/${encodeURIComponent(kitchenId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  await refreshKitchens().catch(() => undefined);
}

/**
 * Staff leave `kitchenId`: the device goes back to its own kitchen (created if needed). The left
 * kitchen's rows stay on the phone, inactive. An owner stops sharing with `stopSharingKitchen`.
 */
export async function leaveKitchen(kitchenId: string, myUserId: string): Promise<void> {
  await removeKitchenMember(kitchenId, myUserId);
  if (getActiveKitchen()?.id === kitchenId) switchToSoloKitchen(kitchenId);
  resetSyncCursors(kitchenId);
  refreshActive();
}

/**
 * Owner stops sharing: the server deletes the kitchen, memberships and every synced row; the kitchen
 * stays on this phone as a solo kitchen.
 */
export async function stopSharingKitchen(kitchenId: string): Promise<void> {
  await apiFetch(`/api/kitchens/${encodeURIComponent(kitchenId)}`, { method: 'DELETE' });
  if (getKitchen(kitchenId)) patchKitchen(kitchenId, { joinCode: null, ownerUserId: null });
  resetSyncCursors(kitchenId);
  await refreshKitchens().catch(() => undefined);
}

function switchToSoloKitchen(leftId: string): void {
  const soloId = getAppValue<string | null>('soloKitchenId', null);
  const solo = soloId && soloId !== leftId ? getKitchen(soloId) : null;
  const fallback = solo && !solo.deletedAt ? solo : listKitchens().find((k) => k.id !== leftId);
  if (fallback) setActiveKitchen(fallback.id);
  else createKitchen();
}

/** Forget cached kitchens (sign-out). A joined kitchen stays active locally until the user switches. */
export function clearKitchens(): void {
  save([]);
}
