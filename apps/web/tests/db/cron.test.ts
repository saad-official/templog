import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import type { ExpoPushMessage } from "expo-server-sdk";
import { GET as daily } from "@/app/api/cron/daily/route";
import type { DbHandle } from "@/lib/db/client";
import { checkpoints, coolingItems, devices, kitchens, readings } from "@/lib/db/schema";
import { runDailyJob } from "@/lib/services/daily";
import { setPushSenderForTests, type PushSender } from "@/lib/services/push";
import { summaryMessage } from "@/lib/services/weekly";
import { createTestKitchen, joinTestKitchen, jsonRequest, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

const SECRET = "cron-test-secret";
/** Monday 5 October 2026, 06:00 UTC (01:00 in Chicago): the summary covers Mon 28 Sep - Sun 4 Oct. */
const MONDAY = new Date("2026-10-05T06:00:00.000Z");
const TUESDAY = new Date("2026-10-06T06:00:00.000Z");
const CREATED = new Date("2026-09-01T00:00:00.000Z");
const base = { createdAt: CREATED, updatedAt: CREATED };
const WEEK = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

let handle: DbHandle;

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET;
  handle = await startTestDb();
}, 60_000);

afterEach(() => setPushSenderForTests(null));

afterAll(async () => {
  delete process.env.CRON_SECRET;
  await stopTestDb(handle);
});

function cronRequest(authorization?: string) {
  return jsonRequest("/api/cron/daily", { headers: authorization ? { authorization } : {} });
}

function recorder() {
  const sent: ExpoPushMessage[] = [];
  const send = vi.fn<PushSender>(async (messages) => {
    sent.push(...messages);
    return messages.map(() => ({ status: "ok" as const, id: "t" }));
  });
  return { sent, send };
}

let seq = 0;
async function device(who: TestUser) {
  seq += 1;
  const token = `ExponentPushToken[cron-${seq}]`;
  await handle.db.insert(devices).values({ userId: who.id, expoPushToken: token, platform: "ios" });
  return token;
}

/**
 * Chicago kitchen (CDT, UTC-5), open 06:00-22:00 daily. Walk-in every 8 h
 * (06:00, 14:00: 14 checks, all logged); hot well at 12:00 (7 checks, 4
 * logged). One failed reading and one failed cool-down during the week.
 */
async function seededKitchen(name = "Rosa's Tacos") {
  const owner = await signUpTestUser("Owner");
  const cook = await signUpTestUser("Cook");
  const kitchen = await createTestKitchen(owner, { name, tz: "America/Chicago" });
  await joinTestKitchen(cook, kitchen.inviteCode);
  const kitchenId = kitchen.id;
  const walkIn = crypto.randomUUID();
  const hotWell = crypto.randomUUID();
  await handle.db.insert(checkpoints).values([
    { ...base, kitchenId, id: walkIn, name: "Walk-in cooler", kind: "cold-holding", limits: { max: 41 }, cadence: { kind: "every", hours: 8 } },
    { ...base, kitchenId, id: hotWell, name: "Hot well", kind: "hot-holding", limits: { min: 135 }, cadence: { kind: "times", times: ["12:00"] } },
  ]);
  const rows: (typeof readings.$inferInsert)[] = [];
  const reading = (checkpointId: string, at: string, extra: Partial<typeof readings.$inferInsert> = {}) =>
    rows.push({ ...base, kitchenId, id: crypto.randomUUID(), checkpointId, scheduledFor: new Date(at), takenAt: new Date(at), valueF: 38, result: "pass", initials: "RD", source: "reminder", ...extra });
  for (const day of WEEK) {
    reading(walkIn, `${day}T11:00:00.000Z`);
    reading(walkIn, `${day}T19:00:00.000Z`);
  }
  for (const day of WEEK.slice(0, 4)) reading(hotWell, `${day}T17:00:00.000Z`);
  rows[0] = { ...rows[0]!, valueF: 47, result: "fail", correctiveAction: { kind: "move" } };
  await handle.db.insert(readings).values(rows);
  await handle.db.insert(coolingItems).values([
    { ...base, kitchenId, id: crypto.randomUUID(), name: "Chili", startedAt: new Date("2026-10-01T20:00:00.000Z"), status: "failed", failedAt: new Date("2026-10-01T22:00:00.000Z") },
  ]);
  return { owner, cook, kitchenId };
}

describe("GET /api/cron/daily", () => {
  it("rejects a missing or wrong bearer secret", async () => {
    expect((await daily(cronRequest())).status).toBe(401);
    expect((await daily(cronRequest("Bearer wrong"))).status).toBe(401);
  });

  it("rejects everything when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    try {
      expect((await daily(cronRequest("Bearer "))).status).toBe(401);
      expect((await daily(cronRequest("Bearer undefined"))).status).toBe(401);
    } finally {
      process.env.CRON_SECRET = SECRET;
    }
  });

  it("runs the keep-alive with the right secret", async () => {
    setPushSenderForTests(recorder().send);
    const response = await daily(cronRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, keepAlive: true });
  });
});

