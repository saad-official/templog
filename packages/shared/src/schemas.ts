import { z } from "zod";
import { isUuid } from "./ids";

/** ISO-8601 timestamp, `Z` or numeric offset. */
export const IsoTimestamp = z.iso.datetime({ offset: true });
export const IdSchema = z.string().refine(isUuid, "Invalid UUID");
export const DayKeySchema = z.iso.date();
/** 24-hour local wall-clock time, zero-padded `HH:mm`. */
export const HhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");
export const UnitSchema = z.enum(["F", "C"]);

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** IANA zone name known to the runtime's Intl (e.g. `America/Toronto`). */
export const TimeZoneSchema = z.string().min(1).refine(isTimeZone, "Unknown time zone");

const unique = <T>(xs: readonly T[]) => new Set(xs).size === xs.length;

const syncFields = {
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  deletedAt: IsoTimestamp.nullish(),
};

/**
 * One weekday's opening hours. `close <= open` means the kitchen closes after midnight
 * (17:00 → 02:00); `open === close` means open around the clock.
 */
export const OpeningDaySchema = z.object({ open: HhmmSchema, close: HhmmSchema });
/** Seven entries indexed by weekday, 0 = Sunday … 6 = Saturday; `null` = closed that day. */
export const OpeningHoursSchema = z.array(OpeningDaySchema.nullable()).length(7);

export const KitchenSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(80),
  tz: TimeZoneSchema,
  /** Kitchen default display unit; readings and limits are always stored in °F. */
  unit: UnitSchema,
  openingHours: OpeningHoursSchema,
  ownerUserId: z.string().min(1).nullish(),
  joinCode: z.string().nullish(),
  ...syncFields,
});

export const CHECKPOINT_KINDS = ["cold-holding", "hot-holding", "cooking", "receiving", "freezer"] as const;
export const CheckpointKindSchema = z.enum(CHECKPOINT_KINDS);

const TempF = z.number().finite().min(-100).max(600);

/** Acceptable range in °F; at least one bound. A reading passes when `min <= value <= max`. */
export const LimitsSchema = z
  .object({ min: TempF.optional(), max: TempF.optional() })
  .refine((l) => l.min !== undefined || l.max !== undefined, "Set a minimum or a maximum")
  .refine((l) => l.min === undefined || l.max === undefined || l.min <= l.max, { message: "min must not exceed max", path: ["max"] });

/** Every N hours from opening time while open. */
export const EveryCadenceSchema = z.object({ kind: z.literal("every"), hours: z.number().min(0.25).max(24) });
/** Fixed wall-clock times every day the kitchen is open. */
export const TimesCadenceSchema = z.object({
  kind: z.literal("times"),
  times: z.array(HhmmSchema).min(1).max(48).refine(unique, "Duplicate time"),
});
export const CadenceSchema = z.discriminatedUnion("kind", [EveryCadenceSchema, TimesCadenceSchema]);

export const CheckpointSchema = z.object({
  id: IdSchema,
  kitchenId: IdSchema,
  name: z.string().trim().min(1).max(80),
  kind: CheckpointKindSchema,
  limits: LimitsSchema,
  cadence: CadenceSchema,
  sortOrder: z.number().int(),
  archivedAt: IsoTimestamp.nullish(),
  ...syncFields,
});

export const CORRECTIVE_ACTION_KINDS = ["discard", "reheat", "move", "service", "other"] as const;
export const CorrectiveActionSchema = z
  .object({ kind: z.enum(CORRECTIVE_ACTION_KINDS), note: z.string().trim().max(500).optional() })
  .refine((a) => a.kind !== "other" || !!a.note, { message: "Describe the action", path: ["note"] });

export const READING_SOURCES = ["manual", "reminder", "live-activity"] as const;
export const ReadingResultSchema = z.enum(["pass", "fail"]);
export const InitialsSchema = z.string().trim().min(1).max(4);

export const ReadingSchema = z
  .object({
    id: IdSchema,
    /** Holding/cooking/receiving checkpoint; null for a cooling-stage reading. */
    checkpointId: IdSchema.nullish(),
    /** Cooling item for a stage reading; null for checkpoint readings. */
    coolingItemId: IdSchema.nullish(),
    kitchenId: IdSchema,
    /** Scheduled check this answers; null for ad-hoc readings. */
    scheduledFor: IsoTimestamp.nullish(),
    takenAt: IsoTimestamp,
    valueF: TempF,
    result: ReadingResultSchema,
    failReason: z.string().max(200).nullish(),
    correctiveAction: CorrectiveActionSchema.nullish(),
    initials: InitialsSchema,
    source: z.enum(READING_SOURCES),
    ...syncFields,
  })
  .refine((r) => !!r.checkpointId !== !!r.coolingItemId, {
    message: "A reading belongs to exactly one checkpoint or cooling item",
    path: ["checkpointId"],
  })
  .refine((r) => r.result === "pass" || !!r.correctiveAction, {
    message: "A failed reading needs a corrective action",
    path: ["correctiveAction"],
  });

