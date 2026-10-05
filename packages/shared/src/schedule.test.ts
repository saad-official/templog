import { CP_FRIDGE, CP_HOT, makeCheckpoint, makeKitchen, makeReading, plusMin } from "./fixtures.test-util";
import { uuidV7Timestamp } from "./ids";
import { type Check, checkForReading, checkIdFor, classifyChecks, dueChecks, expandChecks, missedChecks, nextCheck } from "./schedule";

const CREATED_LATE = "2026-06-01T00:00:00.000Z";
const kitchen = makeKitchen();
const every4 = makeCheckpoint();
const times = makeCheckpoint({ cadence: { kind: "times", times: ["09:00", "15:00"] } });
const sched = (checks: Check[]) => checks.map((c) => c.scheduledFor);

describe("checkIdFor", () => {
  it("is a deterministic UUIDv7 stamped with scheduledFor", () => {
    const at = "2026-10-05T11:00:00.000Z";
    expect(checkIdFor(CP_FRIDGE, at)).toBe(checkIdFor(CP_FRIDGE, Date.parse(at)));
    expect(uuidV7Timestamp(checkIdFor(CP_FRIDGE, at))).toBe(Date.parse(at));
  });
  it("differs per checkpoint and per instant", () => {
    const at = "2026-10-05T11:00:00.000Z";
    expect(checkIdFor(CP_FRIDGE, at)).not.toBe(checkIdFor(CP_HOT, at));
    expect(checkIdFor(CP_FRIDGE, at)).not.toBe(checkIdFor(CP_FRIDGE, "2026-10-05T15:00:00.000Z"));
  });
});

describe("expandChecks — every N hours", () => {
  it("steps from opening time and stops before closing", () => {
    // 2026-10-05 is EDT (UTC-4): 07, 11, 15, 19 local; 23:00 is closing time, excluded.
    expect(sched(expandChecks(every4, kitchen, "2026-10-05", 1))).toEqual([
      "2026-10-05T11:00:00.000Z",
      "2026-10-05T15:00:00.000Z",
      "2026-10-05T19:00:00.000Z",
      "2026-10-05T23:00:00.000Z",
    ]);
  });
  it("fills in check fields", () => {
    const [c] = expandChecks(every4, kitchen, "2026-10-05", 1);
    expect(c).toEqual({
      id: checkIdFor(CP_FRIDGE, "2026-10-05T11:00:00.000Z"),
      checkpointId: CP_FRIDGE,
      kitchenId: kitchen.id,
      scheduledFor: "2026-10-05T11:00:00.000Z",
      dayKey: "2026-10-05",
    });
  });
  it("supports fractional hours", () => {
    const k = makeKitchen({ openingHours: Array(7).fill({ open: "11:00", close: "13:00" }) });
    const out = expandChecks(makeCheckpoint({ cadence: { kind: "every", hours: 1.5 } }), k, "2026-10-05", 1);
    expect(out.map((c) => c.scheduledFor)).toEqual(["2026-10-05T15:00:00.000Z", "2026-10-05T16:30:00.000Z"]);
  });
  it("skips closed days", () => {
    const k = makeKitchen({ openingHours: [null, ...Array(6).fill({ open: "07:00", close: "23:00" })] });
    // 2026-10-04 is a Sunday.
    expect(expandChecks(every4, k, "2026-10-04", 1)).toEqual([]);
    expect(expandChecks(every4, k, "2026-10-04", 2)).toHaveLength(4);
  });
  it("keeps wall-clock times across spring-forward", () => {
    // 2026-03-08: clocks jump 02:00 → 03:00 EDT. 07:00 EDT = 11:00Z.
    expect(sched(expandChecks(every4, kitchen, "2026-03-08", 1))[0]).toBe("2026-03-08T11:00:00.000Z");
    expect(sched(expandChecks(every4, kitchen, "2026-03-07", 1))[0]).toBe("2026-03-07T12:00:00.000Z");
  });
  it("runs past midnight for late kitchens and shifts a gap time forward", () => {
    const k = makeKitchen({ openingHours: Array(7).fill({ open: "22:00", close: "04:00" }) });
    const cp = makeCheckpoint({ cadence: { kind: "every", hours: 2 } });
    const out = expandChecks(cp, k, "2026-03-07", 1);
    // 22:00 EST, 00:00 EST, 02:00 (gap) → 03:00 EDT.
    expect(sched(out)).toEqual(["2026-03-08T03:00:00.000Z", "2026-03-08T05:00:00.000Z", "2026-03-08T07:00:00.000Z"]);
    expect(out.map((c) => c.dayKey)).toEqual(["2026-03-07", "2026-03-08", "2026-03-08"]);
  });
  it("treats open == close as open around the clock", () => {
    const k = makeKitchen({ openingHours: Array(7).fill({ open: "00:00", close: "00:00" }) });
    expect(expandChecks(makeCheckpoint({ cadence: { kind: "every", hours: 6 } }), k, "2026-10-05", 1)).toHaveLength(4);
  });
  it("yields 24 distinct wall-clock checks on the 25-hour fall-back day", () => {
    const k = makeKitchen({ openingHours: Array(7).fill({ open: "00:00", close: "00:00" }) });
    const out = expandChecks(makeCheckpoint({ cadence: { kind: "every", hours: 1 } }), k, "2026-11-01", 1);
    expect(out).toHaveLength(24);
    expect(new Set(out.map((c) => c.id)).size).toBe(24);
  });
});

