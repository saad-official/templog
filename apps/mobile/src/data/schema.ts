// Device SQLite schema. Timestamps are ISO-8601 UTC strings (`Date#toISOString()`), so lexical
// comparison in SQL equals chronological order. Temperatures are stored in °F (shared `units.ts`).
// Checks are not stored: they are re-derived from checkpoints + opening hours with shared
// `expandChecks` (deterministic ids). JSON columns are validated with the shared zod schemas on read and write (mappers.ts).
// Regenerate migrations after editing: `pnpm --filter mobile db:generate`.
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const syncColumns = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
};

export const kitchens = sqliteTable('kitchens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** IANA zone the schedule is expanded in. */
  tz: text('tz').notNull(),
  unit: text('unit', { enum: ['F', 'C'] }).notNull(),
  /** `OpeningHours` JSON (7 entries, Sunday first, null = closed). */
  openingHoursJson: text('opening_hours_json').notNull(),
  ownerUserId: text('owner_user_id'),
  joinCode: text('join_code'),
  ...syncColumns,
});

export const checkpoints = sqliteTable(
  'checkpoints',
  {
    id: text('id').primaryKey(),
    kitchenId: text('kitchen_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    /** Acceptable range in °F; at least one bound (shared `LimitsSchema`). */
    minF: real('min_f'),
    maxF: real('max_f'),
    /** `Cadence` JSON (`every` N hours while open, or fixed `times`). */
    cadenceJson: text('cadence_json').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: text('archived_at'),
    ...syncColumns,
  },
  (t) => [index('checkpoints_kitchen_idx').on(t.kitchenId)],
);

export const readings = sqliteTable(
  'readings',
  {
    id: text('id').primaryKey(),
    kitchenId: text('kitchen_id').notNull(),
    checkpointId: text('checkpoint_id'),
    coolingItemId: text('cooling_item_id'),
    scheduledFor: text('scheduled_for'),
    takenAt: text('taken_at').notNull(),
    valueF: real('value_f').notNull(),
    result: text('result', { enum: ['pass', 'fail'] }).notNull(),
    failReason: text('fail_reason'),
    /** `CorrectiveAction` JSON or null. */
    correctiveActionJson: text('corrective_action_json'),
    initials: text('initials').notNull(),
    source: text('source').notNull(),
    ...syncColumns,
  },
  (t) => [
    index('readings_taken_idx').on(t.takenAt),
    index('readings_cp_taken_idx').on(t.checkpointId, t.takenAt),
    index('readings_cooling_idx').on(t.coolingItemId),
    index('readings_updated_idx').on(t.updatedAt),
  ],
);

export const coolingItems = sqliteTable(
  'cooling_items',
  {
    id: text('id').primaryKey(),
    kitchenId: text('kitchen_id').notNull(),
    name: text('name').notNull(),
    startedAt: text('started_at').notNull(),
    startValueF: real('start_value_f'),
    stage1ReadingId: text('stage1_reading_id'),
    stage1At: text('stage1_at'),
    stage2ReadingId: text('stage2_reading_id'),
    status: text('status').notNull(),
    completedAt: text('completed_at'),
    failedAt: text('failed_at'),
    failReason: text('fail_reason'),
    discardedAt: text('discarded_at'),
    correctiveActionJson: text('corrective_action_json'),
    initials: text('initials'),
    note: text('note'),
    ...syncColumns,
  },
  (t) => [index('cooling_items_status_idx').on(t.status), index('cooling_items_started_idx').on(t.startedAt)],
);

/** Key/value settings. Values are JSON; keys of shared `Settings` plus app-local `app.*` keys. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Sync bookkeeping, one row per (kitchen, synced table):
 * `pushed_up_to` = highest row version (max of updated/deleted) the server has accepted,
 * `pulled_at` = the server's `serverTime` cursor from the last pull (`?since=`).
 */
export const syncState = sqliteTable(
  'sync_state',
  {
    kitchenId: text('kitchen_id').notNull(),
    tableName: text('table_name').notNull(),
    pushedUpTo: text('pushed_up_to'),
    pulledAt: text('pulled_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.kitchenId, t.tableName] })],
);

export type KitchenRow = typeof kitchens.$inferSelect;
export type CheckpointRow = typeof checkpoints.$inferSelect;
export type ReadingRow = typeof readings.$inferSelect;
export type CoolingItemRow = typeof coolingItems.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;
