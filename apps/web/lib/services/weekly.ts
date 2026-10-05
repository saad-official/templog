import "server-only";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { ExpoPushMessage } from "expo-server-sdk";
import { weeklyCompliance } from "@templog/shared/compliance";
import { expandChecks } from "@templog/shared/schedule";
import type { Checkpoint, Kitchen, Reading } from "@templog/shared/schemas";
import { addDaysToKey, dayKeyOf, zonedMidnight } from "@templog/shared/tz";
import type { Db } from "@/lib/db/client";
import { checkpoints, coolingItems, devices, kitchens, readings } from "@/lib/db/schema";
import { pruneDeadTokens, type PushSender } from "./push";
import { columnsToWire, kitchenToWire } from "./sync";

/**
 * The Monday owner summary: last week's compliance for each shared kitchen,
 * pushed to the owner's phones. Week = the seven local days before today on
 * kitchen time. Rate and missed checks come from the shared compliance code
 * (`weeklyCompliance` over `expandChecks`), so the number matches the app.
 */

export type WeeklySummary = {
  scheduled: number;
  logged: number;
  /** logged / scheduled; null when nothing was scheduled. */
  rate: number | null;
  failedReadings: number;
  failedCooling: number;
  mostMissed: { name: string; missed: number } | null;
};

export type WeeklyResult = { kitchens: number; notified: number; skipped: number; errors: number };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Plain words an owner can read on a Lock Screen. */
export function summaryMessage(kitchenName: string, summary: WeeklySummary): { title: string; body: string } {
  const pct = Math.round((summary.rate ?? 0) * 100);
  const parts = [`${pct}% of checks logged (${summary.logged} of ${summary.scheduled}).`];
  const fails = [
    summary.failedReadings > 0 ? plural(summary.failedReadings, "failed reading") : null,
    summary.failedCooling > 0 ? plural(summary.failedCooling, "failed cool-down") : null,
  ].filter(Boolean);
  parts.push(fails.length > 0 ? `${fails.join(", ")}.` : "No fails.");
  parts.push(summary.mostMissed ? `Most missed: ${summary.mostMissed.name} (${summary.mostMissed.missed}).` : "Nothing missed.");
  return { title: `${kitchenName}: last week`, body: parts.join(" ") };
}

/** Pure: the summary for one kitchen's week from its mirrored rows. */
export function computeWeeklySummary(input: {
  kitchen: Kitchen;
  checkpoints: Checkpoint[];
  readings: Reading[];
  failedCooling: number;
  weekStart: string;
}): WeeklySummary {
  const { kitchen, weekStart } = input;
  const live = input.checkpoints.filter((c) => !c.deletedAt);
  const perCheckpoint = live.map((checkpoint) => {
    const checks = expandChecks(checkpoint, kitchen, weekStart, 7);
    const week = weeklyCompliance(checks, input.readings, weekStart, kitchen.tz);
    return { name: checkpoint.name, scheduled: week.scheduled, logged: week.logged, failed: week.failed };
  });
  const scheduled = perCheckpoint.reduce((n, c) => n + c.scheduled, 0);
  const logged = perCheckpoint.reduce((n, c) => n + c.logged, 0);
  const start = zonedMidnight(weekStart, kitchen.tz);
  const end = zonedMidnight(addDaysToKey(weekStart, 7), kitchen.tz);
  const failedReadings = input.readings.filter((r) => {
    const t = Date.parse(r.takenAt);
    return !r.deletedAt && r.result === "fail" && t >= start && t < end;
  }).length;
  const worst = perCheckpoint
    .map((c) => ({ name: c.name, missed: c.scheduled - c.logged }))
    .filter((c) => c.missed > 0)
    .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name))[0];
  return {
    scheduled,
    logged,
    rate: scheduled > 0 ? logged / scheduled : null,
    failedReadings,
    failedCooling: input.failedCooling,
    mostMissed: worst ?? null,
  };
}

/** The first local day of the week to summarise at `now` (seven days before today on kitchen time). */
export function summaryWeekStart(now: Date, timeZone: string): string {
  return addDaysToKey(dayKeyOf(now.toISOString(), timeZone), -7);
}

export async function sendWeeklySummaries(db: Db, now: Date, send: PushSender): Promise<WeeklyResult> {
  const all = await db.select().from(kitchens);
  const result: WeeklyResult = { kitchens: 0, notified: 0, skipped: 0, errors: 0 };

  for (const kitchen of all) {
    const weekStart = summaryWeekStart(now, kitchen.tz);
    if (kitchen.lastSummaryWeek === weekStart) continue;
    result.kitchens += 1;
    try {
      const start = new Date(zonedMidnight(weekStart, kitchen.tz));
      const end = new Date(zonedMidnight(addDaysToKey(weekStart, 7), kitchen.tz));
      const [checkpointRows, readingRows, cooling, owned] = await Promise.all([
        db.select().from(checkpoints).where(and(eq(checkpoints.kitchenId, kitchen.id), isNull(checkpoints.deletedAt))),
        db
          .select()
          .from(readings)
          .where(
            and(
              eq(readings.kitchenId, kitchen.id),
              isNull(readings.deletedAt),
              // A day of slack each side: early logs and overnight windows answer checks across midnight.
              gte(readings.takenAt, new Date(start.getTime() - 86_400_000)),
              lt(readings.takenAt, new Date(end.getTime() + 86_400_000)),
            ),
          ),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(coolingItems)
          .where(
            and(
              eq(coolingItems.kitchenId, kitchen.id),
              isNull(coolingItems.deletedAt),
              eq(coolingItems.status, "failed"),
              or(
                and(gte(coolingItems.failedAt, start), lt(coolingItems.failedAt, end)),
                and(isNull(coolingItems.failedAt), gte(coolingItems.startedAt, start), lt(coolingItems.startedAt, end)),
              ),
            ),
          ),
        db.select().from(devices).where(inArray(devices.userId, [kitchen.ownerUserId])),
      ]);

      const summary = computeWeeklySummary({
        kitchen: kitchenToWire(kitchen, kitchen.ownerUserId) as Kitchen,
        checkpoints: checkpointRows.map((row) => columnsToWire("checkpoints", row) as unknown as Checkpoint),
        readings: readingRows.map((row) => columnsToWire("readings", row) as unknown as Reading),
        failedCooling: cooling[0]?.n ?? 0,
        weekStart,
      });

      if (summary.scheduled > 0 && owned.length > 0) {
        const { title, body } = summaryMessage(kitchen.name, summary);
        const messages: ExpoPushMessage[] = owned.map((device) => ({
          to: device.expoPushToken,
          title,
          body,
          sound: "default",
          data: { type: "weekly-summary", kitchenId: kitchen.id, weekStart, url: "templog://history" },
        }));
        const tickets = await send(messages);
        await pruneDeadTokens(db, messages, tickets);
        result.notified += tickets.filter((ticket) => ticket.status === "ok").length;
      } else {
        result.skipped += 1;
      }
      await db.update(kitchens).set({ lastSummaryWeek: weekStart }).where(eq(kitchens.id, kitchen.id));
    } catch (error) {
      result.errors += 1;
      console.error("[cron] weekly summary failed", kitchen.id, error instanceof Error ? error.message : error);
    }
  }
  return result;
}
