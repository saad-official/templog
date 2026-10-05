import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";
import { SyncPullResponseSchema } from "@templog/shared/schemas";
import { GET as pull } from "@/app/api/sync/pull/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { checkpoints, kitchens, readings } from "@/lib/db/schema";
import { pickWinner, rowVersion } from "@/lib/sync/merge";
import {
  ALL_WEEK,
  createTestKitchen,
  joinTestKitchen,
  jsonRequest,
  signUpTestUser,
  startTestDb,
  stopTestDb,
  type TestUser,
} from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

const T1 = "2026-10-05T12:00:00.000Z";
const T2 = "2026-10-05T13:00:00.000Z";
const T3 = "2026-10-05T14:00:00.000Z";

function checkpoint(kitchenId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    kitchenId,
    name: "Walk-in cooler",
    kind: "cold-holding",
    limits: { max: 41 },
    cadence: { kind: "every", hours: 4 },
    sortOrder: 0,
    archivedAt: null,
    createdAt: T1,
    updatedAt: T1,
    deletedAt: null,
    ...overrides,
  };
}

function reading(kitchenId: string, checkpointId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    kitchenId,
    checkpointId,
    coolingItemId: null,
    scheduledFor: null,
    takenAt: T1,
    valueF: 38.5,
    result: "pass",
    failReason: null,
    correctiveAction: null,
    initials: "RD",
    source: "manual",
    createdAt: T1,
    updatedAt: T1,
    deletedAt: null,
    ...overrides,
  };
}

function coolingItem(kitchenId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    kitchenId,
    name: "Chili",
    startedAt: T1,
    startValueF: 165,
    status: "cooling",
    createdAt: T1,
    updatedAt: T1,
    deletedAt: null,
    ...overrides,
  };
}

