# Mobile data layer and native adapters: API for screens

Everything a screen needs from storage, the account API or the OS. Screens and components import
only from `@/data`, `@/hooks/use-*` and `@/native/*`; never from `expo-sqlite`, `drizzle-orm`,
`expo-notifications`, `expo-widgets`, `expo-live-updates`, `react-native-android-widget`,
`expo-print`, `expo-sharing`, etc.

Domain types (`Kitchen`, `Checkpoint`, `Reading`, `CoolingItem`, `CorrectiveAction`, `Settings`,
`Cadence`, `OpeningHours`, `Check`, `CheckState`, …) and pure rules come straight from
`@templog/shared` (or a subpath such as `@templog/shared/limits`): `evaluateReading`,
`limitsLabel`, `kindLabel`, `checkpointTone`, `defaultLimitsFor`, `FOOD_CODE_DEFAULTS`,
`COOLING_LIMITS`, `coolingLabel`, `formatMinutes`, `formatTemp`, `displayTemp`, `toStoredF`,
`correctiveActionLabel`, `dailyReportModel` / `rangeReportModel`, design `tokens`. The UI never
hardcodes a temperature: use the shared constants and labels.

**Hooks vs plain functions.** Everything named `use*` is a React hook (`@/hooks/use-*`;
`useDatabaseMigrations`, `useToday`, `useClockTick`, `useStore` come from `@/data`). Everything
else exported from `@/data` and `@/native/*` is a plain function (sync reads or `async` actions),
safe in event handlers, background tasks and headless code.

Conventions: ids are UUIDv7 strings; check ids are deterministic (`checkIdFor(checkpointId,
scheduledFor)`); timestamps are ISO-8601 UTC strings; local days are `YYYY-MM-DD` `DayKey`s in the
**kitchen** zone (`kitchen.tz`); temperatures are stored in **°F** (`valueF`, `limits.min/max`) and
typed / shown in the display unit (`useSettings().unit`); deletes are soft (`deletedAt`). Checks are
**not stored**: they are derived from checkpoints + opening hours with shared `expandChecks`, so a
cadence edit never rewrites history and every phone of a shared kitchen derives the same checks.

## 1. Root layout wiring (once)

```tsx
// src/app/_layout.tsx
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useDatabaseMigrations } from '@/data';
import { startNativeServices } from '@/native/surface-sync';

export default function RootLayout() {
  const db = useDatabaseMigrations();                    // { success, error? }
  useEffect(
    () => (db.success ? startNativeServices({ onOpenUrl: (url) => router.push(url) }) : undefined),
    [db.success],
  );
  if (db.error) return <DatabaseErrorScreen error={db.error} />;
  if (!db.success) return null;                          // keep the splash screen up
  return <Tabs />;
}
```

- `apps/mobile/index.ts` is the JS entry (`package.json` `main`). It imports `src/native/entry.ts`
  before `expo-router/entry`: background task definitions (`TEMPLOG_DAILY`, Android notification
  actions), the Android widget task handler and the notification / Live Activity action listener
  live at module scope so headless launches work without rendering the layout. Do not move them.
- `startNativeServices({ onOpenUrl? })`: migrate → create the local kitchen on first launch →
  notification channels + categories → register background tasks → auto-fail overdue cooling
  stages, reschedule reminders, sync cooling Live Activities / Live Updates, widgets and badge →
  (signed in) refresh shared kitchens, register the push token, sync. While mounted it auto-fails
  cooling stages every 15 s in the foreground, re-runs maintenance on every foreground and at local
  midnight, and forwards notification responses to `onOpenUrl` (incl. the one that cold-launched
  the app). Returns a cleanup function.
- Data hooks return empty fallbacks (`[]`, `null`, `DEFAULT_SETTINGS`) until migrations finish.

### Deep links the app must route (Expo Router)