describe("expandChecks — fixed times", () => {
  it("emits each time on open days", () => {
    expect(sched(expandChecks(times, kitchen, "2026-10-05", 2))).toEqual([
      "2026-10-05T13:00:00.000Z",
      "2026-10-05T19:00:00.000Z",
      "2026-10-06T13:00:00.000Z",
      "2026-10-06T19:00:00.000Z",
    ]);
  });
  it("keeps 09:00 local across the fall-back change", () => {
    expect(sched(expandChecks(times, kitchen, "2026-10-31", 2))).toEqual([
      "2026-10-31T13:00:00.000Z",
      "2026-10-31T19:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-01T20:00:00.000Z",
    ]);
  });
  it("uses the first occurrence of a repeated fall-back time", () => {
    const cp = makeCheckpoint({ cadence: { kind: "times", times: ["01:30"] } });
    const k = makeKitchen({ openingHours: Array(7).fill({ open: "00:00", close: "00:00" }) });
    expect(sched(expandChecks(cp, k, "2026-11-01", 1))).toEqual(["2026-11-01T05:30:00.000Z"]);
  });
  it("sorts times regardless of input order", () => {
    const cp = makeCheckpoint({ cadence: { kind: "times", times: ["15:00", "09:00"] } });
    expect(sched(expandChecks(cp, kitchen, "2026-10-05", 1))).toEqual(["2026-10-05T13:00:00.000Z", "2026-10-05T19:00:00.000Z"]);
  });
  it("skips closed days", () => {
    const k = makeKitchen({ openingHours: [null, null, null, null, null, null, null] });
    expect(expandChecks(times, k, "2026-10-05", 7)).toEqual([]);
  });
});

describe("expandChecks — lifecycle", () => {
  it("drops checks scheduled before the checkpoint was created", () => {
    const cp = makeCheckpoint({ createdAt: "2026-10-05T16:00:00.000Z" });
    expect(sched(expandChecks(cp, kitchen, "2026-10-05", 1))).toEqual(["2026-10-05T19:00:00.000Z", "2026-10-05T23:00:00.000Z"]);
  });
  it("keeps checks before archivedAt and drops later ones", () => {
    const cp = makeCheckpoint({ archivedAt: "2026-10-05T16:00:00.000Z" });
    expect(sched(expandChecks(cp, kitchen, "2026-10-05", 2))).toEqual(["2026-10-05T11:00:00.000Z", "2026-10-05T15:00:00.000Z"]);
  });
  it("expands nothing for a deleted checkpoint or non-positive days", () => {
    expect(expandChecks(makeCheckpoint({ deletedAt: CREATED_LATE }), kitchen, "2026-10-05", 1)).toEqual([]);
    expect(expandChecks(every4, kitchen, "2026-10-05", 0)).toEqual([]);
  });
  it("is idempotent", () => {
    expect(expandChecks(every4, kitchen, "2026-10-05", 3)).toEqual(expandChecks(every4, kitchen, "2026-10-05", 3));
  });
});

