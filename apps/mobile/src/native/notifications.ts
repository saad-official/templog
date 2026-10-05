// Local reminders (expo-notifications): permission flow, Android channels, iOS categories
// (`check`: Log now / Snooze 15; `cooling`: Log reading / Discarded), a rolling 3-day set of check
// reminders (lead minutes before each check, inside opening hours) with an overdue escalation and
// badge, cooling prompts at each stage deadline minus the lead, response decoding into actions and
// deep links, and Expo push token registration.
import { COOLING_LIMITS, coolingDeadlines } from '@templog/shared/cooling';
import { COOKING_MINIMUMS_F } from '@templog/shared/limits';
import { classifyChecks, DEFAULT_MISSED_AFTER_MINUTES } from '@templog/shared/schedule';
import type { Checkpoint, CoolingItem, Kitchen, Settings } from '@templog/shared/schemas';
import { displayTemp, formatTemp, type Unit } from '@templog/shared/units';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { Linking, Platform } from 'react-native';

import { listCheckpoints } from '@/data/checkpoints-repo';
import { type Check, getCheckSnoozes, isOpenAt, upcomingChecks } from '@/data/checks';
import { listActiveCoolingItems } from '@/data/cooling-repo';
import { getActiveKitchen } from '@/data/kitchen-repo';
import { listReadingsForChecksBetween } from '@/data/readings-repo';
import { getSettings } from '@/data/settings-repo';
import { formatClock } from '@/data/time';

// ---------------------------------------------------------------------------
// Identifiers

export const CATEGORY_CHECK = 'check';
export const CATEGORY_COOLING = 'cooling';
export const CHANNEL_CHECKS = 'checks';
export const CHANNEL_COOLING = 'cooling';
/** Shared with expo-live-updates (`channelId` in app.json): ongoing cooling timers. */
export const CHANNEL_COOLING_LIVE = 'cooling-live';
/**
 * Default channel (app.json `defaultChannel`): server pushes without a channel id land here, e.g.
 * the Monday weekly summary `{ type: 'weekly-summary', kitchenId, weekStart, url: 'templog://history' }`.
 */
export const CHANNEL_GENERAL = 'general';

export const ACTION_LOG_NOW = 'log-now';
export const ACTION_SNOOZE = 'snooze-15';
export const ACTION_LOG_READING = 'log-reading';
export const ACTION_DISCARDED = 'discarded';
export const SNOOZE_MINUTES = 15;

export const ROLLING_DAYS = 3;
const CHECK_PREFIX = 'check:';
const OVERDUE_PREFIX = 'overdue:';
const COOLING_PREFIX = 'cooling:';
const COOLING_STATUS_PREFIX = 'cooling-status:';
const MANAGED_PREFIXES = [CHECK_PREFIX, OVERDUE_PREFIX, COOLING_PREFIX];
/** iOS keeps at most 64 pending local notifications per app; leave room for the status ones. */
const MAX_SCHEDULED = Platform.OS === 'ios' ? 60 : 150;
const MINUTE = 60_000;

/** Deep links the app routes (Expo Router): `templog://log/<checkpointId>`, `templog://cooling/<itemId>`. */
export const deepLinks = {
  today: () => 'templog://today',
  log: (checkpointId: string, scheduledFor?: string | null) =>
    `templog://log/${encodeURIComponent(checkpointId)}${scheduledFor ? `?scheduledFor=${encodeURIComponent(scheduledFor)}` : ''}`,
  cooling: (itemId: string) => `templog://cooling/${encodeURIComponent(itemId)}`,
  history: () => 'templog://history',
};

/** `content.data` of every notification Templog posts or receives. */
export type TemplogNotificationData =
  | { kind: 'check'; checkIds: string[]; checkpointIds: string[]; scheduledFor: string; sig: string }
  | { kind: 'overdue'; checkIds: string[]; checkpointIds: string[]; scheduledFor: string; sig: string }
  | { kind: 'cooling'; itemId: string; stage: 'stage1' | 'stage2'; late: boolean; sig: string }
  | { kind: 'cooling-status'; itemId: string }
  /** Server push (weekly owner summary); `url` is opened on tap (`templog://history`). */
  | { kind?: never; type: 'weekly-summary'; kitchenId: string; weekStart: string; url?: string };

export type NotificationAction = 'log-now' | 'snooze-15' | 'log-reading' | 'discarded' | 'open';

