import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as today } from "@/app/api/kitchens/[id]/today/route";
import type { DbHandle } from "@/lib/db/client";
import { checkpoints, coolingItems, readings } from "@/lib/db/schema";
import { kitchenToday } from "@/lib/services/today";
import { createTestKitchen, joinTestKitchen, jsonRequest, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

/** 12:10 in Chicago (CDT, UTC-5) on Monday 5 October 2026. */
const NOW = new Date("2026-10-05T17:10:00.000Z");
const CREATED = new Date("2026-10-01T00:00:00.000Z");
const base = { createdAt: CREATED, updatedAt: CREATED };

async function seededKitchen() {
  const owner = await signUpTestUser("Owner");
  const cook = await signUpTestUser("Cook");
  const kitchen = await createTestKitchen(owner, { name: "Rosa's Tacos", tz: "America/Chicago" });
  await joinTestKitchen(cook, kitchen.inviteCode);
  const kitchenId = kitchen.id;
  const walkIn = crypto.randomUUID();
  const hotWell = crypto.randomUUID();
  await handle.db.insert(checkpoints).values([
    { ...base, kitchenId, id: walkIn, name: "Walk-in cooler", kind: "cold-holding", limits: { max: 41 }, cadence: { kind: "every", hours: 4 }, sortOrder: 0 },
    { ...base, kitchenId, id: hotWell, name: "Hot well", kind: "hot-holding", limits: { min: 135 }, cadence: { kind: "times", times: ["12:00"] }, sortOrder: 1 },
    { ...base, kitchenId, id: crypto.randomUUID(), name: "Retired", kind: "cold-holding", limits: { max: 41 }, cadence: { kind: "every", hours: 2 }, sortOrder: 2, archivedAt: CREATED },
    { ...base, kitchenId, id: crypto.randomUUID(), name: "Deleted", kind: "cold-holding", limits: { max: 41 }, cadence: { kind: "every", hours: 2 }, sortOrder: 3, deletedAt: CREATED },
  ]);
  const passId = crypto.randomUUID();
  const failId = crypto.randomUUID();
  await handle.db.insert(readings).values([
    // Answers the 06:00 walk-in check.
    { ...base, kitchenId, id: passId, checkpointId: walkIn, scheduledFor: new Date("2026-10-05T11:00:00.000Z"), takenAt: new Date("2026-10-05T11:05:00.000Z"), valueF: 38, result: "pass", initials: "SR", source: "reminder" },
    // Ad-hoc hot-well reading that failed this morning.
    { ...base, kitchenId, id: failId, checkpointId: hotWell, takenAt: new Date("2026-10-05T16:00:00.000Z"), valueF: 128, result: "fail", failReason: "Below 135 °F", correctiveAction: { kind: "reheat" }, initials: "RD", source: "manual" },
    // Yesterday's fail does not count today.
    { ...base, kitchenId, id: crypto.randomUUID(), checkpointId: hotWell, takenAt: new Date("2026-10-04T16:00:00.000Z"), valueF: 120, result: "fail", correctiveAction: { kind: "discard" }, initials: "RD", source: "manual" },
  ]);
  const chili = crypto.randomUUID();
  await handle.db.insert(coolingItems).values([
    { ...base, kitchenId, id: chili, name: "Chili", startedAt: new Date("2026-10-05T16:30:00.000Z"), status: "cooling", initials: "RD" },
    { ...base, kitchenId, id: crypto.randomUUID(), name: "Rice", startedAt: new Date("2026-10-05T10:00:00.000Z"), status: "done" },
    { ...base, kitchenId, id: crypto.randomUUID(), name: "Gone", startedAt: new Date("2026-10-05T16:00:00.000Z"), status: "cooling", deletedAt: NOW },
  ]);
  return { owner, cook, kitchenId, walkIn, hotWell, passId, failId, chili };
}

function get(who: TestUser | null, kitchenId: string, query = "") {
  return today(jsonRequest(`/api/kitchens/${kitchenId}/today${query}`, { cookie: who?.cookie }), {
    params: Promise.resolve({ id: kitchenId }),
  });
}

describe("kitchenToday", () => {
  it("lists live checkpoints with their latest reading and next check, in sort order", async () => {
    const s = await seededKitchen();
    const view = await kitchenToday(handle.db, s.cook.id, s.kitchenId, {}, NOW);
    expect(view).toMatchObject({ kitchenId: s.kitchenId, name: "Rosa's Tacos", tz: "America/Chicago", unit: "F", date: "2026-10-05" });
    expect(view.checkpoints.map((c) => c.name)).toEqual(["Walk-in cooler", "Hot well"]);
    const [walkIn, hotWell] = view.checkpoints;
    expect(walkIn!.latestReading).toMatchObject({ id: s.passId, valueF: 38, result: "pass", initials: "SR" });
    expect(walkIn!.next).toEqual({ scheduledFor: "2026-10-05T15:00:00.000Z", state: "overdue", minutesUntil: -130 });
    expect(walkIn!.checks).toEqual({ upcoming: 2, due: 0, overdue: 1, missed: 0, logged: 1 });
    expect(hotWell!.latestReading).toMatchObject({ id: s.failId, result: "fail", correctiveAction: { kind: "reheat" } });
    expect(hotWell!.next).toEqual({ scheduledFor: "2026-10-05T17:00:00.000Z", state: "due", minutesUntil: -10 });
  });

  it("counts due, overdue and logged checks and today's fails", async () => {
    const s = await seededKitchen();
    const view = await kitchenToday(handle.db, s.owner.id, s.kitchenId, {}, NOW);
    expect(view.counts).toEqual({ upcoming: 2, due: 1, overdue: 1, missed: 0, logged: 1, failsToday: 1 });
  });

  it("lists open cooling items with the stage and minutes left", async () => {
    const s = await seededKitchen();
    const view = await kitchenToday(handle.db, s.owner.id, s.kitchenId, {}, NOW);
    expect(view.openCooling).toEqual([
      {
        id: s.chili,
        name: "Chili",
        status: "cooling",
        startedAt: "2026-10-05T16:30:00.000Z",
        stage: "stage1",
        dueAt: "2026-10-05T18:30:00.000Z",
        minutesLeft: 80,
        initials: "RD",
      },
    ]);
  });

  it("reports a past day: every unlogged check is missed", async () => {
    const s = await seededKitchen();
    const view = await kitchenToday(handle.db, s.owner.id, s.kitchenId, { date: "2026-10-04" }, NOW);
    expect(view.date).toBe("2026-10-04");
    expect(view.counts).toMatchObject({ due: 0, overdue: 0, upcoming: 0, logged: 0, missed: 5, failsToday: 1 });
  });
});

describe("GET /api/kitchens/:id/today", () => {
  it("requires a session", async () => {
    const s = await seededKitchen();
    expect((await get(null, s.kitchenId)).status).toBe(401);
  });

  it("answers members (owner and staff) without caching", async () => {
    const s = await seededKitchen();
    for (const who of [s.owner, s.cook]) {
      const response = await get(who, s.kitchenId);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const json = await response.json();
      expect(json.checkpoints).toHaveLength(2);
    }
  });

  it("404s outsiders and 400s a malformed date", async () => {
    const s = await seededKitchen();
    const outsider = await signUpTestUser();
    expect((await get(outsider, s.kitchenId)).status).toBe(404);
    expect((await get(s.owner, s.kitchenId, "?date=5-10-2026")).status).toBe(400);
  });
});
