import {
  CadenceSchema,
  CHECKPOINT_KINDS,
  CheckpointSchema,
  CoolingItemSchema,
  DEFAULT_SETTINGS,
  DeviceSchema,
  JoinCodeSchema,
  KitchenMemberSchema,
  KitchenSchema,
  LimitsSchema,
  OpeningHoursSchema,
  ReadingSchema,
  SettingsSchema,
  SYNC_TABLE_NAMES,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  TimeZoneSchema,
} from "./schemas";

const ID = "0199b3a0-0000-7000-8000-000000000001";
const ID2 = "0199b3a0-0000-7000-8000-000000000002";
const ID3 = "0199b3a0-0000-7000-8000-000000000003";
const T = "2026-10-05T13:00:00.000Z";
const day = { open: "07:00", close: "22:00" };

const kitchen = {
  id: ID,
  name: "Corner Café",
  tz: "America/Toronto",
  unit: "F",
  openingHours: [null, day, day, day, day, day, day],
  createdAt: T,
  updatedAt: T,
};
const checkpoint = {
  id: ID2,
  kitchenId: ID,
  name: "Walk-in fridge",
  kind: "cold-holding",
  limits: { max: 41 },
  cadence: { kind: "every", hours: 4 },
  sortOrder: 0,
  createdAt: T,
  updatedAt: T,
};
const reading = {
  id: ID3,
  checkpointId: ID2,
  kitchenId: ID,
  scheduledFor: "2026-10-05T11:00:00.000Z",
  takenAt: "2026-10-05T11:05:00.000Z",
  valueF: 38.5,
  result: "pass",
  initials: "SK",
  source: "manual",
  createdAt: T,
  updatedAt: T,
};
const cooling = {
  id: ID3,
  kitchenId: ID,
  name: "Chili, 4 qt",
  startedAt: T,
  status: "cooling",
  createdAt: T,
  updatedAt: T,
};
const week = (d: unknown) => [d, null, null, null, null, null, null];

describe("KitchenSchema", () => {
  it("parses a kitchen", () => {
    expect(KitchenSchema.parse(kitchen).name).toBe("Corner Café");
  });
  it("rejects an unknown time zone", () => {
    expect(TimeZoneSchema.safeParse("Mars/Olympus").success).toBe(false);
    expect(KitchenSchema.safeParse({ ...kitchen, tz: "Nowhere/City" }).success).toBe(false);
  });
  it("needs opening hours for all seven weekdays", () => {
    expect(OpeningHoursSchema.safeParse([day, day]).success).toBe(false);
  });
  it("accepts a day that closes after midnight", () => {
    expect(OpeningHoursSchema.safeParse(week({ open: "17:00", close: "02:00" })).success).toBe(true);
  });
  it("rejects malformed HH:mm", () => {
    expect(OpeningHoursSchema.safeParse(week({ open: "7:00", close: "22:00" })).success).toBe(false);
  });
  it("rejects an unknown unit", () => {
    expect(KitchenSchema.safeParse({ ...kitchen, unit: "K" }).success).toBe(false);
  });
});

describe("CheckpointSchema", () => {
  it("parses every kind", () => {
    for (const kind of CHECKPOINT_KINDS) expect(CheckpointSchema.safeParse({ ...checkpoint, kind }).success).toBe(true);
    expect(CHECKPOINT_KINDS).toEqual(["cold-holding", "hot-holding", "cooking", "receiving", "freezer"]);
  });
  it("requires at least one limit and min <= max", () => {
    expect(LimitsSchema.safeParse({}).success).toBe(false);
    expect(LimitsSchema.safeParse({ min: 50, max: 40 }).success).toBe(false);
    expect(LimitsSchema.safeParse({ min: 33, max: 41 }).success).toBe(true);
  });
  it("accepts both cadence shapes", () => {
    expect(CadenceSchema.safeParse({ kind: "every", hours: 2 }).success).toBe(true);
    expect(CadenceSchema.safeParse({ kind: "times", times: ["09:00", "15:00"] }).success).toBe(true);
  });
  it("rejects bad cadences", () => {
    expect(CadenceSchema.safeParse({ kind: "every", hours: 0 }).success).toBe(false);
    expect(CadenceSchema.safeParse({ kind: "every", hours: 25 }).success).toBe(false);
    expect(CadenceSchema.safeParse({ kind: "times", times: [] }).success).toBe(false);
    expect(CadenceSchema.safeParse({ kind: "times", times: ["09:00", "09:00"] }).success).toBe(false);
  });
});

