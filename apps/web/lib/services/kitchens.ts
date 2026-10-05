import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { IdSchema, InitialsSchema, OpeningHoursSchema, TimeZoneSchema, UnitSchema } from "@templog/shared/schemas";
import { ApiError } from "@/app/api/_lib/respond";
import type { Db } from "@/lib/db/client";
import { kitchenMembers, kitchens, user, type KitchenRole } from "@/lib/db/schema";

/**
 * Shared kitchens. The owner creates one (one per account) and shares the
 * invite code; people who join are staff. Everyone in the kitchen syncs and
 * logs readings; only the owner manages the team and deletes the kitchen.
 * Rules:
 * - create is idempotent: a second call returns the kitchen already owned;
 * - join normalises the code, refuses your own kitchen, caps staff, and is
 *   idempotent for someone already in;
 * - the owner removes anyone but themselves; staff can only leave;
 * - a kitchen the caller is not in is a 404, so ids are never confirmed.
 */

/** No 0/O, 1/I/L: codes get read aloud across a kitchen and typed from a screen. 31 symbols, ~39.6 bits. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;
export const MAX_STAFF = 25;
const MAX_CODE_ATTEMPTS = 5;
/** Largest multiple of the alphabet size below 256: bytes at or above it are redrawn (no modulo bias). */
const UNBIASED_LIMIT = 256 - (256 % INVITE_ALPHABET.length);

