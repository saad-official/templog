// Shared-kitchen sync: pushes rows of the active kitchen dirtied since the last push and pulls rows
// changed on the server, using shared `diffDirty` / `planRemoteApply` (last write wins) against
// `/api/sync/push|pull` (wire contract: shared `SyncPushRequestSchema` / `SyncPullResponseSchema`,
// rows in the shared domain shapes). Per-(kitchen, table) cursors live in `sync_state`. Only a
// kitchen shared on the server syncs; solo kitchens never leave the phone.
import {
  CheckpointSchema,
  CoolingItemSchema,
  KitchenSchema,
  ReadingSchema,
  type SyncTables,
} from '@templog/shared/schemas';
import { diffDirty, planRemoteApply, rowVersion, type SyncRow } from '@templog/shared/sync';

import { refreshSurfaces } from '@/native/surfaces';

import { ApiError, apiFetch } from './api';
import { isSignedIn } from './auth-client';
import { allCheckpointRows, putCheckpoints } from './checkpoints-repo';
import { allCoolingItemRows, getCoolingItems, putCoolingItems } from './cooling-repo';
import { allKitchenRows, getActiveKitchen, putKitchens } from './kitchen-repo';
import { isActiveKitchenShared } from './kitchens-client';
import { allReadingRows, getReadings, putReadings } from './readings-repo';
import { getAppValue, setAppValue } from './settings-repo';
import { createStore } from './store';
import { getDeviceId, getSyncState, pullCursor, setPulledAt, setPushedUpTo, SYNCED_TABLES, type SyncedTable } from './sync-state-repo';

const MAX_PUSH_ROWS = 1000;

// ---------------------------------------------------------------------------
// Status store (for UI)

export type SyncStatus = { running: boolean; lastSyncAt: string | null; error: string | null };
export const syncStatus = createStore<SyncStatus>({ running: false, lastSyncAt: null, error: null });
let statusHydrated = false;

/** Loads the last sync time / error persisted in settings (after migrations). */
export function hydrateSyncStatus(): void {
  if (statusHydrated) return;
  statusHydrated = true;
  syncStatus.setState({
    running: false,
    lastSyncAt: getAppValue<string | null>('lastSyncAt', null),
    error: getAppValue<string | null>('lastSyncError', null),
  });
}

// ---------------------------------------------------------------------------
// Push / pull

const maxVersion = (rows: readonly SyncRow[]) => rows.reduce((max, r) => Math.max(max, rowVersion(r)), 0);

function dirtyTables(kitchenId: string): SyncTables {
  const dirty = <T extends SyncRow>(table: SyncedTable, rows: T[]) => diffDirty(rows, getSyncState(kitchenId, table).pushedUpTo);
  return {
    kitchens: dirty('kitchens', allKitchenRows().filter((k) => k.id === kitchenId)),
    checkpoints: dirty('checkpoints', allCheckpointRows(kitchenId)),
    readings: dirty('readings', allReadingRows(kitchenId)),
    coolingItems: dirty('coolingItems', allCoolingItemRows(kitchenId)),
  };
}

/**
 * POST /api/sync/push `{ deviceId, kitchenId, tables }` with every row of the active kitchen changed
 * since that table's last accepted push. Returns how many rows were sent and accepted. 403
 * `not_member` / `not_shared` means the kitchen is not shared (nothing is marked pushed).
 */