export type TemplogNotificationEvent = {
  action: NotificationAction;
  checkIds: string[];
  checkpointId: string | null;
  itemId: string | null;
  /** Deep link to open (taps, Log now, Log reading); null for background actions. */
  url: string | null;
};

// ---------------------------------------------------------------------------
// Setup

let setupPromise: Promise<void> | null = null;

/** Idempotent: foreground presentation, Android channels and both categories. Every function below awaits it. */
export function setupNotifications(): Promise<void> {
  if (!setupPromise) {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const data = n.request.content.data as Partial<TemplogNotificationData> | undefined;
        const quiet = data?.kind === 'cooling-status';
        return { shouldShowBanner: !quiet, shouldShowList: true, shouldPlaySound: !quiet, shouldSetBadge: !quiet };
      },
    });
    setupPromise = (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_CHECKS, {
          name: 'Temperature checks',
          description: 'A reminder when a check is due, with Log now / Snooze 15, and when it is overdue.',
          importance: Notifications.AndroidImportance.HIGH,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          vibrationPattern: [0, 250, 150, 250],
          enableVibrate: true,
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync(CHANNEL_COOLING, {
          name: 'Cooling readings',
          description: 'Stage 1 (2 h) and stage 2 (6 h) cooling readings, and missed stages.',
          importance: Notifications.AndroidImportance.HIGH,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          vibrationPattern: [0, 400, 200, 400],
          enableVibrate: true,
          sound: 'default',
        });
        // expo-live-updates creates this channel at default importance; the prompts already chime
        // on `cooling`, so the ongoing timers stay silent.
        await Notifications.setNotificationChannelAsync(CHANNEL_COOLING_LIVE, {
          name: 'Cooling timers',
          description: 'Ongoing countdown while food is cooling.',
          importance: Notifications.AndroidImportance.LOW,
          sound: null,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
        });
        await Notifications.setNotificationChannelAsync(CHANNEL_GENERAL, {
          name: 'General',
          description: 'Weekly kitchen summary and shared-kitchen notices.',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORY_CHECK, [
        { identifier: ACTION_LOG_NOW, buttonTitle: 'Log now', options: { opensAppToForeground: true } },
        { identifier: ACTION_SNOOZE, buttonTitle: `Snooze ${SNOOZE_MINUTES}`, options: { opensAppToForeground: false } },
      ]);
      await Notifications.setNotificationCategoryAsync(CATEGORY_COOLING, [
        { identifier: ACTION_LOG_READING, buttonTitle: 'Log reading', options: { opensAppToForeground: true } },
        { identifier: ACTION_DISCARDED, buttonTitle: 'Discarded', options: { opensAppToForeground: false, isDestructive: true } },
      ]);
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  return setupPromise;
}

// ---------------------------------------------------------------------------
// Permission

export type NotificationPermission = {
  /** `granted` also covers iOS provisional authorisation. */
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
};

function toPermission(p: Notifications.NotificationPermissionsStatus): NotificationPermission {
  const iosStatus = p.ios?.status;
  const granted =
    p.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL;
  return {
    status: granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied',
    canAskAgain: p.canAskAgain,
  };
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

/**
 * Shows the OS prompt when it still can (call after a priming screen); otherwise returns the current
 * status so the UI can offer `openNotificationSettings()`. Reschedules on grant.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  await setupNotifications(); // Android 13+: a channel must exist before the prompt.
  const current = await getNotificationPermission();
  if (current.status === 'granted' || !current.canAskAgain) return current;
  const next = toPermission(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }),
  );
  if (next.status === 'granted') await rescheduleAll().catch(() => undefined);
  return next;
}

/** App settings page (notifications, and on Android 12+ "Alarms & reminders" for exact times). */
export function openNotificationSettings(): Promise<void> {
  return Linking.openSettings();
}

// ---------------------------------------------------------------------------
// Planning

type Planned = { identifier: string; date: number; channelId: string; content: Notifications.NotificationContentInput; sig: string };

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const names = (checkpoints: readonly (Checkpoint | undefined)[]) => {
  const list = [...new Set(checkpoints.map((c) => c?.name ?? 'Checkpoint'))];
  return list.length <= 3 ? list.join(', ') : `${list.slice(0, 3).join(', ')} +${list.length - 3}`;
};

/** First instant the kitchen is open at or after `at` within the next 24 h (or `fallback`). */
function clampToOpening(kitchen: Kitchen, at: number, fallback: number): number {
  if (isOpenAt(kitchen, at)) return at;
  for (let t = at + 5 * MINUTE; t < fallback; t += 5 * MINUTE) if (isOpenAt(kitchen, t)) return t;
  return fallback;
}

/** Check reminders (lead before each check or at its snooze) and overdue escalations. */
export function planCheckNotifications(
  kitchen: Kitchen,
  checkpoints: readonly Checkpoint[],
  checks: readonly Check[],
  settings: Settings,
  now: number,
): Planned[] {
  const byId = new Map(checkpoints.map((c) => [c.id, c]));
  const snoozes = getCheckSnoozes();
  const reminders = new Map<number, Check[]>();
  const overdue = new Map<number, Check[]>();
  for (const check of checks) {
    if (!byId.has(check.checkpointId)) continue;
    const at = Date.parse(check.scheduledFor);
    if (settings.quietOutsideHours && !isOpenAt(kitchen, at)) continue;
    const snoozed = snoozes[check.id] ? Date.parse(snoozes[check.id]!) : 0;
    let trigger = snoozed > now ? snoozed : at - settings.reminderLeadMinutes * MINUTE;
    if (settings.quietOutsideHours && snoozed <= now) trigger = clampToOpening(kitchen, trigger, at);
    if (trigger > now) reminders.set(trigger, [...(reminders.get(trigger) ?? []), check]);
    const late = at + settings.graceMinutes * MINUTE;
    if (late > now) overdue.set(late, [...(overdue.get(late) ?? []), check]);
  }
  const plans: Planned[] = [];
  for (const [trigger, group] of reminders) {
    const cps = group.map((c) => byId.get(c.checkpointId));
    const snoozed = group.every((c) => snoozes[c.id] && Date.parse(snoozes[c.id]!) === trigger);
    const due = formatClock(group[0]!.scheduledFor, kitchen.tz);
    const title = group.length === 1 ? `${snoozed ? 'Reminder: ' : ''}${cps[0]?.name ?? 'Check'} check` : `${group.length} checks due`;
    const body = group.length === 1 ? `Due ${due}. Tap Log now to record the temperature.` : `${names(cps)} · due ${due}`;
    const data: TemplogNotificationData = {
      kind: 'check',
      checkIds: group.map((c) => c.id),
      checkpointIds: group.map((c) => c.checkpointId),
      scheduledFor: group[0]!.scheduledFor,
      sig: '',
    };
    data.sig = hash(`${trigger}|${data.checkIds.join(',')}|${title}|${body}`);
    plans.push({
      identifier: `${CHECK_PREFIX}${trigger}`,
      date: trigger,
      channelId: CHANNEL_CHECKS,
      sig: data.sig,
      content: {
        title,
        body,
        data,
        sound: 'default',
        categoryIdentifier: CATEGORY_CHECK,
        interruptionLevel: 'timeSensitive',
        priority: Notifications.AndroidNotificationPriority.MAX,
        autoDismiss: true,
      },
    });
  }
  // Overdue escalation: badge = checks expected open at that instant if nothing else is logged.
  const lateTimes = [...overdue.keys()].sort((a, b) => a - b);
  for (const late of lateTimes) {
    const group = overdue.get(late)!;
    const cps = group.map((c) => byId.get(c.checkpointId));
    const open = checks.filter((c) => {
      const at = Date.parse(c.scheduledFor);
      return at <= late && late < at + DEFAULT_MISSED_AFTER_MINUTES * MINUTE;
    }).length;
    const title = group.length === 1 ? `Overdue: ${cps[0]?.name ?? 'check'}` : `${group.length} checks overdue`;
    const body = `${names(cps)} was due ${formatClock(group[0]!.scheduledFor, kitchen.tz)}. Log it or it will be marked missed.`;
    const data: TemplogNotificationData = {
      kind: 'overdue',
      checkIds: group.map((c) => c.id),
      checkpointIds: group.map((c) => c.checkpointId),
      scheduledFor: group[0]!.scheduledFor,
      sig: '',
    };
    data.sig = hash(`o|${late}|${data.checkIds.join(',')}|${title}|${body}|${open}`);
    plans.push({
      identifier: `${OVERDUE_PREFIX}${late}`,
      date: late,
      channelId: CHANNEL_CHECKS,
      sig: data.sig,
      content: {
        title,
        body,
        data,
        sound: 'default',
        badge: open,
        categoryIdentifier: CATEGORY_CHECK,
        interruptionLevel: 'timeSensitive',
        priority: Notifications.AndroidNotificationPriority.MAX,
        autoDismiss: true,
      },
    });
  }
  return plans;
}

const stageMaxLabel = (stage: 'stage1' | 'stage2', unit: Unit) =>
  formatTemp(displayTemp(stage === 'stage1' ? COOLING_LIMITS.stage1MaxF : COOLING_LIMITS.stage2MaxF, unit), unit);

/** Cooling prompts at each open stage deadline minus the lead, plus a "stage missed" alert at the deadline. */
export function planCoolingNotifications(items: readonly CoolingItem[], settings: Settings, tz: string, now: number): Planned[] {
  const lead = Math.min(30, Math.max(5, settings.reminderLeadMinutes));
  const plans: Planned[] = [];
  for (const item of items) {
    const { stage1DueAt, stage2DueAt } = coolingDeadlines(item.startedAt);
    const stages: ['stage1' | 'stage2', string][] =
      item.status === 'cooling'
        ? [
            ['stage1', stage1DueAt],
            ['stage2', stage2DueAt],
          ]
        : item.status === 'stage1-pass'
          ? [['stage2', stage2DueAt]]
          : [];
    for (const [stage, dueAt] of stages) {
      const due = Date.parse(dueAt);
      const label = stage === 'stage1' ? 'Stage 1' : 'Stage 2';
      const hours = stage === 'stage1' ? COOLING_LIMITS.stage1Hours : COOLING_LIMITS.totalHours;
      const limit = `${stageMaxLabel(stage, settings.unit)} within ${hours} h`;
      const reheat = formatTemp(displayTemp(COOKING_MINIMUMS_F.reheat, settings.unit), settings.unit);
      const entries: [boolean, number, string, string][] = [
        [false, due - lead * MINUTE, `${item.name}: ${label} reading due`, `Must be ${limit}, by ${formatClock(dueAt, tz)}.`],
        [true, due + MINUTE, `${item.name}: ${label} missed`, `Not logged ${limit}. Reheat to ${reheat} and restart, or discard.`],
      ];
      for (const [late, at, title, body] of entries) {
        if (at <= now) continue;
        const data: TemplogNotificationData = { kind: 'cooling', itemId: item.id, stage, late, sig: '' };
        data.sig = hash(`${at}|${item.id}|${stage}|${late}|${title}|${body}`);
        plans.push({
          identifier: `${COOLING_PREFIX}${item.id}:${stage}${late ? ':late' : ''}`,
          date: at,
          channelId: CHANNEL_COOLING,
          sig: data.sig,
          content: {
            title,
            body,
            data,
            sound: 'default',
            categoryIdentifier: CATEGORY_COOLING,
            interruptionLevel: 'timeSensitive',
            priority: Notifications.AndroidNotificationPriority.MAX,
            autoDismiss: true,
          },
        });
      }
    }
  }
  return plans;
}

function planAll(now: number): Planned[] {
  const kitchen = getActiveKitchen();
  if (!kitchen) return [];
  const settings = getSettings();
  const checkpoints = listCheckpoints(kitchen.id);
  const checks = upcomingChecks(kitchen, ROLLING_DAYS, new Date(now - settings.graceMinutes * MINUTE).toISOString());
  // Only checks that are still upcoming or due (not logged yet) get reminders.
  const from = new Date(now - (settings.graceMinutes + 60) * MINUTE).toISOString();
  const until = new Date(now + ROLLING_DAYS * 86_400_000).toISOString();
  const readings = listReadingsForChecksBetween(kitchen.id, from, until);
  const open = classifyChecks(checks, readings, new Date(now).toISOString(), settings.graceMinutes, DEFAULT_MISSED_AFTER_MINUTES)
    .filter((e) => e.state === 'upcoming' || e.state === 'due')
    .map((e) => e.check);
  // Cooling limits are phrased in the display unit (`kitchen.unit`).
  const cooling = planCoolingNotifications(listActiveCoolingItems(kitchen.id), { ...settings, unit: kitchen.unit }, kitchen.tz, now);
  const checkPlans = planCheckNotifications(kitchen, checkpoints, open, settings, now);
  // Cooling first (food safety deadlines), then checks by time, within the OS limit.
  return [...cooling.sort((a, b) => a.date - b.date), ...checkPlans.sort((a, b) => a.date - b.date)].slice(0, MAX_SCHEDULED);
}

// ---------------------------------------------------------------------------
// Scheduling

let syncing: Promise<void> | null = null;
let again = false;

/**
 * Diffs the scheduled `check:*`, `overdue:*` and `cooling:*` notifications against what the data
 * wants for the next 3 days and cancels / schedules only what changed. Coalesces concurrent calls.
 * No-op without permission.
 */
export function rescheduleAll(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function syncOnce(): Promise<void> {
  await setupNotifications();
  if ((await getNotificationPermission()).status !== 'granted') return;
  const wanted = planAll(Date.now());
  const wantedById = new Map(wanted.map((p) => [p.identifier, p]));
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) =>
    MANAGED_PREFIXES.some((p) => n.identifier.startsWith(p)),
  );
  const keep = new Set<string>();
  await Promise.all(
    scheduled.map(async (n) => {
      const data = n.content.data as Partial<{ sig: string }> | undefined;
      const want = wantedById.get(n.identifier);
      if (want && data?.sig === want.sig) {
        keep.add(n.identifier);
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
    }),
  );
  for (const p of wanted) {
    if (keep.has(p.identifier)) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: p.identifier,
        content: p.content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.date, channelId: p.channelId },
      });
    } catch (error) {
      console.warn('[notifications] schedule failed', p.identifier, error);
    }
  }
}