export type RandomBytes = (length: number) => Uint8Array;
const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function generateInviteCode(random: RandomBytes = cryptoBytes): string {
  let code = "";
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of random(INVITE_CODE_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Upper-cases and drops spaces and dashes ("abcd-2345" -> "ABCD2345"). */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

const displayName = z.string().trim().min(1).max(80);

export const createKitchenSchema = z.object({
  /** The device's local kitchen id, so rows it already holds keep their kitchenId. */
  id: IdSchema.optional(),
  name: z.string().trim().min(1).max(80),
  tz: TimeZoneSchema,
  unit: UnitSchema.default("F"),
  openingHours: OpeningHoursSchema,
  displayName: displayName.optional(),
  initials: InitialsSchema.optional(),
});

export const joinKitchenSchema = z.object({
  code: z
    .string()
    .max(32)
    .transform(normalizeInviteCode)
    .pipe(z.string().length(INVITE_CODE_LENGTH).regex(new RegExp(`^[${INVITE_ALPHABET}]+$`), "Not an invite code.")),
  displayName: displayName.optional(),
  initials: InitialsSchema.optional(),
});

export type KitchenMemberView = {
  userId: string;
  displayName: string;
  initials: string | null;
  role: KitchenRole;
  joinedAt: string;
};
export type KitchenView = {
  id: string;
  name: string;
  tz: string;
  unit: "F" | "C";
  openingHours: KitchenRow["openingHours"];
  /** The owner's account name (Better Auth `user.name`), whoever is asking. */
  ownerName: string;
  isOwner: boolean;
  role: KitchenRole;
  /** Only the owner sees (and shares) the code. */
  inviteCode: string | null;
  createdAt: string;
  members: KitchenMemberView[];
};

export type KitchenRow = typeof kitchens.$inferSelect;

async function membersOf(db: Db, kitchenIds: string[]): Promise<Map<string, KitchenMemberView[]>> {
  const out = new Map<string, KitchenMemberView[]>();
  if (kitchenIds.length === 0) return out;
  const rows = await db
    .select()
    .from(kitchenMembers)
    .where(inArray(kitchenMembers.kitchenId, kitchenIds))
    .orderBy(asc(kitchenMembers.role), asc(kitchenMembers.joinedAt), asc(kitchenMembers.userId));
  for (const row of rows) {
    const list = out.get(row.kitchenId) ?? [];
    list.push({
      userId: row.userId,
      displayName: row.displayName,
      initials: row.initials,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
    });
    out.set(row.kitchenId, list);
  }
  return out;
}

/** Account names (Better Auth `user.name`) by user id. */
export async function accountNames(db: Db, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [...new Set(userIds)]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

function toView(kitchen: KitchenRow, viewerId: string, members: KitchenMemberView[], ownerName: string): KitchenView {
  const isOwner = kitchen.ownerUserId === viewerId;
  const role = members.find((m) => m.userId === viewerId)?.role ?? (isOwner ? "owner" : "staff");
  return {
    id: kitchen.id,
    name: kitchen.name,
    tz: kitchen.tz,
    unit: kitchen.unit,
    openingHours: kitchen.openingHours,
    ownerName,
    isOwner,
    role,
    inviteCode: isOwner ? kitchen.inviteCode : null,
    createdAt: kitchen.createdAt.toISOString(),
    members,
  };
}

async function viewOf(db: Db, kitchen: KitchenRow, viewerId: string): Promise<KitchenView> {
  const [members, names] = await Promise.all([membersOf(db, [kitchen.id]), accountNames(db, [kitchen.ownerUserId])]);
  return toView(kitchen, viewerId, members.get(kitchen.id) ?? [], names.get(kitchen.ownerUserId) ?? "");
}

export async function findOwnedKitchen(db: Db, userId: string): Promise<KitchenRow | undefined> {
  const [row] = await db.select().from(kitchens).where(eq(kitchens.ownerUserId, userId));
  return row;
}

export type SessionPerson = { id: string; name: string };

/** Creates the caller's kitchen, or returns the one they already own (`created: false`). */
export async function createKitchen(
  db: Db,
  owner: SessionPerson,
  input: z.infer<typeof createKitchenSchema>,
  random: RandomBytes = cryptoBytes,
): Promise<{ kitchen: KitchenView; created: boolean }> {
  const existing = await findOwnedKitchen(db, owner.id);
  if (existing) return { kitchen: await viewOf(db, existing, owner.id), created: false };

  if (input.id) {
    const [taken] = await db.select({ id: kitchens.id }).from(kitchens).where(eq(kitchens.id, input.id));
    if (taken) throw new ApiError(409, "That kitchen id is already in use.", "kitchen_id_taken");
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const inserted = await db.transaction(async (tx) => {
      const [kitchen] = await tx
        .insert(kitchens)
        .values({
          ...(input.id ? { id: input.id } : {}),
          ownerUserId: owner.id,
          name: input.name,
          tz: input.tz,
          unit: input.unit,
          openingHours: input.openingHours,
          inviteCode: generateInviteCode(random),
        })
        .onConflictDoNothing()
        .returning();
      if (!kitchen) return undefined;
      await tx.insert(kitchenMembers).values({
        kitchenId: kitchen.id,
        userId: owner.id,
        role: "owner",
        displayName: input.displayName ?? owner.name,
        initials: input.initials ?? null,
      });
      return kitchen;
    });
    if (inserted) return { kitchen: await viewOf(db, inserted, owner.id), created: true };
    // Conflict: a concurrent request created this owner's kitchen, the id raced, or the code was taken.
    const raced = await findOwnedKitchen(db, owner.id);
    if (raced) return { kitchen: await viewOf(db, raced, owner.id), created: false };
    if (input.id) {
      const [taken] = await db.select({ id: kitchens.id }).from(kitchens).where(eq(kitchens.id, input.id));
      if (taken) throw new ApiError(409, "That kitchen id is already in use.", "kitchen_id_taken");
    }
  }
  throw new Error("Could not allocate a unique invite code.");
}

export async function joinKitchen(db: Db, person: SessionPerson, input: z.infer<typeof joinKitchenSchema>): Promise<KitchenView> {
  const [kitchen] = await db.select().from(kitchens).where(eq(kitchens.inviteCode, input.code));
  if (!kitchen) throw new ApiError(404, "No kitchen has that code.", "kitchen_not_found");
  if (kitchen.ownerUserId === person.id) {
    throw new ApiError(409, "This is your own kitchen. Share the code with your staff instead.", "own_kitchen");
  }
  const [already] = await db
    .select()
    .from(kitchenMembers)
    .where(and(eq(kitchenMembers.kitchenId, kitchen.id), eq(kitchenMembers.userId, person.id)));
  if (!already) {
    const [{ staff } = { staff: 0 }] = await db
      .select({ staff: count() })
      .from(kitchenMembers)
      .where(and(eq(kitchenMembers.kitchenId, kitchen.id), eq(kitchenMembers.role, "staff")));
    if (staff >= MAX_STAFF) {
      throw new ApiError(409, `A kitchen can have up to ${MAX_STAFF} staff.`, "kitchen_full");
    }
    await db
      .insert(kitchenMembers)
      .values({
        kitchenId: kitchen.id,
        userId: person.id,
        role: "staff",
        displayName: input.displayName ?? person.name,
        initials: input.initials ?? null,
      })
      .onConflictDoNothing();
  }
  return viewOf(db, kitchen, person.id);
}

/** Every kitchen the user is in (owned or staff), with members. */
export async function listKitchens(db: Db, userId: string): Promise<KitchenView[]> {
  const rows = await db
    .select({ kitchen: kitchens })
    .from(kitchenMembers)
    .innerJoin(kitchens, eq(kitchens.id, kitchenMembers.kitchenId))
    .where(eq(kitchenMembers.userId, userId))
    .orderBy(asc(kitchenMembers.joinedAt));
  const ids = rows.map((row) => row.kitchen.id);
  const [members, names] = await Promise.all([
    membersOf(db, ids),
    accountNames(
      db,
      rows.map((row) => row.kitchen.ownerUserId),
    ),
  ]);
  return rows.map(({ kitchen }) => toView(kitchen, userId, members.get(kitchen.id) ?? [], names.get(kitchen.ownerUserId) ?? ""));
}

/** Ids of every kitchen the user is a member of. */
export async function memberKitchenIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ id: kitchenMembers.kitchenId }).from(kitchenMembers).where(eq(kitchenMembers.userId, userId));
  return rows.map((row) => row.id);
}

