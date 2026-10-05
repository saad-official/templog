import { z } from "zod";
import { CheckpointSchema, CoolingItemSchema, KitchenSchema, ReadingSchema } from "@templog/shared/schemas";

/**
 * Wire contract for `POST /api/sync/push` and `GET /api/sync/pull`. Row
 * shapes are the shared zod schemas (packages/shared/src/schemas.ts), so the
 * Expo app and the server validate the same thing; this file only adds
 * server limits (rows per push) on top of `SyncPushRequestSchema`.
 *
 * Push body: `{ deviceId, tables: { kitchens?, checkpoints?, readings?, coolingItems? } }`.
 * Every checkpoint, reading and cooling item carries its `kitchenId`; the
 * caller must be a member (owner or staff) of every kitchen named, or the
 * whole push is refused (403 `not_a_member`). Kitchen rows only update the
 * kitchen's settings (name, tz, unit, opening hours) when the caller owns it;
 * from anyone else they are ignored. Each (kitchen, id) is merged
 * last-write-wins (lib/sync/merge.ts). Rows whose version is more than a day
 * ahead of the server clock are ignored (a wrong device clock must not win
 * every future conflict). Answer: `{ serverTime, accepted }`.
 *
 * Pull (`?since=<serverTime>&kitchenId=<id>`, both optional): rows of the
 * caller's kitchens (or the one named) written on the server after `since`
 * (all when omitted), tombstones included, as `{ serverTime, tables }`.
 * `serverTime` is the next `since`; it lags the clock by a few seconds so a
 * push committing during a pull is re-sent next time instead of being missed.
 * `joinCode` on a kitchen row is only filled in for its owner.
 */

export const SYNC_TABLES = ["kitchens", "checkpoints", "readings", "coolingItems"] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export const MIRROR_TABLES = ["checkpoints", "readings", "coolingItems"] as const;
export type MirrorTable = (typeof MIRROR_TABLES)[number];

/** Max rows per table in one push. */
export const MAX_PUSH_ROWS = 2000;
/** How far the pull cursor (`serverTime`) lags the server clock. */
export const PULL_OVERLAP_MS = 5_000;
/** Row versions further than this ahead of the server clock are refused. */
export const MAX_CLOCK_SKEW_MS = 86_400_000;

export const IsoTimestamp = z.iso.datetime({ offset: true });

export const ROW_SCHEMAS = {
  kitchens: KitchenSchema,
  checkpoints: CheckpointSchema,
  readings: ReadingSchema,
  coolingItems: CoolingItemSchema,
} as const;

export type KitchenRow = z.infer<typeof KitchenSchema>;
export type CheckpointRow = z.infer<typeof CheckpointSchema>;
export type ReadingRow = z.infer<typeof ReadingSchema>;
export type CoolingItemRow = z.infer<typeof CoolingItemSchema>;
export type SyncTables = {
  kitchens: KitchenRow[];
  checkpoints: CheckpointRow[];
  readings: ReadingRow[];
  coolingItems: CoolingItemRow[];
};

const rows = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(MAX_PUSH_ROWS, `At most ${MAX_PUSH_ROWS} rows per table per push.`).default([]);

export const SyncPushRequestSchema = z.object({
  deviceId: z.string().min(1).max(128),
  tables: z
    .object({
      kitchens: rows(KitchenSchema),
      checkpoints: rows(CheckpointSchema),
      readings: rows(ReadingSchema),
      coolingItems: rows(CoolingItemSchema),
    })
    .default({ kitchens: [], checkpoints: [], readings: [], coolingItems: [] }),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResponse = { serverTime: string; accepted: number };
export type SyncPullResponse = { serverTime: string; tables: SyncTables };