async function pushAs(who: TestUser | null, tables: Record<string, unknown[]>) {
  const response = await push(jsonRequest("/api/sync/push", { body: { deviceId: "device-1", tables }, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function pullAs(who: TestUser | null, query = "") {
  const response = await pull(jsonRequest(`/api/sync/pull${query}`, { cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function sharedKitchen() {
  const owner = await signUpTestUser("Owner");
  const cook = await signUpTestUser("Cook");
  const kitchen = await createTestKitchen(owner);
  await joinTestKitchen(cook, kitchen.inviteCode);
  return { owner, cook, kitchenId: kitchen.id };
}

describe("merge rules", () => {
  it("a row's version is the later of updatedAt and deletedAt", () => {
    expect(rowVersion({ updatedAt: T1, deletedAt: T2 })).toBe(Date.parse(T2));
    expect(rowVersion({ updatedAt: T3, deletedAt: T2 })).toBe(Date.parse(T3));
    expect(rowVersion({ updatedAt: T1 })).toBe(Date.parse(T1));
  });

  it("last write wins, a newer delete beats an older edit, ties go to the incoming row", () => {
    const stored: { updatedAt: string; deletedAt: string | null; tag: string } = { updatedAt: T2, deletedAt: null, tag: "stored" };
    expect(pickWinner(stored, { updatedAt: T3, deletedAt: null, tag: "in" }).tag).toBe("in");
    expect(pickWinner(stored, { updatedAt: T1, deletedAt: null, tag: "in" }).tag).toBe("stored");
    expect(pickWinner(stored, { updatedAt: T1, deletedAt: T3, tag: "in" }).tag).toBe("in");
    expect(pickWinner(stored, { updatedAt: T2, deletedAt: null, tag: "in" }).tag).toBe("in");
  });
});

describe("POST /api/sync/push", () => {
  it("requires a session", async () => {
    expect((await pushAs(null, {})).status).toBe(401);
  });

  it("stores rows for a kitchen the caller is in, staff included", async () => {
    const { cook, kitchenId } = await sharedKitchen();
    const cp = checkpoint(kitchenId);
    const { status, json } = await pushAs(cook, {
      checkpoints: [cp],
      readings: [reading(kitchenId, cp.id)],
      coolingItems: [coolingItem(kitchenId)],
    });
    expect(status).toBe(200);
    expect(json).toEqual({ serverTime: expect.any(String), accepted: 3 });
    const [stored] = await handle.db.select().from(checkpoints).where(eq(checkpoints.id, cp.id));
    expect(stored).toMatchObject({ kitchenId, name: "Walk-in cooler", limits: { max: 41 }, cadence: { kind: "every", hours: 4 } });
  });

  it("refuses the whole push when any row targets a kitchen the caller is not in", async () => {
    const { kitchenId } = await sharedKitchen();
    const outsider = await signUpTestUser("Outsider");
    const own = await createTestKitchen(outsider);
    const cp = checkpoint(kitchenId);
    const { status, json } = await pushAs(outsider, { checkpoints: [checkpoint(own.id), cp] });
    expect(status).toBe(403);
    expect(json.code).toBe("not_a_member");
    expect(await handle.db.select().from(checkpoints).where(eq(checkpoints.id, cp.id))).toEqual([]);
  });

  it("refuses rows for kitchens that do not exist", async () => {
    const loner = await signUpTestUser();
    expect((await pushAs(loner, { checkpoints: [checkpoint(crypto.randomUUID())] })).status).toBe(403);
  });

  it("validates rows against the shared schemas", async () => {
    const { owner, kitchenId } = await sharedKitchen();
    const cp = checkpoint(kitchenId);
    // A failed reading needs a corrective action.
    const bad = reading(kitchenId, cp.id, { result: "fail", valueF: 52 });
    expect((await pushAs(owner, { readings: [bad] })).status).toBe(400);
    expect((await pushAs(owner, { checkpoints: [{ ...cp, id: "nope" }] })).status).toBe(400);
  });

  it("keeps the newer row: older edits lose, newer edits and deletes win", async () => {
    const { owner, cook, kitchenId } = await sharedKitchen();
    const cp = checkpoint(kitchenId, { updatedAt: T2 });
    await pushAs(owner, { checkpoints: [cp] });

    const older = await pushAs(cook, { checkpoints: [{ ...cp, name: "Older", updatedAt: T1 }] });
    expect(older.json.accepted).toBe(0);
    const newer = await pushAs(cook, { checkpoints: [{ ...cp, name: "Reach-in", updatedAt: T3 }] });
    expect(newer.json.accepted).toBe(1);
    let [stored] = await handle.db.select().from(checkpoints).where(eq(checkpoints.id, cp.id));
    expect(stored!.name).toBe("Reach-in");

    const later = new Date(Date.parse(T3) + 60_000).toISOString();
    await pushAs(owner, { checkpoints: [{ ...cp, name: "Reach-in", updatedAt: T3, deletedAt: later }] });
    [stored] = await handle.db.select().from(checkpoints).where(eq(checkpoints.id, cp.id));
    expect(stored!.deletedAt?.toISOString()).toBe(later);
  });

  it("ignores rows stamped more than a day in the future", async () => {
    const { owner, kitchenId } = await sharedKitchen();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const { json } = await pushAs(owner, { checkpoints: [checkpoint(kitchenId, { updatedAt: future })] });
    expect(json.accepted).toBe(0);
  });

  it("applies the owner's kitchen settings last-write-wins and ignores staff kitchen rows", async () => {
    const { owner, cook, kitchenId } = await sharedKitchen();
    const [before] = await handle.db.select().from(kitchens).where(eq(kitchens.id, kitchenId));
    const row = {
      id: kitchenId,
      name: "Renamed by owner",
      tz: "America/Toronto",
      unit: "C",
      openingHours: ALL_WEEK,
      createdAt: before!.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    expect((await pushAs(cook, { kitchens: [{ ...row, name: "Renamed by staff" }] })).json.accepted).toBe(0);
    expect((await pushAs(owner, { kitchens: [row] })).json.accepted).toBe(1);
    const [after] = await handle.db.select().from(kitchens).where(eq(kitchens.id, kitchenId));
    expect(after).toMatchObject({ name: "Renamed by owner", tz: "America/Toronto", unit: "C", inviteCode: before!.inviteCode });
    const stale = { ...row, name: "Stale", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect((await pushAs(owner, { kitchens: [stale] })).json.accepted).toBe(0);
  });

  it("keeps two kitchens' rows apart even when a client reuses an id", async () => {
    const a = await sharedKitchen();
    const b = await sharedKitchen();
    const id = crypto.randomUUID();
    await pushAs(a.owner, { checkpoints: [checkpoint(a.kitchenId, { id, name: "A" })] });
    await pushAs(b.owner, { checkpoints: [checkpoint(b.kitchenId, { id, name: "B", updatedAt: T3 })] });
    const [rowA] = await handle.db
      .select()
      .from(checkpoints)
      .where(and(eq(checkpoints.kitchenId, a.kitchenId), eq(checkpoints.id, id)));
    expect(rowA!.name).toBe("A");
  });
});

describe("GET /api/sync/pull", () => {
  it("requires a session", async () => {
    expect((await pullAs(null)).status).toBe(401);
  });

  it("returns every member's rows for my kitchens, in the shared wire shape", async () => {
    const { owner, cook, kitchenId } = await sharedKitchen();
    const cp = checkpoint(kitchenId);
    const failed = reading(kitchenId, cp.id, {
      result: "fail",
      valueF: 47.2,
      failReason: "Above 41 °F",
      correctiveAction: { kind: "move", note: "Moved to reach-in" },
    });
    await pushAs(cook, { checkpoints: [cp], readings: [failed], coolingItems: [coolingItem(kitchenId)] });

    const { status, json } = await pullAs(owner, `?kitchenId=${kitchenId}`);
    expect(status).toBe(200);
    expect(SyncPullResponseSchema.safeParse(json).success).toBe(true);
    expect(json.tables.checkpoints).toEqual([cp]);
    expect(json.tables.readings[0]).toMatchObject({ id: failed.id, valueF: 47.2, correctiveAction: { kind: "move" } });
    expect(json.tables.coolingItems).toHaveLength(1);
    expect(json.tables.kitchens).toEqual([expect.objectContaining({ id: kitchenId, ownerUserId: owner.id, joinCode: expect.any(String) })]);
  });

  it("shows the join code to the owner only", async () => {
    const { cook, kitchenId } = await sharedKitchen();
    const { json } = await pullAs(cook, `?kitchenId=${kitchenId}`);
    expect(json.tables.kitchens[0].joinCode).toBeNull();
  });

  it("without kitchenId returns rows of every kitchen I am in, and nobody else's", async () => {
    const mine = await sharedKitchen();
    const other = await sharedKitchen();
    await pushAs(mine.owner, { checkpoints: [checkpoint(mine.kitchenId)] });
    await pushAs(other.owner, { checkpoints: [checkpoint(other.kitchenId)] });
    const { json } = await pullAs(mine.cook);
    expect(json.tables.checkpoints.map((r: { kitchenId: string }) => r.kitchenId)).toEqual([mine.kitchenId]);
  });

  it("404s a kitchen the caller is not in", async () => {
    const { kitchenId } = await sharedKitchen();
    const outsider = await signUpTestUser();
    const { status, json } = await pullAs(outsider, `?kitchenId=${kitchenId}`);
    expect(status).toBe(404);
    expect(json.code).toBe("kitchen_not_found");
  });

  it("returns only rows written after `since`, tombstones included", async () => {
    const { owner, kitchenId } = await sharedKitchen();
    const cp = checkpoint(kitchenId);
    await pushAs(owner, { checkpoints: [cp] });
    const first = await pullAs(owner, `?kitchenId=${kitchenId}`);
    // Move the stored row's server stamp behind the cursor, as if pulled long ago.
    await handle.db
      .update(checkpoints)
      .set({ serverUpdatedAt: new Date(Date.parse(first.json.serverTime) - 60_000) })
      .where(eq(checkpoints.id, cp.id));
    await handle.db.update(kitchens).set({ serverUpdatedAt: new Date(0) }).where(eq(kitchens.id, kitchenId));
    const empty = await pullAs(owner, `?kitchenId=${kitchenId}&since=${encodeURIComponent(first.json.serverTime)}`);
    expect(empty.json.tables.checkpoints).toEqual([]);

    const deletedAt = new Date().toISOString();
    await pushAs(owner, { checkpoints: [{ ...cp, deletedAt }] });
    const next = await pullAs(owner, `?kitchenId=${kitchenId}&since=${encodeURIComponent(first.json.serverTime)}`);
    expect(next.json.tables.checkpoints).toEqual([{ ...cp, deletedAt }]);
  });

  it("rejects a malformed since or kitchenId", async () => {
    const user = await signUpTestUser();
    expect((await pullAs(user, "?since=yesterday")).status).toBe(400);
    expect((await pullAs(user, "?kitchenId=nope")).status).toBe(400);
  });

  it("keeps readings for staff who leave: they are kitchen records", async () => {
    const { owner, cook, kitchenId } = await sharedKitchen();
    const cp = checkpoint(kitchenId);
    const r = reading(kitchenId, cp.id);
    await pushAs(cook, { checkpoints: [cp], readings: [r] });
    const { DELETE } = await import("@/app/api/kitchens/[id]/members/[userId]/route");
    await DELETE(jsonRequest(`/api/kitchens/${kitchenId}/members/${cook.id}`, { method: "DELETE", cookie: cook.cookie }), {
      params: Promise.resolve({ id: kitchenId, userId: cook.id }),
    });
    expect((await pullAs(cook, `?kitchenId=${kitchenId}`)).status).toBe(404);
    expect(await handle.db.select().from(readings).where(eq(readings.id, r.id))).toHaveLength(1);
    expect((await pullAs(owner, `?kitchenId=${kitchenId}`)).json.tables.readings).toHaveLength(1);
  });
});

describe("schema drift guard", () => {
  it("has a column for every field of the shared row schemas", async () => {
    const { getTableColumns } = await import("drizzle-orm");
    const { CheckpointSchema, CoolingItemSchema, ReadingSchema } = await import("@templog/shared/schemas");
    const { coolingItems } = await import("@/lib/db/schema");
    const pairs = [
      [CheckpointSchema.shape, checkpoints],
      [ReadingSchema.shape, readings],
      [CoolingItemSchema.shape, coolingItems],
    ] as const;
    for (const [shape, table] of pairs) {
      const columns = Object.keys(getTableColumns(table));
      expect(Object.keys(shape).filter((key) => !columns.includes(key))).toEqual([]);
    }
  });
});