describe("summaryMessage", () => {
  it("states the rate, fails and the most-missed checkpoint plainly", () => {
    expect(
      summaryMessage("Rosa's Tacos", { scheduled: 21, logged: 18, rate: 18 / 21, failedReadings: 1, failedCooling: 1, mostMissed: { name: "Hot well", missed: 3 } }),
    ).toEqual({
      title: "Rosa's Tacos: last week",
      body: "86% of checks logged (18 of 21). 1 failed reading, 1 failed cool-down. Most missed: Hot well (3).",
    });
  });

  it("reads well for a perfect week", () => {
    expect(
      summaryMessage("Truck", { scheduled: 14, logged: 14, rate: 1, failedReadings: 0, failedCooling: 0, mostMissed: null }).body,
    ).toBe("100% of checks logged (14 of 14). No fails. Nothing missed.");
  });
});

describe("Monday owner summary", () => {
  it("pushes last week's summary to every device of the owner, and only the owner", async () => {
    const { owner, cook, kitchenId } = await seededKitchen();
    const tokens = [await device(owner), await device(owner)];
    const staffToken = await device(cook);
    const { sent, send } = recorder();

    const result = await runDailyJob({ now: MONDAY, send });

    const mine = sent.filter((m) => tokens.includes(m.to as string));
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({
      title: "Rosa's Tacos: last week",
      body: "86% of checks logged (18 of 21). 1 failed reading, 1 failed cool-down. Most missed: Hot well (3).",
      data: { type: "weekly-summary", kitchenId, weekStart: "2026-09-28" },
    });
    expect(sent.some((m) => m.to === staffToken)).toBe(false);
    expect(result.weekly).toMatchObject({ notified: expect.any(Number), errors: 0 });
    const [row] = await handle.db.select().from(kitchens).where(eq(kitchens.id, kitchenId));
    expect(row!.lastSummaryWeek).toBe("2026-09-28");
  });

  it("sends each week's summary once", async () => {
    const { owner } = await seededKitchen();
    const token = await device(owner);
    const first = recorder();
    await runDailyJob({ now: MONDAY, send: first.send });
    expect(first.sent.filter((m) => m.to === token)).toHaveLength(1);
    const second = recorder();
    await runDailyJob({ now: MONDAY, send: second.send });
    expect(second.sent.filter((m) => m.to === token)).toEqual([]);
  });

  it("does nothing on other days", async () => {
    const { owner } = await seededKitchen();
    await device(owner);
    const { sent, send } = recorder();
    const result = await runDailyJob({ now: TUESDAY, send });
    expect(result.weekly).toBeNull();
    expect(sent).toEqual([]);
  });

  it("skips a kitchen with nothing scheduled", async () => {
    const owner = await signUpTestUser();
    const kitchen = await createTestKitchen(owner, { name: "Empty kitchen" });
    const token = await device(owner);
    const { sent, send } = recorder();
    await runDailyJob({ now: MONDAY, send });
    expect(sent.filter((m) => m.to === token)).toEqual([]);
    const [row] = await handle.db.select().from(kitchens).where(eq(kitchens.id, kitchen.id));
    expect(row!.lastSummaryWeek).toBe("2026-09-28");
  });

  it("retries next run when the push fails", async () => {
    const { owner, kitchenId } = await seededKitchen("Flaky");
    const token = await device(owner);
    const failing = vi.fn<PushSender>(async () => {
      throw new Error("Expo down");
    });
    const result = await runDailyJob({ now: MONDAY, send: failing });
    expect(result.weekly!.errors).toBeGreaterThanOrEqual(1);
    const [row] = await handle.db.select().from(kitchens).where(eq(kitchens.id, kitchenId));
    expect(row!.lastSummaryWeek).toBeNull();
    const retry = recorder();
    await runDailyJob({ now: MONDAY, send: retry.send });
    expect(retry.sent.filter((m) => m.to === token)).toHaveLength(1);
  });

  it("prunes tokens Expo reports as unregistered", async () => {
    const { owner } = await seededKitchen();
    const token = await device(owner);
    const send = vi.fn<PushSender>(async (messages) =>
      messages.map((m) =>
        m.to === token
          ? { status: "error" as const, message: "gone", details: { error: "DeviceNotRegistered" as const } }
          : { status: "ok" as const, id: "t" },
      ),
    );
    await runDailyJob({ now: MONDAY, send });
    expect(await handle.db.select().from(devices).where(eq(devices.expoPushToken, token))).toEqual([]);
  });
});