describe("ReadingSchema", () => {
  it("parses a scheduled pass", () => {
    expect(ReadingSchema.parse(reading).valueF).toBe(38.5);
  });
  it("allows ad-hoc readings with no scheduledFor", () => {
    expect(ReadingSchema.safeParse({ ...reading, scheduledFor: null }).success).toBe(true);
  });
  it("requires a corrective action on a fail", () => {
    const fail = { ...reading, valueF: 45, result: "fail", failReason: "above 41 °F" };
    expect(ReadingSchema.safeParse(fail).success).toBe(false);
    expect(ReadingSchema.safeParse({ ...fail, correctiveAction: { kind: "discard" } }).success).toBe(true);
  });
  it("requires a note for an 'other' corrective action", () => {
    const fail = { ...reading, result: "fail", correctiveAction: { kind: "other" } };
    expect(ReadingSchema.safeParse(fail).success).toBe(false);
    expect(ReadingSchema.safeParse({ ...fail, correctiveAction: { kind: "other", note: "Called manager" } }).success).toBe(true);
  });
  it("limits initials to 1-4 characters", () => {
    expect(ReadingSchema.safeParse({ ...reading, initials: "" }).success).toBe(false);
    expect(ReadingSchema.safeParse({ ...reading, initials: "ABCDE" }).success).toBe(false);
    expect(ReadingSchema.safeParse({ ...reading, initials: "JDLR" }).success).toBe(true);
  });
  it("belongs to exactly one of a checkpoint or a cooling item", () => {
    expect(ReadingSchema.safeParse({ ...reading, checkpointId: null }).success).toBe(false);
    expect(ReadingSchema.safeParse({ ...reading, checkpointId: null, coolingItemId: ID }).success).toBe(true);
    expect(ReadingSchema.safeParse({ ...reading, coolingItemId: ID }).success).toBe(false);
  });
  it("rejects a non-finite temperature", () => {
    expect(ReadingSchema.safeParse({ ...reading, valueF: Number.NaN }).success).toBe(false);
  });
});

describe("CoolingItemSchema", () => {
  it("parses a cooling item", () => {
    expect(CoolingItemSchema.parse(cooling).status).toBe("cooling");
  });
  it("rejects an unknown status", () => {
    expect(CoolingItemSchema.safeParse({ ...cooling, status: "warm" }).success).toBe(false);
  });
});

describe("SettingsSchema", () => {
  it("fills defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      onboarded: false,
      unit: "F",
      reminderLeadMinutes: 15,
      quietOutsideHours: true,
      graceMinutes: 30,
    });
    expect(SettingsSchema.parse({ unit: "C", initialsDefault: "SK" }).initialsDefault).toBe("SK");
  });
});

describe("team schemas", () => {
  it("parses a member, a device and a join code", () => {
    const member = { id: ID2, kitchenId: ID, userId: "u1", displayName: "Sam", role: "owner", joinedAt: T, createdAt: T, updatedAt: T };
    expect(KitchenMemberSchema.safeParse(member).success).toBe(true);
    expect(DeviceSchema.safeParse({ userId: "u1", expoPushToken: "ExponentPushToken[x]", platform: "ios", lastSeenAt: T }).success).toBe(true);
    expect(JoinCodeSchema.safeParse("K7M2Q9").success).toBe(true);
    expect(JoinCodeSchema.safeParse("KO1L00").success).toBe(false);
  });
});

describe("sync payloads", () => {
  it("defaults missing tables to empty arrays", () => {
    const req = SyncPushRequestSchema.parse({ deviceId: "d1" });
    expect(req.tables).toEqual({ kitchens: [], checkpoints: [], readings: [], coolingItems: [] });
  });
  it("validates rows in each table", () => {
    const ok = SyncPullResponseSchema.safeParse({
      serverTime: T,
      tables: { kitchens: [kitchen], checkpoints: [checkpoint], readings: [reading], coolingItems: [cooling] },
    });
    expect(ok.success).toBe(true);
    expect(SyncPullResponseSchema.safeParse({ serverTime: T, tables: { readings: [{ ...reading, valueF: "hot" }] } }).success).toBe(false);
    expect(SyncPushResponseSchema.parse({ serverTime: T, accepted: 3 }).accepted).toBe(3);
  });
  it("maps payload keys to SQL table names", () => {
    expect(SYNC_TABLE_NAMES).toEqual({ kitchens: "kitchens", checkpoints: "checkpoints", readings: "readings", coolingItems: "cooling_items" });
  });
});
