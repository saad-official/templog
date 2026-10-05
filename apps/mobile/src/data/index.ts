// Public surface of the data layer. Screens import intents and reads from '@/data' and reactive reads
// from '@/hooks/use-*'; they never import expo-sqlite, drizzle or the native libraries.
// Domain types and pure rules (limits, cooling, schedule, compliance, report, units, tokens) come
// straight from '@templog/shared'.
export * from './actions';
export { afterSignIn, deleteAccountEverywhere, signInAndSync, signOutAndForget, signUpAndSync } from './account';
export { ApiError } from './api';
export { API_URL, authClient, deleteAccount, isSignedIn, signIn, signOut, signUp, type AuthSession } from './auth-client';
export { checksBetween, checksForDays, DEFAULT_EXPANSION_DAYS, getCheckSnoozes, isOpenAt, upcomingChecks, type Check } from './checks';
export { getCheckpoint, listCheckpoints, type CheckpointInput, type CheckpointPatch } from './checkpoints-repo';
export { ACTIVE_COOLING_STATUSES, getCoolingItem, listActiveCoolingItems, listCoolingItemsBetween } from './cooling-repo';
export { registerPushDevice, unregisterPushDevice, type DeviceRegistration } from './devices';
export { ensureChecksExpanded } from './expand';
export { buildAllDataExport, fullHistoryRange, type AllDataExport } from './export-all';
// Privacy-page promises reachable from Settings: export, delete all local data, delete the account.
export { exportAll } from '@/native/exports';
export { ensureKitchen, getActiveKitchen, getKitchen, listKitchens, type KitchenPatch } from './kitchen-repo';
export * from './kitchens-client';
export { DEFAULT_OPENING_HOURS } from './mappers';
export { ensureDatabaseReady, useDatabaseMigrations, type DatabaseReadyState } from './migrate';
export { getReading, listReadingsBetween, recentReadings } from './readings-repo';
export { seedDemoData } from './seed';
export { getSettings } from './settings-repo';
export { createStore, onTablesChanged, useStore, type Store, type TableName } from './store';
export { pullSince, pushDirty, scheduleSync, syncNow, syncStatus, type SyncStatus } from './sync-client';
export { getDeviceId, getSyncState, resetSyncCursors, type SyncedTable, type SyncState } from './sync-state-repo';
export {
  BOARD_TICK_MS,
  COOLING_TICK_MS,
  dayBounds,
  deviceTimeZone,
  formatClock,
  lastDays,
  nowIso,
  rangeBounds,
  todayKey,
  useClockTick,
  useToday,
  type DayRange,
} from './time';
export * from './views';
