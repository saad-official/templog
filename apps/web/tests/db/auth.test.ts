import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { isApiError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { GET as health } from "@/app/api/health/route";
import { AUTH_COOKIE_PREFIX, getAuth, trustedOrigins } from "@/lib/auth/server";
import type { DbHandle } from "@/lib/db/client";
import { account, checkpoints, devices, kitchenMembers, kitchens, user } from "@/lib/db/schema";
import { createTestKitchen, joinTestKitchen, jsonRequest, signUpTestUser, startTestDb, stopTestDb } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

describe("Better Auth on PGlite", () => {
  it("signs up with email + password into the templog schema with a hashed password", async () => {
    const created = await signUpTestUser("Ana Ortiz");
    const [stored] = await handle.db.select().from(user).where(eq(user.id, created.id));
    expect(stored).toMatchObject({ name: "Ana Ortiz", email: created.email, emailVerified: false });
    const [credential] = await handle.db.select().from(account).where(eq(account.userId, created.id));
    expect(credential?.providerId).toBe("credential");
    expect(credential?.password).not.toContain("correct horse");
  });

  it("issues session cookies with the templog prefix", async () => {
    const created = await signUpTestUser();
    expect(AUTH_COOKIE_PREFIX).toBe("templog");
    expect(created.cookie).toContain("templog.session_token=");
  });

  it("deleting the owner's account removes their kitchen, its mirrored rows and their devices", async () => {
    const owner = await signUpTestUser("Leaving");
    const cook = await signUpTestUser("Staying");
    const kitchen = await createTestKitchen(owner);
    await joinTestKitchen(cook, kitchen.inviteCode);
    const now = new Date();
    await handle.db.insert(checkpoints).values({
      id: crypto.randomUUID(),
      kitchenId: kitchen.id,
      name: "Walk-in",
      kind: "cold-holding",
      limits: { max: 41 },
      cadence: { kind: "every", hours: 4 },
      createdAt: now,
      updatedAt: now,
    });
    await handle.db.insert(devices).values({ userId: owner.id, expoPushToken: "ExponentPushToken[leaving]", platform: "ios" });

    const auth = await getAuth();
    await auth.api.deleteUser({ body: { password: "correct horse battery" }, headers: new Headers({ cookie: owner.cookie }) });

    expect(await handle.db.select().from(user).where(eq(user.id, owner.id))).toEqual([]);
    expect(await handle.db.select().from(kitchens).where(eq(kitchens.id, kitchen.id))).toEqual([]);
    expect(await handle.db.select().from(kitchenMembers).where(eq(kitchenMembers.kitchenId, kitchen.id))).toEqual([]);
    expect(await handle.db.select().from(checkpoints).where(eq(checkpoints.kitchenId, kitchen.id))).toEqual([]);
    expect(await handle.db.select().from(devices).where(eq(devices.userId, owner.id))).toEqual([]);
  });

  it("deleting a staff account removes only their membership", async () => {
    const owner = await signUpTestUser();
    const cook = await signUpTestUser();
    const kitchen = await createTestKitchen(owner);
    await joinTestKitchen(cook, kitchen.inviteCode);
    const auth = await getAuth();
    await auth.api.deleteUser({ body: { password: "correct horse battery" }, headers: new Headers({ cookie: cook.cookie }) });
    const members = await handle.db.select().from(kitchenMembers).where(eq(kitchenMembers.kitchenId, kitchen.id));
    expect(members.map((m) => m.userId)).toEqual([owner.id]);
  });

  it("trusts the templog:// app scheme and localhost:3800", () => {
    const origins = trustedOrigins();
    expect(origins).toContain("templog://");
    expect(origins).toContain("http://localhost:3800");
  });
});

describe("requireUser", () => {
  it("returns the session user for a valid session cookie", async () => {
    const created = await signUpTestUser();
    const sessionUser = await requireUser(jsonRequest("/api/kitchens", { cookie: created.cookie }));
    expect(sessionUser.id).toBe(created.id);
  });

  it("throws a 401 ApiError without a session", async () => {
    const error = await requireUser(jsonRequest("/api/kitchens")).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(401);
  });

  it("throws a 401 ApiError for a forged cookie", async () => {
    const error = await requireUser(
      jsonRequest("/api/kitchens", { cookie: `${AUTH_COOKIE_PREFIX}.session_token=forged.value` }),
    ).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(401);
  });
});

describe("GET /api/health", () => {
  it("answers ok with the version and no database", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "templog", version: expect.any(String) });
  });
});
