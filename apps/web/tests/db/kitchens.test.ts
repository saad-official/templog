import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { GET as listKitchens, POST as createKitchen } from "@/app/api/kitchens/route";
import { POST as joinKitchen } from "@/app/api/kitchens/join/route";
import { DELETE as deleteKitchen } from "@/app/api/kitchens/[id]/route";
import { DELETE as removeMember } from "@/app/api/kitchens/[id]/members/[userId]/route";
import type { DbHandle } from "@/lib/db/client";
import { checkpoints, coolingItems, kitchenMembers, readings } from "@/lib/db/schema";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  MAX_STAFF,
  generateInviteCode,
  normalizeInviteCode,
} from "@/lib/services/kitchens";
import { jsonRequest, kitchenBody, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

async function create(who: TestUser | null, body: unknown = kitchenBody()) {
  const response = await createKitchen(jsonRequest("/api/kitchens", { body, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function join(who: TestUser | null, body: unknown) {
  const response = await joinKitchen(jsonRequest("/api/kitchens/join", { body, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function list(who: TestUser | null) {
  const response = await listKitchens(jsonRequest("/api/kitchens", { cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function remove(who: TestUser | null, kitchenId: string, userId: string) {
  const response = await removeMember(
    jsonRequest(`/api/kitchens/${kitchenId}/members/${userId}`, { method: "DELETE", cookie: who?.cookie }),
    { params: Promise.resolve({ id: kitchenId, userId }) },
  );
  return { status: response.status, json: await response.json() };
}

async function destroy(who: TestUser | null, kitchenId: string) {
  const response = await deleteKitchen(jsonRequest(`/api/kitchens/${kitchenId}`, { method: "DELETE", cookie: who?.cookie }), {
    params: Promise.resolve({ id: kitchenId }),
  });
  return { status: response.status, json: await response.json() };
}

describe("invite codes", () => {
  it("are 8 characters from an alphabet without 0/O/1/I/L", () => {
    expect(INVITE_CODE_LENGTH).toBe(8);
    expect(INVITE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    }
  });

  it("are generated from the random source given", () => {
    expect(generateInviteCode(() => new Uint8Array(8))).toBe(INVITE_ALPHABET[0]!.repeat(8));
  });

  it("normalise what people type: case, spaces and dashes", () => {
    expect(normalizeInviteCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeInviteCode("ab cd 23 45")).toBe("ABCD2345");
  });
});

describe("POST /api/kitchens", () => {
  it("requires a session", async () => {
    expect((await create(null)).status).toBe(401);
  });

  it("creates the kitchen with the device's id, an invite code and the caller as owner", async () => {
    const owner = await signUpTestUser("Rosa Diaz");
    const id = crypto.randomUUID();
    const { status, json } = await create(owner, kitchenBody({ id, name: "Rosa's Tacos", displayName: "Rosa", initials: "RD" }));
    expect(status).toBe(201);
    expect(json.kitchen).toMatchObject({
      id,
      name: "Rosa's Tacos",
      tz: "America/Chicago",
      unit: "F",
      isOwner: true,
      role: "owner",
      ownerName: "Rosa Diaz",
      inviteCode: expect.stringMatching(/^[A-HJKMNP-Z2-9]{8}$/),
    });
    expect(json.kitchen.openingHours).toHaveLength(7);
    expect(json.kitchen.members).toEqual([
      { userId: owner.id, displayName: "Rosa", initials: "RD", role: "owner", joinedAt: expect.any(String) },
    ]);
  });

  it("defaults the display name to the account name and generates an id", async () => {
    const owner = await signUpTestUser("Priya Shah");
    const { json } = await create(owner);
    expect(json.kitchen.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.kitchen.members[0].displayName).toBe("Priya Shah");
  });

  it("returns the kitchen the caller already owns instead of creating a second", async () => {
    const owner = await signUpTestUser();
    const first = await create(owner);
    const second = await create(owner, kitchenBody({ name: "Another" }));
    expect(second.status).toBe(200);
    expect(second.json.kitchen.id).toBe(first.json.kitchen.id);
    expect(second.json.kitchen.inviteCode).toBe(first.json.kitchen.inviteCode);
  });

  it("refuses a kitchen id that is already taken by someone else", async () => {
    const a = await signUpTestUser();
    const b = await signUpTestUser();
    const id = crypto.randomUUID();
    await create(a, kitchenBody({ id }));
    const { status, json } = await create(b, kitchenBody({ id }));
    expect(status).toBe(409);
    expect(json.code).toBe("kitchen_id_taken");
  });

  it("validates the body: name, time zone, opening hours", async () => {
    const owner = await signUpTestUser();
    expect((await create(owner, kitchenBody({ name: "" }))).status).toBe(400);
    expect((await create(owner, kitchenBody({ tz: "Mars/Olympus" }))).status).toBe(400);
    expect((await create(owner, kitchenBody({ openingHours: [] }))).status).toBe(400);
    expect((await create(owner, kitchenBody({ id: "not-a-uuid" }))).status).toBe(400);
  });
});

describe("POST /api/kitchens/join", () => {
  it("requires a session", async () => {
    expect((await join(null, { code: "ABCD2345" })).status).toBe(401);
  });

  it("joins as staff with a code typed in any case, with dashes", async () => {
    const owner = await signUpTestUser("Owner");
    const cook = await signUpTestUser("Line Cook");
    const { json: created } = await create(owner, kitchenBody({ displayName: "Chef" }));
    const code: string = created.kitchen.inviteCode;
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;

    const { status, json } = await join(cook, { code: typed, displayName: "Sam", initials: "SR" });
    expect(status).toBe(200);
    expect(json.kitchen).toMatchObject({ id: created.kitchen.id, isOwner: false, role: "staff", inviteCode: null });
    expect(json.kitchen.members.map((m: { displayName: string; role: string }) => [m.displayName, m.role])).toEqual([
      ["Chef", "owner"],
      ["Sam", "staff"],
    ]);
  });

  it("is idempotent for someone already in the kitchen", async () => {
    const owner = await signUpTestUser();
    const cook = await signUpTestUser();
    const { json: created } = await create(owner);
    await join(cook, { code: created.kitchen.inviteCode });
    expect((await join(cook, { code: created.kitchen.inviteCode })).status).toBe(200);
    const rows = await handle.db.select().from(kitchenMembers).where(eq(kitchenMembers.kitchenId, created.kitchen.id));
    expect(rows).toHaveLength(2);
  });

  it("404s an unknown code and 400s a malformed one", async () => {
    const cook = await signUpTestUser();
    const unknown = await join(cook, { code: "ZZZZ9999" });
    expect(unknown.status).toBe(404);
    expect(unknown.json.code).toBe("kitchen_not_found");
    expect((await join(cook, { code: "short" })).status).toBe(400);
    expect((await join(cook, {})).status).toBe(400);
  });

  it("refuses to join your own kitchen as staff", async () => {
    const owner = await signUpTestUser();
    const { json: created } = await create(owner);
    const { status, json } = await join(owner, { code: created.kitchen.inviteCode });
    expect(status).toBe(409);
    expect(json.code).toBe("own_kitchen");
  });

  it(`caps a kitchen at ${MAX_STAFF} staff`, async () => {
    const owner = await signUpTestUser();
    const { json: created } = await create(owner);
    const people = await Promise.all(Array.from({ length: MAX_STAFF }, () => signUpTestUser()));
    for (const person of people) {
      await handle.db
        .insert(kitchenMembers)
        .values({ kitchenId: created.kitchen.id, userId: person.id, role: "staff", displayName: "Cook" });
    }
    const late = await signUpTestUser();
    const { status, json } = await join(late, { code: created.kitchen.inviteCode });
    expect(status).toBe(409);
    expect(json.code).toBe("kitchen_full");
  }, 60_000);
});

describe("GET /api/kitchens", () => {
  it("requires a session", async () => {
    expect((await list(null)).status).toBe(401);
  });

  it("lists the kitchen I own and the ones I work in, with members", async () => {
    const me = await signUpTestUser("Me");
    const other = await signUpTestUser("Other owner");
    const stranger = await signUpTestUser("Stranger");
    const { json: mine } = await create(me);
    const { json: theirs } = await create(other);
    await create(stranger);
    await join(me, { code: theirs.kitchen.inviteCode, displayName: "Weekend cook" });

    const { status, json } = await list(me);
    expect(status).toBe(200);
    const byId = new Map(json.kitchens.map((k: { id: string }) => [k.id, k]));
    expect([...byId.keys()].sort()).toEqual([mine.kitchen.id, theirs.kitchen.id].sort());
    expect(byId.get(mine.kitchen.id)).toMatchObject({ isOwner: true, inviteCode: mine.kitchen.inviteCode });
    expect(byId.get(theirs.kitchen.id)).toMatchObject({ isOwner: false, role: "staff", inviteCode: null, ownerName: "Other owner" });
  });

  it("returns an empty list for someone with no kitchen", async () => {
    const loner = await signUpTestUser();
    expect((await list(loner)).json).toEqual({ kitchens: [] });
  });
});

describe("DELETE /api/kitchens/:id/members/:userId", () => {
  async function kitchenWithStaff(count: number) {
    const owner = await signUpTestUser("Owner");
    const { json } = await create(owner);
    const staff: TestUser[] = [];
    for (let i = 0; i < count; i += 1) {
      const cook = await signUpTestUser(`Cook ${i}`);
      await join(cook, { code: json.kitchen.inviteCode });
      staff.push(cook);
    }
    return { owner, kitchenId: json.kitchen.id as string, staff };
  }

  it("requires a session", async () => {
    const { kitchenId, staff } = await kitchenWithStaff(1);
    expect((await remove(null, kitchenId, staff[0]!.id)).status).toBe(401);
  });

  it("lets the owner remove staff", async () => {
    const { owner, kitchenId, staff } = await kitchenWithStaff(1);
    const { status, json } = await remove(owner, kitchenId, staff[0]!.id);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect((await list(staff[0]!)).json.kitchens).toEqual([]);
  });

  it("lets staff leave", async () => {
    const { kitchenId, staff } = await kitchenWithStaff(1);
    expect((await remove(staff[0]!, kitchenId, staff[0]!.id)).status).toBe(200);
    expect((await list(staff[0]!)).json.kitchens).toEqual([]);
  });

  it("does not let staff remove someone else", async () => {
    const { kitchenId, staff } = await kitchenWithStaff(2);
    expect((await remove(staff[0]!, kitchenId, staff[1]!.id)).status).toBe(403);
    expect((await list(staff[1]!)).json.kitchens).toHaveLength(1);
  });

  it("does not remove the owner", async () => {
    const { owner, kitchenId, staff } = await kitchenWithStaff(1);
    expect((await remove(owner, kitchenId, owner.id)).json.code).toBe("owner_cannot_leave");
    expect((await remove(staff[0]!, kitchenId, owner.id)).status).toBe(403);
  });

  it("404s a kitchen the caller is not in, without revealing it", async () => {
    const { kitchenId, staff } = await kitchenWithStaff(1);
    const outsider = await signUpTestUser();
    const { status, json } = await remove(outsider, kitchenId, staff[0]!.id);
    expect(status).toBe(404);
    expect(json.code).toBe("kitchen_not_found");
  });

  it("404s someone who is not a member", async () => {
    const { owner, kitchenId } = await kitchenWithStaff(0);
    const outsider = await signUpTestUser();
    expect((await remove(owner, kitchenId, outsider.id)).json.code).toBe("member_not_found");
  });
});

describe("DELETE /api/kitchens/:id", () => {
  it("requires a session", async () => {
    const owner = await signUpTestUser();
    const { json } = await create(owner);
    expect((await destroy(null, json.kitchen.id)).status).toBe(401);
  });

  it("lets the owner delete the kitchen with its memberships and every mirrored row", async () => {
    const owner = await signUpTestUser("Owner");
    const cook = await signUpTestUser("Cook");
    const { json } = await create(owner);
    const kitchenId: string = json.kitchen.id;
    await join(cook, { code: json.kitchen.inviteCode });
    const now = new Date();
    const base = { kitchenId, createdAt: now, updatedAt: now };
    await handle.db.insert(checkpoints).values({
      ...base,
      id: crypto.randomUUID(),
      name: "Walk-in",
      kind: "cold-holding",
      limits: { max: 41 },
      cadence: { kind: "every", hours: 4 },
    });
    await handle.db.insert(readings).values({
      ...base,
      id: crypto.randomUUID(),
      checkpointId: crypto.randomUUID(),
      takenAt: now,
      valueF: 38,
      result: "pass",
      initials: "RD",
      source: "manual",
    });
    await handle.db.insert(coolingItems).values({ ...base, id: crypto.randomUUID(), name: "Chili", startedAt: now, status: "cooling" });

    const { status, json: body } = await destroy(owner, kitchenId);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect((await list(owner)).json.kitchens).toEqual([]);
    expect((await list(cook)).json.kitchens).toEqual([]);
    for (const table of [checkpoints, readings, coolingItems]) {
      expect(await handle.db.select().from(table).where(eq(table.kitchenId, kitchenId))).toEqual([]);
    }
  });

  it("is forbidden for staff and a 404 for outsiders", async () => {
    const owner = await signUpTestUser();
    const cook = await signUpTestUser();
    const outsider = await signUpTestUser();
    const { json } = await create(owner);
    await join(cook, { code: json.kitchen.inviteCode });
    expect((await destroy(cook, json.kitchen.id)).status).toBe(403);
    expect((await destroy(outsider, json.kitchen.id)).status).toBe(404);
    expect((await list(owner)).json.kitchens).toHaveLength(1);
  });
});