| URL | From | Route |
|---|---|---|
| `templog://log/<checkpointId>` (optional `?scheduledFor=<ISO>`) | check reminder tap and **Log now**, widgets (next check) | `src/app/log/[checkpointId].tsx`; pass `scheduledFor` to `logReading` when present |
| `templog://cooling/<itemId>` | cooling prompt tap and **Log reading**, Live Activity "Log reading" link, Android Live Update tap | `src/app/cooling/[itemId].tsx` |
| `templog://today` | grouped reminders, widget with nothing due | `src/app/(tabs)/index.tsx` (or redirect in `+native-intent.tsx`) |
| `templog://history` | Monday weekly summary push (`data: { type: 'weekly-summary', kitchenId, weekStart, url }`, Android channel `general`) | the History tab |

Build them with `deepLinks.log(id, scheduledFor?)`, `deepLinks.cooling(id)`, `deepLinks.today()`, `deepLinks.history()`
from `@/native/notifications`.

## 2. Hooks (reactive reads)

`useSyncExternalStore`-based: re-render only when a table they read is written (or the 30 s / 15 s
clock / local day changes for time-dependent ones). Results are referentially stable between changes.

| Hook | Returns | Example |
|---|---|---|
| `useKitchen()` (`@/hooks/use-kitchen`) | active `Kitchen \| null` (`name, tz, unit, openingHours, joinCode`) | `const kitchen = useKitchen();` |
| `useCheckpoints({ includeArchived? })` (`@/hooks/use-checkpoints`) | `Checkpoint[]` by `sortOrder` | `const cps = useCheckpoints();` |
| `useCheckpoint(id)` | `Checkpoint \| null` (archived / deleted included) | `const cp = useCheckpoint(params.checkpointId);` |
| `useCheckpointHistory(id, days = 7)` | `{ checkpoint, stats: { count, min, max, avg, fails, points }, recent: Reading[], limitsLabel } \| null` (shared `checkpointStats`) | `<Sparkline points={h?.stats.points ?? []} />` |
| `useTodayBoard()` (`@/hooks/use-today-board`) | `TodayBoard \| null`: `items: CheckpointBoardItem[]` (each `{ checkpoint, kindLabel, tone: 'cold'\|'hot', limitsLabel, latestReading, checks: CheckView[], current, status: 'overdue'\|'due'\|'missed'\|'upcoming'\|'done'\|'none', missedToday, loggedToday, scheduledToday }`, sorted by urgency), `next` (shared `NextCheck` + `checkpoint`), `compliance` (shared `DailyCompliance`, today so far), `counts { due, overdue, missed, logged, upcoming }`, `streak`; every 30 s | `const board = useTodayBoard(); board?.next?.minutesUntil` |
| `useDueChecks()` (`@/hooks/use-due-checks`) | `DueCheck[]` = `CheckView & { checkpoint, state: 'due'\|'overdue' }`, oldest first; every 30 s | glass "due now" card: `const [first] = useDueChecks();` |
| `useCoolingItems()` (`@/hooks/use-cooling-items`) | running timers `CoolingView[]` = `CoolingItem & { deadlines { stage1DueAt, stage2DueAt }, prompt { kind, dueAt, minutesLeft } \| null, progress (0…1), label, readings }`; every 15 s; overdue stages auto-fail | `items.map((i) => <CoolingCard key={i.id} item={i} />)` |
| `useCoolingItem(id)` | `CoolingView \| null` (any status) | `const item = useCoolingItem(params.itemId);` |
| `useCoolingHistory(range)` | `CoolingView[]` started in the range, newest first | `useCoolingHistory(lastDays(7))` |
| `useReadings(range, checkpointId?)` (`@/hooks/use-readings`) | `ReadingView[]` = `Reading & { checkpoint, coolingItem, unit }`, oldest first | `formatTemp(displayTemp(r.valueF, r.unit), r.unit)` |
| `useDayChecks(dayKey)` | every check of a day with `state` (`logged \| missed \| overdue \| due \| upcoming`), `readings`, `onTime`, `checkpoint` (History timeline; missed shown explicitly) | `useDayChecks('2026-10-05')` |
| `useCompliance(range)` (`@/hooks/use-compliance`) | `ComplianceReport \| null`: `days[]` (shared `dailyCompliance` + `dayKey`), `scheduled, logged, onTime, failed, missed, rate, streak` | `const week = useCompliance(lastDays(7));` |
| `useSettings()` (`@/hooks/use-settings`) | `Settings` (`onboarded, unit, initialsDefault?, reminderLeadMinutes, quietOutsideHours, graceMinutes`) | `const { unit, initialsDefault } = useSettings();` |
| `useSession()` (`@/hooks/use-session`) | Better Auth `{ data, isPending, error, refetch }` | `const { data: session } = useSession();` |
| `useKitchenMembers({ refreshOnMount? })` (`@/hooks/use-kitchen-members`) | `KitchenMemberView[]` (`userId, displayName, initials, role: 'owner' | 'staff', joinedAt`) of the active shared kitchen; `[]` solo | `const members = useKitchenMembers();` |
| `useSharedKitchens()` | `{ kitchens, active, loading, error, updatedAt, refresh() }`; `SharedKitchenView` = `{ id, name, tz, unit, openingHours, ownerName, isOwner, role, inviteCode (owner only), createdAt, members }` | `const { active } = useSharedKitchens();` |
| `useSyncStatus()` (`@/hooks/use-sync-status`) | `{ running, lastSyncAt, error }` | `const sync = useSyncStatus();` |
| `useNotificationPermission()` (`@/hooks/use-notification-permission`) | `{ status, canAskAgain } \| null`, re-read on foreground | `const perm = useNotificationPermission();` |
| `useDatabaseMigrations()` / `useToday()` / `useClockTick(ms?)` (`@/data`) | `{ success, error? }` / device `DayKey` / epoch ms floored to 30 s (or `ms`) | section 1 |