/** App icon badge = checks due or overdue right now (cleared when none). */
export async function setOpenChecksBadge(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => undefined);
}

/**
 * Removes delivered reminders that no longer apply: check reminders whose checks were all logged
 * (`checkIds`) and cooling prompts of closed items (`coolingItemIds`).
 */
export async function dismissDeliveredFor(opts: { checkIds?: readonly string[]; closedCoolingItemIds?: readonly string[] }): Promise<void> {
  const checkIds = new Set(opts.checkIds ?? []);
  const items = new Set(opts.closedCoolingItemIds ?? []);
  if (!checkIds.size && !items.size) return;
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(
    presented
      .filter((n) => {
        const data = n.request.content.data as Partial<TemplogNotificationData> | undefined;
        if ((data?.kind === 'check' || data?.kind === 'overdue') && Array.isArray(data.checkIds)) {
          return data.checkIds.every((id) => checkIds.has(id));
        }
        if (data?.kind === 'cooling' && typeof data.itemId === 'string') return items.has(data.itemId);
        return false;
      })
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => undefined)),
  );
}

/** Cancels every scheduled Templog reminder and clears the badge (delete all data). */
export async function cancelAllTemplogNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((n) => MANAGED_PREFIXES.some((p) => n.identifier.startsWith(p)))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)),
  );
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  await setOpenChecksBadge(0);
}