export async function pushDirty(kitchenId: string): Promise<{ pushed: number; accepted: number }> {
  const all = dirtyTables(kitchenId);
  const total = SYNCED_TABLES.reduce((n, t) => n + all[t].length, 0);
  if (!total) return { pushed: 0, accepted: 0 };
  const deviceId = getDeviceId();
  const pages = Math.max(1, Math.ceil(Math.max(...SYNCED_TABLES.map((t) => all[t].length)) / MAX_PUSH_ROWS));
  let accepted = 0;
  for (let i = 0; i < pages; i++) {
    const slice = <T>(xs: T[]) => xs.slice(i * MAX_PUSH_ROWS, (i + 1) * MAX_PUSH_ROWS);
    const tables: SyncTables = {
      kitchens: slice(all.kitchens),
      checkpoints: slice(all.checkpoints),
      readings: slice(all.readings),
      coolingItems: slice(all.coolingItems),
    };
    try {
      const res = await apiFetch<{ serverTime: string; accepted: number }>('/api/sync/push', {
        method: 'POST',
        body: { deviceId, kitchenId, tables },
      });
      accepted += res.accepted;
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) return { pushed: 0, accepted: 0 };
      throw error;
    }
  }
  // Only after every page succeeded: a failed push is simply re-sent next time (the server is idempotent).
  for (const t of SYNCED_TABLES) {
    if (all[t].length) setPushedUpTo(kitchenId, t, new Date(maxVersion(all[t])).toISOString());
  }
  return { pushed: total, accepted };
}

/** Rows that fail validation are skipped (logged), never allowed to break the whole pull. */
type RowSchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

function validRows<T>(schema: RowSchema<T>, rows: unknown, table: string): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else console.warn(`[sync] skipped an invalid ${table} row`);
  }
  return out;
}

/**
 * GET /api/sync/pull?kitchenId=&since=<cursor>, merged last-write-wins (shared `planRemoteApply`)
 * into local tables. Rows of other kitchens are refused.
 */
export async function pullSince(kitchenId: string): Promise<{ applied: number }> {
  const since = pullCursor(kitchenId);
  const res = await apiFetch<{ serverTime: string; tables?: Record<string, unknown> }>('/api/sync/pull', {
    query: { kitchenId, since },
  });
  const tables = res.tables ?? {};
  const mine = (r: { kitchenId: string }) => r.kitchenId === kitchenId;

  const kitchens = validRows(KitchenSchema, tables.kitchens, 'kitchens').filter((k) => k.id === kitchenId);
  const k = planRemoteApply(allKitchenRows().filter((x) => x.id === kitchenId), kitchens);
  putKitchens(k.upserts);

  const checkpoints = validRows(CheckpointSchema, tables.checkpoints, 'checkpoints').filter(mine);
  const c = planRemoteApply(allCheckpointRows(kitchenId), checkpoints);
  putCheckpoints(c.upserts);

  const readings = validRows(ReadingSchema, tables.readings, 'readings').filter(mine);
  const r = planRemoteApply(getReadings(readings.map((x) => x.id)), readings);
  putReadings(r.upserts);

  const items = validRows(CoolingItemSchema, tables.coolingItems, 'coolingItems').filter(mine);
  const i = planRemoteApply(getCoolingItems(items.map((x) => x.id)), items);
  putCoolingItems(i.upserts);

  setPulledAt(kitchenId, SYNCED_TABLES, res.serverTime);
  return { applied: k.upserts.length + c.upserts.length + r.upserts.length + i.upserts.length };
}

let running: Promise<void> | null = null;

/** Push then pull the active kitchen, when signed in and the kitchen is shared. Single-flight; never throws. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const kitchenId = getActiveKitchen()?.id;
      if (!kitchenId || !(await isSignedIn()) || !isActiveKitchenShared()) return;
      syncStatus.setState((s) => ({ ...s, running: true, error: null }));
      await pushDirty(kitchenId);
      const { applied } = await pullSince(kitchenId);
      const at = new Date().toISOString();
      setAppValue('lastSyncAt', at);
      setAppValue('lastSyncError', undefined);
      syncStatus.setState({ running: false, lastSyncAt: at, error: null });
      // Pulled readings, checkpoints or cooling timers: bring reminders, timers and widgets in line.
      if (applied) await refreshSurfaces();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAppValue('lastSyncError', message);
      syncStatus.setState((s) => ({ ...s, running: false, error: message }));
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced `syncNow` after local writes (actions call this). */
export function scheduleSync(delayMs = 4000): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}