Ranges are inclusive `{ from, to }` day keys: `lastDays(n)` (from `@/data` or `@/hooks/use-compliance`)
builds the last `n` days ending today.

## 3. Actions (`@/data`, from `src/data/actions.ts`)

Each applies the shared rules, persists synchronously (hooks update at once), then refreshes
reminders, badge, cooling Live Activities / Live Updates and widgets, and schedules a sync. Await
them in headless code; in UI you can fire and forget.

| Action | Notes / example |
|---|---|
| `previewReading(checkpointId, valueInUnit, unit?)` | shared `evaluateReading` without saving → `{ result, failReason }` (keypad colour, ask for a corrective action). |
| `logReading(checkpointId, valueInUnit, { initials, scheduledFor?, correctiveAction?, source, unit?, takenAt? })` | converts to °F, evaluates, attaches to the check it answers (`scheduledFor` omitted → shared `checkForReading`; `null` → ad hoc), saves, clears that check's snooze, remembers initials. Returns `{ ok: true, reading, evaluation }` or `{ ok: false, reason: 'not-found' \| 'corrective-action-required', evaluation }` (a fail is never saved without an action). `await logReading(cp.id, 38.5, { initials: 'SK', source: 'manual' })` |
| `suggestedCheckFor(checkpointId, takenAt?)` | the `scheduledFor` a reading now would answer (or null). |
| `deleteReading(reading)` | soft delete (the check is open / missed again). |
| `snoozeChecks(checkIds, minutes = 15)` | the reminder re-fires in 15 min (the check keeps its time). |
| `startCooling(name, { initials?, startValue?, unit?, startedAt? })` | starts a two-stage timer; schedules prompts and starts the Live Activity / Live Update. |
| `previewCoolingReading(itemId, valueInUnit, unit?)` | shared `evaluateCooling` without saving → `{ stage, outcome: 'pass'\|'pending'\|'fail', readingResult, failReason }`. |
| `logCoolingReading(itemId, valueInUnit, initials, { correctiveAction?, unit?, source?, takenAt? })` | writes the stage reading and the item patch (stage 1 pass → stage 2, done, or failed). `{ ok: false, reason: 'corrective-action-required' }` for a late / warm-at-deadline reading without an action. |
| `discardCooling(itemId, note?)` | closes the timer with `{ kind: 'discard' }`. |
| `setCoolingCorrectiveAction(itemId, action)` | records the action for an item that auto-failed. |
| `expireOverdueCooling(now?)` | shared `expireCooling` for every running item (done for you every 15 s and in the background task). |
| `addCheckpoint({ name, kind, limits?, cadence?, sortOrder? })` | limits default to shared `defaultLimitsFor(kind)`, cadence to every 4 h. `await addCheckpoint({ name: 'Walk-in', kind: 'cold-holding' })` |
| `updateCheckpoint(id, patch)` / `archiveCheckpoint(id, archived = true)` / `deleteCheckpoint(id)` | reminders follow; readings stay in history. |
| `updateKitchen({ name?, tz?, unit?, openingHours? })` | opening hours are 7 entries, Sunday first, `null` = closed; a unit change also sets this device's display unit. |
| `updateSettings(patch)` | validated; lead / quiet hours / grace changes reschedule reminders. |
| `deleteAllLocalData()` | cancels reminders, wipes every table, clears surfaces, starts over with a fresh default kitchen. |
| `exportAll(format = 'csv')` | Settings → Export: `csv` = every reading / cooling item of the active kitchen as the inspector CSV (first day → today), `json` = everything on the phone (`buildAllDataExport()`). Opens the share sheet → `{ ok, uri } | { ok: false, reason }`. |
| `seedDemoData()` | **dev only** (throws outside `__DEV__`): "Corner Café", 5 checkpoints, 6 days of readings (some fails with actions, some missed), 2 running cooling timers. |