// Checks at 11:00Z, 15:00Z, 19:00Z, 23:00Z on 2026-10-05.
const day = expandChecks(every4, kitchen, "2026-10-05", 1);
const [c1, c2, c3, c4] = day as [Check, Check, Check, Check];
const logged = (c: Check, minutesLate = 5, extra = {}) =>
  makeReading(plusMin(c.scheduledFor, minutesLate), { scheduledFor: c.scheduledFor, ...extra });

describe("classifyChecks", () => {
  it("marks upcoming, due, overdue and missed checks", () => {
    const now = plusMin(c2.scheduledFor, 45); // 15:45Z: c1 superseded by c2, c2 past grace
    const states = classifyChecks(day, [], now).map((e) => e.state);
    expect(states).toEqual(["missed", "overdue", "upcoming", "upcoming"]);
  });
  it("is due from scheduledFor through the grace period", () => {
    expect(classifyChecks([c1], [], c1.scheduledFor)[0]?.state).toBe("due");
    expect(classifyChecks([c1], [], plusMin(c1.scheduledFor, 30))[0]?.state).toBe("due");
    expect(classifyChecks([c1], [], plusMin(c1.scheduledFor, 31))[0]?.state).toBe("overdue");
  });
  it("honours a custom grace period", () => {
    expect(classifyChecks([c1], [], plusMin(c1.scheduledFor, 20), 10)[0]?.state).toBe("overdue");
  });
  it("marks the last check missed after missedAfterMinutes", () => {
    expect(classifyChecks([c4], [], plusMin(c4.scheduledFor, 239))[0]?.state).toBe("overdue");
    expect(classifyChecks([c4], [], plusMin(c4.scheduledFor, 240))[0]?.state).toBe("missed");
    expect(classifyChecks([c4], [], plusMin(c4.scheduledFor, 90), 30, 60)[0]?.state).toBe("missed");
  });
  it("marks logged checks with the answering reading and on-time flag", () => {
    const r = logged(c1, 10);
    const [e] = classifyChecks([c1], [r], plusMin(c1.scheduledFor, 600));
    expect(e).toMatchObject({ state: "logged", onTime: true });
    expect(e?.reading?.id).toBe(r.id);
  });
  it("flags late and early logging as not on time", () => {
    expect(classifyChecks([c1], [logged(c1, 31)], c4.scheduledFor)[0]?.onTime).toBe(false);
    expect(classifyChecks([c1], [logged(c1, -31)], c4.scheduledFor)[0]?.onTime).toBe(false);
    expect(classifyChecks([c1], [logged(c1, -30)], c4.scheduledFor)[0]?.onTime).toBe(true);
  });
  it("uses the latest reading when a check was re-checked", () => {
    const first = logged(c1, 5, { result: "fail", valueF: 45, correctiveAction: { kind: "move" } });
    const recheck = logged(c1, 20);
    const [e] = classifyChecks([c1], [recheck, first], c4.scheduledFor);
    expect(e?.reading?.id).toBe(recheck.id);
    expect(e?.readings.map((r) => r.id)).toEqual([first.id, recheck.id]);
  });
  it("ignores deleted readings, other checkpoints and ad-hoc readings", () => {
    const now = plusMin(c1.scheduledFor, 45);
    const readings = [
      logged(c1, 5, { deletedAt: now }),
      logged(c1, 5, { checkpointId: CP_HOT }),
      makeReading(plusMin(c1.scheduledFor, 5)),
    ];
    expect(classifyChecks([c1], readings, now)[0]?.state).toBe("overdue");
  });
  it("matches scheduledFor by instant, not string", () => {
    const r = logged(c1, 5, { scheduledFor: "2026-10-05T07:00:00-04:00" });
    expect(classifyChecks([c1], [r], c2.scheduledFor)[0]?.state).toBe("logged");
  });
  it("orders entries by scheduledFor", () => {
    expect(classifyChecks([c3, c1, c2], [], c1.scheduledFor).map((e) => e.check.id)).toEqual([c1.id, c2.id, c3.id]);
  });
});

