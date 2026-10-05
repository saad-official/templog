/**
 * Postgres schema (docs/spec.md section 3). Every table, including Better
 * Auth's, lives in the `templog` Postgres schema so the database can be
 * dedicated or shared with sibling apps.
 *
 * The phone is the source of truth (offline-first SQLite). Nothing reaches
 * this database unless someone signs in and shares a kitchen; then the
 * kitchen's `checkpoints`, `readings` and `cooling_items` are mirrored here so
 * every member's phone converges and the owner gets a weekly summary:
 * - ids are UUID strings generated on the device; the primary key is
 *   `(kitchen_id, id)`, so a member of one kitchen can never collide with (or
 *   overwrite) another kitchen's rows, whatever ids a client sends;
 * - `updated_at` / `deleted_at` are device times; the later of the two is the
 *   row version that decides last-write-wins (lib/sync/merge.ts);
 * - `deleted_at` is a soft delete (tombstone) that sync propagates;
 * - `server_updated_at` is set by the server on every accepted write and is
 *   the cursor for `GET /api/sync/pull?since=`.
 * Mirror rows reference their kitchen with ON DELETE CASCADE: deleting the
 * kitchen (or the owner's account) deletes everything synced for it. There
 * are no foreign keys between mirror tables: devices push in any order.
 *
 * Temperatures are stored in °F (`value_f`), as in packages/shared/src/schemas.ts;
 * the kitchen's `unit` is only how it displays them.
 */