Reads without hooks (headless or one-off): `getActiveKitchen`, `listCheckpoints`, `getCheckpoint`,
`getReading`, `listReadingsBetween`, `recentReadings`, `getCoolingItem`, `listActiveCoolingItems`,
`getSettings`, `todayBoard`, `dueCheckViews`, `dayCheckViews`, `readingViews`, `complianceFor`,
`checkpointHistory`, `activeCoolingViews`, `coolingView`, `checksBetween`, `checksForDays`,
`isOpenAt(kitchen, at)`, `reportModel(range)` (shared `rangeReportModel` for the PDF),
`ensureChecksExpanded(days = 3)` (maintenance: ensures the kitchen, prunes snoozes, returns the next
3 days of checks).

## 4. Account, shared kitchen and sync (`@/data`)

Accounts are optional; only a shared kitchen needs one. Solo kitchens never leave the phone.

Privacy-page promises, all reachable from Settings: `exportAll()` (section 3), `deleteAllLocalData()`,
`deleteAccountEverywhere(password)`. No analytics SDKs are installed.

| Function | Notes |
|---|---|
| `signInAndSync({ email, password })` / `signUpAndSync({ name, email, password })` | Better Auth (`expoClient`, scheme `templog`, cookie prefix `templog`, cookie in SecureStore), then refresh kitchens + register push token + sync. Returns an error message or `null`. |
| `signOutAndForget()` / `deleteAccountEverywhere(password)` | drop push token, cached kitchens and sync cursors; local records stay. |
| `createSharedKitchen({ displayName?, initials? })` | `POST /api/kitchens { id, name, tz, unit, openingHours, displayName?, initials? }` with the active local kitchen (same id) → `SharedKitchenView` with `inviteCode` (also stored as the local `joinCode`). One owned kitchen per account: a repeat returns the existing one (the device switches to it if the id differs). Sync starts. |
| `joinKitchen(code, { displayName?, initials? })` | `POST /api/kitchens/join` as staff; switches the device to that kitchen (its data arrives with the next sync). `ApiError` codes `kitchen_not_found` (404), `own_kitchen` / `kitchen_full` (409). |
| `refreshKitchens()` / `getKitchenToday(kitchenId, { date?, tz? })` | list (cached) / server today view (`counts`, latest reading per checkpoint with initials, `openCooling`). |
| `leaveKitchen(kitchenId, myUserId)` / `removeKitchenMember(kitchenId, userId)` / `stopSharingKitchen(kitchenId)` | staff leave (back to the solo kitchen) / owner removes staff / owner deletes the server copy (403 for staff). |
| `syncNow()` / `scheduleSync()` | push dirty rows then pull, only when signed in **and** the active kitchen is shared. Never throws; see `useSyncStatus()`. |
| `pushDirty(kitchenId)` / `pullSince(kitchenId)` | low level: `POST /api/sync/push { deviceId, tables }` (403 `not_a_member` is treated as not shared; kitchen rows are applied only from the owner), `GET /api/sync/pull?kitchenId=&since=`; rows in the shared schema shapes, shared `diffDirty` / `planRemoteApply` with per-(kitchen, table) cursors in `sync_state`. |
| `registerPushDevice({ prompt? })` | `POST /api/devices { token, platform }` (needs `extra.eas.projectId`). |