describe("dueChecks", () => {
  it("groups checks by state", () => {
    const now = plusMin(c2.scheduledFor, 10);
    const out = dueChecks(day, [logged(c1)], now);
    expect(out.logged.map((c) => c.id)).toEqual([c1.id]);
    expect(out.due.map((c) => c.id)).toEqual([c2.id]);
    expect(out.upcoming.map((c) => c.id)).toEqual([c3.id, c4.id]);
    expect(out.overdue).toEqual([]);
    expect(out.missed).toEqual([]);
  });
  it("lists missed checks explicitly", () => {
    const out = dueChecks(day, [], plusMin(c3.scheduledFor, 1));
    expect(out.missed.map((c) => c.id)).toEqual([c1.id, c2.id]);
    expect(out.due.map((c) => c.id)).toEqual([c3.id]);
  });
});

describe("nextCheck", () => {
  it("returns the earliest due or overdue check first", () => {
    const n = nextCheck(day, [logged(c1)], plusMin(c2.scheduledFor, 40));
    expect(n).toEqual({ check: c2, state: "overdue", minutesUntil: -40 });
  });
  it("returns the next upcoming check when nothing is open", () => {
    expect(nextCheck(day, [logged(c1)], plusMin(c1.scheduledFor, 60))).toEqual({ check: c2, state: "upcoming", minutesUntil: 180 });
  });
  it("skips missed checks", () => {
    expect(nextCheck(day, [], plusMin(c3.scheduledFor, 5))?.check.id).toBe(c3.id);
  });
  it("is null when everything is logged or missed", () => {
    expect(nextCheck(day, day.map((c) => logged(c)), c4.scheduledFor)).toBeNull();
    expect(nextCheck([], [], c1.scheduledFor)).toBeNull();
  });
});

describe("checkForReading", () => {
  it("answers the open check of that checkpoint", () => {
    expect(checkForReading(day, [], CP_FRIDGE, plusMin(c2.scheduledFor, 50))?.id).toBe(c2.id);
  });
  it("answers an upcoming check within the grace period before it", () => {
    expect(checkForReading(day, [], CP_FRIDGE, plusMin(c2.scheduledFor, -20))?.id).toBe(c2.id);
  });
  it("prefers the check it is on time for over an older open one", () => {
    expect(checkForReading(day, [], CP_FRIDGE, plusMin(c2.scheduledFor, -5))?.id).toBe(c2.id);
  });
  it("is null when the check is already logged, missed, or for another checkpoint", () => {
    expect(checkForReading(day, [logged(c2)], CP_FRIDGE, plusMin(c2.scheduledFor, 10))).toBeNull();
    expect(checkForReading([c1], [], CP_FRIDGE, plusMin(c1.scheduledFor, 240))).toBeNull();
    expect(checkForReading(day, [], CP_HOT, c2.scheduledFor)).toBeNull();
  });
});

describe("missedChecks", () => {
  it("returns only the missed checks", () => {
    expect(missedChecks(day, [logged(c1)], plusMin(c4.scheduledFor, 1)).map((c) => c.id)).toEqual([c2.id, c3.id]);
  });
});
