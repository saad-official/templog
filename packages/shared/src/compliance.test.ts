import { checkpointStats, dailyCompliance, fullyLoggedStreak, weeklyCompliance } from "./compliance";
import { CP_FRIDGE, CP_HOT, makeCheckpoint, makeKitchen, makeReading, plusMin, TZ } from "./fixtures.test-util";
import { type Check, expandChecks } from "./schedule";
import type { Reading } from "./schemas";

const kitchen = makeKitchen();
const fridge = makeCheckpoint();
const hot = makeCheckpoint({ id: CP_HOT, name: "Hot well", kind: "hot-holding", limits: { min: 135 }, cadence: { kind: "times", times: ["12:00"] } });
const checksFor = (from: string, days: number) => [...expandChecks(fridge, kitchen, from, days), ...expandChecks(hot, kitchen, from, days)];
const log = (c: Check, minutesLate = 5, extra: Partial<Reading> = {}) =>
  makeReading(plusMin(c.scheduledFor, minutesLate), { checkpointId: c.checkpointId, scheduledFor: c.scheduledFor, ...extra });
const fail = { result: "fail" as const, valueF: 45, failReason: "above 41 °F", correctiveAction: { kind: "discard" as const } };

const DAY = "2026-10-05";
const checks = checksFor(DAY, 1); // fridge 11,15,19,23Z + hot 16Z
const fridgeChecks = checks.filter((c) => c.checkpointId === CP_FRIDGE);
const [f1, f2, f3, f4] = fridgeChecks as [Check, Check, Check, Check];
const h1 = checks.find((c) => c.checkpointId === CP_HOT) as Check;

describe("dailyCompliance", () => {
  it("counts scheduled, logged, on-time and failed for a day", () => {
    const readings = [log(f1), log(f2, 45), log(f3, 5, fail), log(h1)];
    expect(dailyCompliance(checks, readings, DAY, TZ)).toEqual({ scheduled: 5, logged: 4, onTime: 3, failed: 1, rate: 0.8 });
  });
  it("is null-rated on a day with nothing scheduled", () => {
    expect(dailyCompliance(checks, [], "2026-10-06", TZ)).toEqual({ scheduled: 0, logged: 0, onTime: 0, failed: 0, rate: null });
  });
  it("counts failed ad-hoc readings taken that local day", () => {
    const adhoc = makeReading("2026-10-05T20:00:00.000Z", fail);
    const nextDay = makeReading("2026-10-06T05:00:00.000Z", fail); // 01:00 local on the 6th
    expect(dailyCompliance(checks, [adhoc, nextDay], DAY, TZ).failed).toBe(1);
  });
  it("counts a re-checked failure once per failing reading and the check once", () => {
    const readings = [log(f1, 5, fail), log(f1, 20)];
    expect(dailyCompliance(checks, readings, DAY, TZ)).toMatchObject({ logged: 1, failed: 1 });
  });
  it("ignores deleted readings and cooling readings", () => {
    const readings = [log(f1, 5, { deletedAt: f2.scheduledFor }), makeReading(f1.scheduledFor, { ...fail, checkpointId: null, coolingItemId: CP_FRIDGE })];
    expect(dailyCompliance(checks, readings, DAY, TZ)).toMatchObject({ logged: 0, failed: 0 });
  });
  it("leaves out checks not yet due when now is given", () => {
    const now = plusMin(f2.scheduledFor, 10); // f2 still within grace
    expect(dailyCompliance(checks, [log(f1)], DAY, TZ, { now })).toMatchObject({ scheduled: 1, logged: 1, rate: 1 });
    expect(dailyCompliance(checks, [log(f1), log(f2, 2)], DAY, TZ, { now })).toMatchObject({ scheduled: 2, logged: 2 });
  });
  it("honours a custom grace period for on-time", () => {
    expect(dailyCompliance(checks, [log(f1, 20)], DAY, TZ, { graceMinutes: 10 }).onTime).toBe(0);
  });
});