/**
 * The caller's membership of `kitchenId`, or a 404 `kitchen_not_found` (also
 * for kitchens that exist but the caller is not in).
 */
export async function requireMembership(db: Db, kitchenId: string, userId: string) {
  const [row] = await db
    .select({ kitchen: kitchens, role: kitchenMembers.role })
    .from(kitchenMembers)
    .innerJoin(kitchens, eq(kitchens.id, kitchenMembers.kitchenId))
    .where(and(eq(kitchenMembers.kitchenId, kitchenId), eq(kitchenMembers.userId, userId)));
  if (!row) throw new ApiError(404, "Kitchen not found.", "kitchen_not_found");
  return row;
}

export async function removeMember(db: Db, actorId: string, kitchenId: string, targetUserId: string): Promise<void> {
  const { kitchen } = await requireMembership(db, kitchenId, actorId);
  const isOwner = kitchen.ownerUserId === actorId;
  if (!isOwner && targetUserId !== actorId) {
    throw new ApiError(403, "Only the kitchen owner can remove other people.", "forbidden");
  }
  if (targetUserId === kitchen.ownerUserId) {
    if (!isOwner) throw new ApiError(403, "Only the kitchen owner can remove other people.", "forbidden");
    throw new ApiError(409, "The owner cannot leave their own kitchen. Delete it instead.", "owner_cannot_leave");
  }
  const removed = await db
    .delete(kitchenMembers)
    .where(and(eq(kitchenMembers.kitchenId, kitchenId), eq(kitchenMembers.userId, targetUserId)))
    .returning({ userId: kitchenMembers.userId });
  if (removed.length === 0) throw new ApiError(404, "That person is not in this kitchen.", "member_not_found");
}

/**
 * The owner stops sharing: the kitchen, its memberships and every checkpoint,
 * reading and cooling item synced for it are deleted (foreign keys cascade).
 * The data on each phone is untouched.
 */
export async function deleteKitchen(db: Db, actorId: string, kitchenId: string): Promise<void> {
  const { kitchen } = await requireMembership(db, kitchenId, actorId);
  if (kitchen.ownerUserId !== actorId) {
    throw new ApiError(403, "Only the kitchen owner can delete the kitchen.", "forbidden");
  }
  await db.delete(kitchens).where(eq(kitchens.id, kitchen.id));
}
