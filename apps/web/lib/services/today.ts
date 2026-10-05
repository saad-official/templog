import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { nextCoolingPrompt } from "@templog/shared/cooling";
import { classifyChecks, expandChecks, nextCheck, type CheckState } from "@templog/shared/schedule";
import type { Checkpoint, CoolingItem, CorrectiveAction, Kitchen, Reading } from "@templog/shared/schemas";
import { addDaysToKey, dayKeyOf, zonedMidnight } from "@templog/shared/tz";
import type { Db } from "@/lib/db/client";
import { checkpoints, coolingItems, readings } from "@/lib/db/schema";
import { requireMembership } from "./kitchens";
import { columnsToWire, kitchenToWire } from "./sync";

export const todayQuerySchema = z.object({
  date: z.iso.date().optional(),
});

export type CheckCounts = Record<CheckState, number>;

export type TodayCheckpoint = {
  id: string;
  name: string;
  kind: string;
  limits: Checkpoint["limits"];
  sortOrder: number;
  latestReading: {
    id: string;
    valueF: number;
    result: "pass" | "fail";
    takenAt: string;
    initials: string;
    correctiveAction: CorrectiveAction | null;
  } | null;
  /** The check to act on (earliest due/overdue, else the next upcoming), or null. */
  next: { scheduledFor: string; state: "due" | "overdue" | "upcoming"; minutesUntil: number } | null;
  checks: CheckCounts;
};

export type TodayCooling = {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  stage: "stage1" | "stage2";
  dueAt: string;
  /** Negative once the stage deadline has passed. */
  minutesLeft: number;
  initials: string | null;
};

export type TodayView = {
  kitchenId: string;
  name: string;
  tz: string;
  unit: "F" | "C";
  /** Local calendar day (YYYY-MM-DD) in the kitchen's zone. */
  date: string;
  generatedAt: string;
  counts: CheckCounts & { failsToday: number };
  checkpoints: TodayCheckpoint[];
  openCooling: TodayCooling[];
};

const emptyCounts = (): CheckCounts => ({ upcoming: 0, due: 0, overdue: 0, missed: 0, logged: 0 });
const DAY_MS = 86_400_000;

/**
 * The kitchen at a glance for the owner and staff: every live checkpoint with
 * its latest reading and the check to act on, the day's due/overdue/missed
 * counts and fails, and the cooling items still open. Checks come from the
 * shared schedule (packages/shared/src/schedule.ts) on kitchen time, so the
 * phone and the server agree on what is due.
 */
export async function kitchenToday(
  db: Db,
  viewerId: string,
  kitchenId: string,
  options: { date?: string },
  now = new Date(),
): Promise<TodayView> {
  const { kitchen } = await requireMembership(db, kitchenId, viewerId);
  const nowIso = now.toISOString();
  const date = options.date ?? dayKeyOf(nowIso, kitchen.tz);
  const start = zonedMidnight(date, kitchen.tz);
  const end = zonedMidnight(addDaysToKey(date, 1), kitchen.tz);
  const wireKitchen = kitchenToWire(kitchen, viewerId) as Kitchen;

  const checkpointRows = await db
    .select()
    .from(checkpoints)
    .where(and(eq(checkpoints.kitchenId, kitchenId), isNull(checkpoints.deletedAt), isNull(checkpoints.archivedAt)))
    .orderBy(asc(checkpoints.sortOrder), asc(checkpoints.name));
  const ids = checkpointRows.map((row) => row.id);

  // Readings around the day: early logs and overnight windows answer checks across midnight.
  const nearby = (
    await db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.kitchenId, kitchenId),
          isNull(readings.deletedAt),
          gte(readings.takenAt, new Date(start - DAY_MS)),
          lt(readings.takenAt, new Date(end + DAY_MS)),
        ),
      )
  ).map((row) => columnsToWire("readings", row) as unknown as Reading);

  const latest =
    ids.length === 0
      ? []
      : await db
          .selectDistinctOn([readings.checkpointId])
          .from(readings)
          .where(and(eq(readings.kitchenId, kitchenId), inArray(readings.checkpointId, ids), isNull(readings.deletedAt)))
          .orderBy(readings.checkpointId, desc(readings.takenAt));
  const latestBy = new Map(latest.map((row) => [row.checkpointId, row]));

  const counts = emptyCounts();
  const view: TodayCheckpoint[] = checkpointRows.map((row) => {
    const checkpoint = columnsToWire("checkpoints", row) as unknown as Checkpoint;
    const checks = expandChecks(checkpoint, wireKitchen, addDaysToKey(date, -1), 2).filter((c) => c.dayKey === date);
    const own = nearby.filter((r) => r.checkpointId === row.id);
    const perCheckpoint = emptyCounts();
    for (const entry of classifyChecks(checks, own, nowIso)) {
      perCheckpoint[entry.state] += 1;
      counts[entry.state] += 1;
    }
    const pick = nextCheck(checks, own, nowIso);
    const last = latestBy.get(row.id);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      limits: row.limits,
      sortOrder: row.sortOrder,
      latestReading: last
        ? {
            id: last.id,
            valueF: last.valueF,
            result: last.result as "pass" | "fail",
            takenAt: last.takenAt.toISOString(),
            initials: last.initials,
            correctiveAction: last.correctiveAction ?? null,
          }
        : null,
      next: pick ? { scheduledFor: pick.check.scheduledFor, state: pick.state, minutesUntil: pick.minutesUntil } : null,
      checks: perCheckpoint,
    };
  });

  const failsToday = nearby.filter((r) => {
    const t = Date.parse(r.takenAt);
    return r.result === "fail" && t >= start && t < end;
  }).length;

  const coolingRows = await db
    .select()
    .from(coolingItems)
    .where(
      and(
        eq(coolingItems.kitchenId, kitchenId),
        isNull(coolingItems.deletedAt),
        inArray(coolingItems.status, ["cooling", "stage1-pass"]),
      ),
    )
    .orderBy(asc(coolingItems.startedAt));
  const openCooling: TodayCooling[] = coolingRows.flatMap((row) => {
    const prompt = nextCoolingPrompt(columnsToWire("coolingItems", row) as unknown as CoolingItem, nowIso);
    if (!prompt) return [];
    return [
      {
        id: row.id,
        name: row.name,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        stage: prompt.kind,
        dueAt: prompt.dueAt,
        minutesLeft: prompt.minutesLeft,
        initials: row.initials,
      },
    ];
  });

  return {
    kitchenId,
    name: kitchen.name,
    tz: kitchen.tz,
    unit: kitchen.unit,
    date,
    generatedAt: nowIso,
    counts: { ...counts, failsToday },
    checkpoints: view,
    openCooling,
  };
}
