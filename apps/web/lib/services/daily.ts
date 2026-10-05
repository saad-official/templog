import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { getPushSender, type PushSender } from "./push";
import { sendWeeklySummaries, type WeeklyResult } from "./weekly";

export type DailyResult = { keepAlive: true; weekly: WeeklyResult | null };

/**
 * Daily cron (vercel.json, 06:00 UTC). A trivial query keeps the database
 * warm (Neon's free tier suspends idle computes). On Mondays (UTC) each
 * shared kitchen's owner gets last week's summary (lib/services/weekly.ts);
 * the per-kitchen `last_summary_week` makes a re-run harmless.
 */
export async function runDailyJob(options: { now?: Date; send?: PushSender; db?: Db } = {}): Promise<DailyResult> {
  const now = options.now ?? new Date();
  const db = options.db ?? (await getDb());
  await db.execute(sql`select 1`);
  const weekly = now.getUTCDay() === 1 ? await sendWeeklySummaries(db, now, options.send ?? getPushSender()) : null;
  return { keepAlive: true, weekly };
}