import { doublePrecision, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import type { Cadence, CorrectiveAction, Limits, OpeningHours } from "@templog/shared/schemas";

export const templog = pgSchema("templog");

const tz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Enums (value lists exported for zod schemas)
// ---------------------------------------------------------------------------

export const PLATFORMS = ["ios", "android"] as const;
export const KITCHEN_ROLES = ["owner", "staff"] as const;
export type KitchenRole = (typeof KITCHEN_ROLES)[number];
export const UNITS = ["F", "C"] as const;

export const platformEnum = templog.enum("platform", PLATFORMS);
export const kitchenRoleEnum = templog.enum("kitchen_role", KITCHEN_ROLES);
export const unitEnum = templog.enum("unit", UNITS);

// ---------------------------------------------------------------------------
// Better Auth core schema (v1.7). JS keys are Better Auth's field names (the
// drizzle adapter looks columns up by them); column names are snake_case.
// ---------------------------------------------------------------------------

export const user = templog.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = templog.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: tz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = templog.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tz("access_token_expires_at"),
    refreshTokenExpiresAt: tz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = templog.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tz("expires_at").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Push devices
// ---------------------------------------------------------------------------

const userId = (name = "user_id") =>
  text(name)
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/** One row per Expo push token. Re-registering a token from another account moves it. */
export const devices = templog.table(
  "devices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: userId(),
    expoPushToken: text("expo_push_token").notNull().unique(),
    platform: platformEnum("platform").notNull(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("devices_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Shared kitchens
// ---------------------------------------------------------------------------

/**
 * A shared kitchen. The id is the device's UUID for its local kitchen (so
 * the rows it already has keep their `kitchen_id`), or a server UUID. One
 * owned kitchen per account (multi-kitchen chains are out of scope).
 */
export const kitchens = templog.table(
  "kitchens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerUserId: userId("owner_user_id"),
    name: text("name").notNull(),
    /** IANA zone: check schedules and the weekly summary run on kitchen time. */
    tz: text("tz").notNull(),
    unit: unitEnum("unit").notNull().default("F"),
    /** Seven entries, 0 = Sunday; null = closed (packages/shared OpeningHoursSchema). */
    openingHours: jsonb("opening_hours").$type<OpeningHours>().notNull(),
    /** 8 characters from an unambiguous alphabet (lib/services/kitchens.ts). */
    inviteCode: text("invite_code").notNull().unique(),
    createdAt: tz("created_at").notNull().defaultNow(),
    /** Device time of the last settings change (last-write-wins with pushed kitchen rows). */
    updatedAt: tz("updated_at").notNull().defaultNow(),
    serverUpdatedAt: tz("server_updated_at").notNull().defaultNow(),
    /** First local day (YYYY-MM-DD) of the last week summarised: makes the Monday push idempotent. */
    lastSummaryWeek: text("last_summary_week"),
  },
  (t) => [uniqueIndex("kitchens_owner_user_id_idx").on(t.ownerUserId)],
);

export const kitchenMembers = templog.table(
  "kitchen_members",
  {
    kitchenId: text("kitchen_id")
      .notNull()
      .references(() => kitchens.id, { onDelete: "cascade" }),
    userId: userId(),
    role: kitchenRoleEnum("role").notNull(),
    /** How the kitchen knows this person ("Maria", "Line cook 2"). */
    displayName: text("display_name").notNull(),
    /** Default initials for readings this person logs. */
    initials: text("initials"),
    joinedAt: tz("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kitchenId, t.userId] }), index("kitchen_members_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Sync mirrors of the device tables (shared kitchens only)
// ---------------------------------------------------------------------------

/** Columns every mirror table shares. */
const mirrorColumns = () => ({
  id: text("id").notNull(),
  kitchenId: text("kitchen_id")
    .notNull()
    .references(() => kitchens.id, { onDelete: "cascade" }),
  createdAt: tz("created_at").notNull(),
  updatedAt: tz("updated_at").notNull(),
  deletedAt: tz("deleted_at"),
  serverUpdatedAt: tz("server_updated_at").notNull().defaultNow(),
});

export const checkpoints = templog.table(
  "checkpoints",
  {
    ...mirrorColumns(),
    name: text("name").notNull(),
    /** cold-holding | hot-holding | cooking | receiving | freezer */
    kind: text("kind").notNull(),
    /** `{ min?, max? }` in °F. */
    limits: jsonb("limits").$type<Limits>().notNull(),
    /** `{ kind: "every", hours }` or `{ kind: "times", times: ["HH:mm"] }`. */
    cadence: jsonb("cadence").$type<Cadence>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: tz("archived_at"),
  },
  (t) => [
    primaryKey({ columns: [t.kitchenId, t.id] }),
    index("checkpoints_kitchen_server_updated_idx").on(t.kitchenId, t.serverUpdatedAt),
  ],
);

export const readings = templog.table(
  "readings",
  {
    ...mirrorColumns(),
    checkpointId: text("checkpoint_id"),
    coolingItemId: text("cooling_item_id"),
    scheduledFor: tz("scheduled_for"),
    takenAt: tz("taken_at").notNull(),
    valueF: doublePrecision("value_f").notNull(),
    /** pass | fail, decided on the device by the shared limits. */
    result: text("result").notNull(),
    failReason: text("fail_reason"),
    correctiveAction: jsonb("corrective_action").$type<CorrectiveAction>(),
    initials: text("initials").notNull(),
    source: text("source").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kitchenId, t.id] }),
    index("readings_kitchen_server_updated_idx").on(t.kitchenId, t.serverUpdatedAt),
    index("readings_kitchen_taken_idx").on(t.kitchenId, t.takenAt),
  ],
);

export const coolingItems = templog.table(
  "cooling_items",
  {
    ...mirrorColumns(),
    name: text("name").notNull(),
    startedAt: tz("started_at").notNull(),
    startValueF: doublePrecision("start_value_f"),
    stage1ReadingId: text("stage1_reading_id"),
    stage1At: tz("stage1_at"),
    stage2ReadingId: text("stage2_reading_id"),
    /** cooling | stage1-pass | done | failed | discarded */
    status: text("status").notNull(),
    completedAt: tz("completed_at"),
    failedAt: tz("failed_at"),
    failReason: text("fail_reason"),
    discardedAt: tz("discarded_at"),
    correctiveAction: jsonb("corrective_action").$type<CorrectiveAction>(),
    initials: text("initials"),
    note: text("note"),
  },
  (t) => [
    primaryKey({ columns: [t.kitchenId, t.id] }),
    index("cooling_items_kitchen_server_updated_idx").on(t.kitchenId, t.serverUpdatedAt),
  ],
);