export const COOLING_STATUSES = ["cooling", "stage1-pass", "done", "failed", "discarded"] as const;
export const CoolingStatusSchema = z.enum(COOLING_STATUSES);

export const CoolingItemSchema = z.object({
  id: IdSchema,
  kitchenId: IdSchema,
  name: z.string().trim().min(1).max(80),
  /** When the food came off heat (stage 1 clock starts). */
  startedAt: IsoTimestamp,
  /** Optional temperature when cooling started. */
  startValueF: TempF.nullish(),
  stage1ReadingId: IdSchema.nullish(),
  /** When stage 1 passed (the stage-1 reading's `takenAt`); stage 2 progress runs from here. */
  stage1At: IsoTimestamp.nullish(),
  stage2ReadingId: IdSchema.nullish(),
  status: CoolingStatusSchema,
  completedAt: IsoTimestamp.nullish(),
  failedAt: IsoTimestamp.nullish(),
  failReason: z.string().max(200).nullish(),
  discardedAt: IsoTimestamp.nullish(),
  correctiveAction: CorrectiveActionSchema.nullish(),
  initials: InitialsSchema.nullish(),
  note: z.string().max(500).nullish(),
  ...syncFields,
});

export const AppearanceSchema = z.enum(["system", "light", "dark"]);

export const SettingsSchema = z.object({
  onboarded: z.boolean().default(false),
  /** Device display unit. */
  unit: UnitSchema.default("F"),
  initialsDefault: InitialsSchema.optional(),
  /** Minutes before a check is due that its reminder fires. */
  reminderLeadMinutes: z.number().int().min(0).max(120).default(15),
  /** Suppress reminders outside opening hours. */
  quietOutsideHours: z.boolean().default(true),
  /** Minutes after `scheduledFor` that a check may still be logged on time (see `dueChecks`). */
  graceMinutes: z.number().int().min(0).max(240).default(30),
  /** Device colour scheme override: follow the system, or force light / dark. */
  appearance: AppearanceSchema.default("system"),
});

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Join codes: 6–8 chars, uppercase, no look-alikes (0 O 1 I L). */
export const JoinCodeSchema = z.string().regex(/^[A-HJKMNP-Z2-9]{6,8}$/, "Invalid join code");

export const KitchenMemberSchema = z.object({
  id: IdSchema,
  kitchenId: IdSchema,
  userId: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
  initials: InitialsSchema.nullish(),
  role: z.enum(["owner", "staff"]),
  joinedAt: IsoTimestamp,
  ...syncFields,
});

export const DeviceSchema = z.object({
  userId: z.string().min(1),
  kitchenId: IdSchema.nullish(),
  expoPushToken: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  lastSeenAt: IsoTimestamp,
});

export const SyncTablesSchema = z.object({
  kitchens: z.array(KitchenSchema).default([]),
  checkpoints: z.array(CheckpointSchema).default([]),
  readings: z.array(ReadingSchema).default([]),
  coolingItems: z.array(CoolingItemSchema).default([]),
});

/** Payload key → SQL table name (device SQLite and server Postgres). */
export const SYNC_TABLE_NAMES = {
  kitchens: "kitchens",
  checkpoints: "checkpoints",
  readings: "readings",
  coolingItems: "cooling_items",
} as const;

const EMPTY_TABLES = { kitchens: [], checkpoints: [], readings: [], coolingItems: [] };

/** Device → server: rows dirtied since the last push (soft deletes carry `deletedAt`). */
export const SyncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  tables: SyncTablesSchema.default(EMPTY_TABLES),
});

export const SyncPushResponseSchema = z.object({
  serverTime: IsoTimestamp,
  accepted: z.number().int().nonnegative(),
});

/** Server → device: rows changed since `?since=`; `serverTime` becomes the next `since`. */
export const SyncPullResponseSchema = z.object({
  serverTime: IsoTimestamp,
  tables: SyncTablesSchema.default(EMPTY_TABLES),
});

export type OpeningDay = z.infer<typeof OpeningDaySchema>;
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;
export type Kitchen = z.infer<typeof KitchenSchema>;
export type CheckpointKind = z.infer<typeof CheckpointKindSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type EveryCadence = z.infer<typeof EveryCadenceSchema>;
export type TimesCadence = z.infer<typeof TimesCadenceSchema>;
export type Cadence = z.infer<typeof CadenceSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type CorrectiveActionKind = (typeof CORRECTIVE_ACTION_KINDS)[number];
export type CorrectiveAction = z.infer<typeof CorrectiveActionSchema>;
export type ReadingSource = (typeof READING_SOURCES)[number];
export type ReadingResult = z.infer<typeof ReadingResultSchema>;
export type Reading = z.infer<typeof ReadingSchema>;
export type CoolingStatus = z.infer<typeof CoolingStatusSchema>;
export type CoolingItem = z.infer<typeof CoolingItemSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Appearance = z.infer<typeof AppearanceSchema>;
export type KitchenMember = z.infer<typeof KitchenMemberSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type SyncTables = z.infer<typeof SyncTablesSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