// ---------------------------------------------------------------------------
// Ongoing cooling notification (Android below 16; used by live-status.android.ts)

export async function presentCoolingStatusNotification(input: { itemId: string; title: string; body: string }): Promise<void> {
  await setupNotifications();
  const data: TemplogNotificationData = { kind: 'cooling-status', itemId: input.itemId };
  await Notifications.scheduleNotificationAsync({
    identifier: `${COOLING_STATUS_PREFIX}${input.itemId}`, // same id → replaced in place
    content: {
      title: input.title,
      body: input.body,
      data,
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      categoryIdentifier: CATEGORY_COOLING,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_COOLING_LIVE } : null,
  });
}

export async function dismissCoolingStatusNotification(itemId: string): Promise<void> {
  await Notifications.dismissNotificationAsync(`${COOLING_STATUS_PREFIX}${itemId}`).catch(() => undefined);
}

/** Item ids with an ongoing cooling notification on screen. */
export async function presentedCoolingStatusIds(): Promise<string[]> {
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  return presented
    .map((n) => n.request.identifier)
    .filter((id) => id.startsWith(COOLING_STATUS_PREFIX))
    .map((id) => id.slice(COOLING_STATUS_PREFIX.length));
}

// ---------------------------------------------------------------------------
// Responses (action buttons and taps)