describe("weeklyCompliance", () => {
  const week = checksFor("2026-10-05", 7);
  it("rolls up seven days from the start key", () => {
    const monday = week.filter((c) => c.dayKey === "2026-10-05");
    const out = weeklyCompliance(week, monday.map((c) => log(c)), "2026-10-05", TZ);
    expect(out.days).toHaveLength(7);
    expect(out.days[0]).toMatchObject({ dayKey: "2026-10-05", scheduled: 5, logged: 5, rate: 1 });
    expect(out.days[6]?.dayKey).toBe("2026-10-11");
    expect(out).toMatchObject({ scheduled: 35, logged: 5, onTime: 5, failed: 0 });
    expect(out.rate).toBeCloseTo(5 / 35);
  });
  it("is null-rated with nothing scheduled", () => {
    expect(weeklyCompliance([], [], "2026-10-05", TZ).rate).toBeNull();
  });
});

describe("checkpointStats", () => {
  const now = "2026-10-07T20:00:00.000Z";
  const readings = [
    makeReading("2026-10-07T15:00:00.000Z", { valueF: 36 }),
    makeReading("2026-10-06T15:00:00.000Z", { valueF: 40 }),
    makeReading("2026-10-05T15:00:00.000Z", { ...fail, valueF: 44.5 }),
    makeReading("2026-10-01T15:00:00.000Z", { valueF: 30 }), // outside 3 days
    makeReading("2026-10-07T16:00:00.000Z", { checkpointId: CP_HOT, valueF: 150 }),
    makeReading("2026-10-07T17:00:00.000Z", { valueF: 10, deletedAt: now }),
  ];
  it("summarises the last N local days", () => {
    const s = checkpointStats(readings, CP_FRIDGE, 3, now, TZ);
    expect(s).toMatchObject({ count: 3, min: 36, max: 44.5, avg: 40.2, fails: 1 });
  });
  it("returns sparkline points oldest first", () => {
    const s = checkpointStats(readings, CP_FRIDGE, 3, now, TZ);
    expect(s.points).toEqual([
      { takenAt: "2026-10-05T15:00:00.000Z", valueF: 44.5, result: "fail" },
      { takenAt: "2026-10-06T15:00:00.000Z", valueF: 40, result: "pass" },
      { takenAt: "2026-10-07T15:00:00.000Z", valueF: 36, result: "pass" },
    ]);
  });
  it("has null aggregates with no readings", () => {
    expect(checkpointStats([], CP_FRIDGE, 7, now, TZ)).toEqual({ count: 0, min: null, max: null, avg: null, fails: 0, points: [] });
  });
});

describe("fullyLoggedStreak", () => {
  const span = checksFor("2026-10-01", 7); // Oct 1–7
  const logDays = (days: string[]) => span.filter((c) => days.includes(c.dayKey)).map((c) => log(c));
  it("counts consecutive fully logged days ending today", () => {
    expect(fullyLoggedStreak(span, logDays(["2026-10-05", "2026-10-06", "2026-10-07"]), "2026-10-07", TZ)).toBe(3);
  });
  it("does not let an incomplete today break the streak", () => {
    expect(fullyLoggedStreak(span, logDays(["2026-10-04", "2026-10-05", "2026-10-06"]), "2026-10-07", TZ)).toBe(3);
  });
  it("stops at a day with a missing check", () => {
    const readings = logDays(["2026-10-03", "2026-10-04", "2026-10-06"]);
    expect(fullyLoggedStreak(span, readings, "2026-10-07", TZ)).toBe(1);
  });
  it("skips closed days without breaking or counting them", () => {
    const k = makeKitchen({ openingHours: [null, ...Array(6).fill({ open: "07:00", close: "23:00" })] });
    const withClosed = expandChecks(fridge, k, "2026-10-01", 7); // Oct 4 is a Sunday
    const readings = withClosed.filter((c) => c.dayKey >= "2026-10-03").map((c) => log(c));
    expect(fullyLoggedStreak(withClosed, readings, "2026-10-07", TZ)).toBe(4);
  });
  it("is 0 with no checks", () => {
    expect(fullyLoggedStreak([], [], "2026-10-07", TZ)).toBe(0);
  });
});