API base URL: `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.1.20:3800` for a LAN dev server), default
`https://gettemplog.vercel.app`. Errors are `ApiError { status, message, code? }` (status 0 = network).

## 5. Native adapters (`@/native/*`)

| Module | API | Example |
|---|---|---|
| `notifications` | `requestNotificationPermission()` (after a priming screen), `getNotificationPermission()`, `openNotificationSettings()`, `rescheduleAll()`, `cancelAllTemplogNotifications()`, `addNotificationOpenListener(url => …)`, `getPushRegistration()`, `deepLinks`. Channels **`checks`** (high), **`cooling`** (high), `cooling-live` (silent ongoing timers), **`general`** (default channel for server pushes such as the weekly summary). iOS category **`check`** with actions **`log-now`** (opens the app) / **`snooze-15`**; category **`cooling`** with **`log-reading`** (opens the app) / **`discarded`**. Reminders: rolling 3 days, `reminderLeadMinutes` before each check, only inside opening hours when `quietOutsideHours`, grouped per instant, an **overdue** alert at `scheduledFor + graceMinutes` with the badge count; cooling prompts at each stage deadline minus the lead (5–30 min) plus a "stage missed" alert at the deadline. | `const p = await requestNotificationPermission(); if (p.status !== 'granted' && !p.canAskAgain) openNotificationSettings();` |
| `live-status` (`.ios` / `.android` / default) | `syncCoolingStatus(items)`, `addStatusActionListener(e => …)`, `e = { action: 'log-now' \| 'snooze-15' \| 'log-reading' \| 'discarded', checkIds?, checkpointId?, itemId?, url?, source }`. iOS Live Activity **`Cooling`** per running item (name, stage + limit, native countdown and progress bar, **Log reading** link → `templog://cooling/<id>`, **Discarded** button target `discarded:<id>`); Android 16 Live Update per item (two-segment progress: 2 h + 4 h, status-bar chip with minutes left, tap → `templog://cooling/<id>`); ongoing `cooling-live` notification with the `cooling` actions below Android 16. Actions are already applied by `native/entry.ts`; listen only for UI feedback. | `useEffect(() => addStatusActionListener((e) => e.action === 'discarded' && haptics.acknowledged()), []);` |
| `widgets` | `refreshWidgetsFromDatabase()`, `refreshWidgets(snapshot)`; iOS **`NextCheck`** (systemSmall / systemMedium: next check name, time, "in 25 min" / overdue, today's compliance % ring; accessoryCircular: minutes to next check; accessoryInline), timeline entries every 5 min for 2 h and at each check / grace boundary; Android `NextCheck` 2×2 (task handler registered at entry). | called by actions; manual: `await refreshWidgetsFromDatabase();` |
| `haptics` | `haptics.pass() / fail() / acknowledged() / selection() / key() / warning()` | `evaluation.result === 'pass' ? haptics.pass() : haptics.fail();` |
| `exports` | `sharePdf(html, filename?)` (expo-print → share sheet), `printHtml(html)`, `shareCsv(csv, filename?)`, `buildReportCsv(range)` / `shareReportCsv(range)` (shared `toCsvRows` + `toCsv`) → `{ ok: true, uri } \| { ok: false, reason }` | `const model = reportModel(lastDays(7)); await sharePdf(renderReportHtml(model), 'templog-week.pdf');` |
| `background` | `DAILY_TASK = 'TEMPLOG_DAILY'` (expire cooling + plan checks + reschedule + surfaces + sync), `triggerDailyTaskForTesting()` (debug builds) | `await triggerDailyTaskForTesting();` |
| `surface-sync` | `startNativeServices(opts)`, `initializeNativeServices()`, `syncNativeSurfaces()`, `runMaintenance()` | section 1 |