const HANDLED_KEY = 'templog.notifications.handled';

/** True the first time a given response is seen (listener, launch response and Android background task may all fire). */
function firstTime(response: Notifications.NotificationResponse): boolean {
  const key = `${response.notification.request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
  try {
    const seen: string[] = JSON.parse(Storage.getItemSync(HANDLED_KEY) ?? '[]');
    if (seen.includes(key)) return false;
    Storage.setItemSync(HANDLED_KEY, JSON.stringify([...seen.slice(-49), key]));
  } catch {
    // best effort
  }
  return true;
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

export function toNotificationEvent(response: Notifications.NotificationResponse): TemplogNotificationEvent | null {
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  const id = response.actionIdentifier;
  const checkIds = strings(data.checkIds);
  const checkpointIds = strings(data.checkpointIds);
  const checkpointId = checkpointIds[0] ?? null;
  const itemId = typeof data.itemId === 'string' ? data.itemId : null;
  const scheduledFor = typeof data.scheduledFor === 'string' ? data.scheduledFor : null;
  const isCheck = data.kind === 'check' || data.kind === 'overdue';
  const isCooling = data.kind === 'cooling' || data.kind === 'cooling-status';
  const checkUrl = () =>
    checkpointId && new Set(checkpointIds).size === 1 ? deepLinks.log(checkpointId, scheduledFor) : deepLinks.today();

  if (id === ACTION_LOG_NOW && isCheck) return { action: 'log-now', checkIds, checkpointId, itemId: null, url: checkUrl() };
  if (id === ACTION_SNOOZE && isCheck && checkIds.length) return { action: 'snooze-15', checkIds, checkpointId, itemId: null, url: null };
  if (id === ACTION_LOG_READING && isCooling && itemId) {
    return { action: 'log-reading', checkIds: [], checkpointId: null, itemId, url: deepLinks.cooling(itemId) };
  }
  if (id === ACTION_DISCARDED && isCooling && itemId) return { action: 'discarded', checkIds: [], checkpointId: null, itemId, url: null };
  if (id === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    const url =
      typeof data.url === 'string'
        ? data.url
        : isCheck
          ? checkUrl()
          : isCooling && itemId
            ? deepLinks.cooling(itemId)
            : data.type === 'weekly-summary'
              ? deepLinks.history()
              : null;
    return { action: 'open', checkIds, checkpointId, itemId, url };
  }
  return null;
}

/** Decodes a response once (deduped across listener / launch / background task). */
export function claimNotificationResponse(response: Notifications.NotificationResponse): TemplogNotificationEvent | null {
  const event = toNotificationEvent(response);
  if (!event || !firstTime(response)) return null;
  // Android leaves the notification up after a background action; clear it.
  if (event.action === 'snooze-15' || event.action === 'discarded') {
    Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
  }
  return event;
}

const responseListeners = new Set<(event: TemplogNotificationEvent) => void>();
let responseSub: { remove(): void } | null = null;

/**
 * Action buttons and taps on Templog notifications while JS runs. One native subscription fans out to
 * every listener, so each response is claimed once and every listener sees it. Returns unsubscribe.
 */
export function addNotificationResponseListener(listener: (event: TemplogNotificationEvent) => void): () => void {
  responseListeners.add(listener);
  if (!responseSub) {
    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const event = claimNotificationResponse(response);
      if (event) responseListeners.forEach((l) => l(event));
    });
  }
  return () => {
    responseListeners.delete(listener);
    if (!responseListeners.size) {
      responseSub?.remove();
      responseSub = null;
    }
  };
}

/** Responses that should navigate (taps, Log now, Log reading). Returns unsubscribe. */
export function addNotificationOpenListener(listener: (url: string) => void): () => void {
  return addNotificationResponseListener((event) => {
    if (event.url) listener(event.url);
  });
}

/** The response that cold-launched the app (e.g. "Log now" while the app was killed), handled once. */
export async function consumeLaunchNotificationResponse(): Promise<TemplogNotificationEvent | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  return claimNotificationResponse(response);
}

/** Fires when a check / cooling notification arrives while the app is open (to refresh surfaces). */
export function addTemplogNotificationReceivedListener(listener: () => void): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as Partial<TemplogNotificationData> | undefined;
    if (data?.kind === 'check' || data?.kind === 'overdue' || data?.kind === 'cooling') listener();
  });
  return () => sub.remove();
}

// ---------------------------------------------------------------------------
// Expo push token (weekly owner summary, shared kitchen)

export type PushRegistration =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'not-a-device' | 'unsupported' | 'permission-denied' | 'missing-project-id' | 'error'; message?: string };

/** EAS project id from app config (`extra.eas.projectId`), or null before `eas init`. */
export function getEasProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Expo push token for `POST /api/devices`. Never throws; never prompts unless `prompt` is true. */
export async function getPushRegistration(opts: { prompt?: boolean } = {}): Promise<PushRegistration> {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { ok: false, reason: 'unsupported' };
    if (!Device.isDevice) return { ok: false, reason: 'not-a-device' };
    const projectId = getEasProjectId();
    if (!projectId) return { ok: false, reason: 'missing-project-id' };
    const permission = opts.prompt ? await requestNotificationPermission() : await getNotificationPermission();
    if (permission.status !== 'granted') return { ok: false, reason: 'permission-denied' };
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data, platform: Platform.OS };
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
