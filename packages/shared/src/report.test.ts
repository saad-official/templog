import { CP_FRIDGE, CP_HOT, makeCheckpoint, makeCooling, makeKitchen, makeReading, plusMin, TZ } from "./fixtures.test-util";
import { correctiveActionLabel, CSV_HEADER, dailyReportModel, rangeReportModel, toCsvRows } from "./report";
import { type Check, expandChecks } from "./schedule";
import type { Reading } from "./schemas";

const kitchen = makeKitchen();
const fridge = makeCheckpoint({ sortOrder: 1 });
const hot = makeCheckpoint({ id: CP_HOT, name: "Hot well", kind: "hot-holding", limits: { min: 135 }, cadence: { kind: "times", times: ["12:00"] }, sortOrder: 0 });
const DAY = "2026-10-05";
const [f1, f2] = expandChecks(fridge, kitchen, DAY, 1) as [Check, Check, Check, Check];
const [h1] = expandChecks(hot, kitchen, DAY, 1) as [Check];
const log = (c: Check, minutesLate: number, extra: Partial<Reading> = {}) =>
  makeReading(plusMin(c.scheduledFor, minutesLate), { checkpointId: c.checkpointId, scheduledFor: c.scheduledFor, ...extra });

const r1 = log(f1, 5, { valueF: 38 });
const r2 = log(f2, 10, { valueF: 45, result: "fail", failReason: "above 41 °F", correctiveAction: { kind: "move", note: "to reach-in 2" }, initials: "JD" });
const r2b = log(f2, 40, { valueF: 39 });
const r3 = log(h1, 50, { checkpointId: CP_HOT, valueF: 140.25 });
const cooling = makeCooling("2026-10-05T18:00:00.000Z", { name: "Chili", status: "done", initials: "SK" });
const s1 = makeReading("2026-10-05T19:30:00.000Z", { checkpointId: null, coolingItemId: cooling.id, valueF: 65 });
const s2 = makeReading("2026-10-05T22:00:00.000Z", { checkpointId: null, coolingItemId: cooling.id, valueF: 40 });
cooling.stage1ReadingId = s1.id;
cooling.stage2ReadingId = s2.id;
const readings = [r3, r2b, r1, r2, s1, s2];

const model = dailyReportModel(kitchen, [fridge, hot], readings, [cooling], DAY, TZ, "F");

describe("correctiveActionLabel", () => {
  it("labels each kind and appends the note", () => {
    expect(correctiveActionLabel({ kind: "discard" })).toBe("Discarded");
    expect(correctiveActionLabel({ kind: "reheat" })).toBe("Reheated");
    expect(correctiveActionLabel({ kind: "move", note: "to reach-in 2" })).toBe("Moved product: to reach-in 2");
    expect(correctiveActionLabel({ kind: "service" })).toBe("Called service");
    expect(correctiveActionLabel({ kind: "other", note: "Manager told" })).toBe("Other: Manager told");
    expect(correctiveActionLabel(null)).toBe("");
  });
});

describe("dailyReportModel", () => {
  it("has a header for the kitchen and day", () => {
    expect(model.header).toEqual({ kitchenName: "Corner Café", tz: TZ, unit: "F", from: DAY, to: DAY });
  });
  it("orders checkpoint sections by sortOrder", () => {
    expect(model.checkpoints.map((s) => s.name)).toEqual(["Hot well", "Walk-in fridge"]);
    expect(model.checkpoints[1]).toMatchObject({ kind: "cold-holding", kindLabel: "Cold holding", limitsLabel: "≤ 41 °F", scheduled: 4, logged: 2 });
  });
  it("lists readings in local time with value, result, initials and corrective action", () => {
    const rows = model.checkpoints[1]?.rows ?? [];
    expect(rows.map((r) => r.time)).toEqual(["07:05", "11:10", "11:40"]);
    expect(rows[1]).toMatchObject({
      readingId: r2.id,
      dayKey: DAY,
      scheduledTime: "11:00",
      value: 45,
      valueLabel: "45 °F",
      result: "fail",
      failReason: "above 41 °F",
      correctiveAction: "Moved product: to reach-in 2",
      initials: "JD",
      late: false,
    });
    expect(rows[2]?.late).toBe(true);
  });
  it("converts values to the report unit", () => {
    const c = dailyReportModel(kitchen, [fridge, hot], readings, [cooling], DAY, TZ, "C");
    expect(c.checkpoints[0]?.rows[0]).toMatchObject({ value: 60.1, valueLabel: "60.1 °C" });
    expect(c.checkpoints[1]?.limitsLabel).toBe("≤ 5 °C");
  });
  it("lists missed checks explicitly", () => {
    expect(model.checkpoints[1]?.missed.map((m) => m.time)).toEqual(["15:00", "19:00"]);
    expect(model.checkpoints[0]?.missed).toEqual([]);
  });
  it("only lists checks already past grace as missed when now is given", () => {
    const m = dailyReportModel(kitchen, [fridge, hot], readings, [cooling], DAY, TZ, "F", { now: plusMin(f2.scheduledFor, 300) });
    expect(m.checkpoints[1]?.missed.map((x) => x.time)).toEqual(["15:00"]);
  });
  it("includes a cooling section with both stages", () => {
    expect(model.cooling).toEqual([
      {
        coolingItemId: cooling.id,
        name: "Chili",
        startedTime: "14:00",
        stage1: { time: "15:30", value: 65, valueLabel: "65 °F", limitLabel: "≤ 70 °F within 2 h", result: "pass" },
        stage2: { time: "18:00", value: 40, valueLabel: "40 °F", limitLabel: "≤ 41 °F within 6 h", result: "pass" },
        status: "done",
        statusLabel: "Cooled",
        failReason: null,
        correctiveAction: "",
        initials: "SK",
      },
    ]);
  });
  it("labels open and failed cooling items without a countdown", () => {
    const open = makeCooling("2026-10-05T18:00:00.000Z", { name: "Rice" });
    const passed = makeCooling("2026-10-05T18:30:00.000Z", { name: "Stock", status: "stage1-pass" });
    const failed = makeCooling("2026-10-05T19:00:00.000Z", {
      name: "Beans",
      status: "failed",
      failReason: "not ≤ 70 °F within 2 h",
      correctiveAction: { kind: "discard" },
    });
    const m = dailyReportModel(kitchen, [], [], [open, passed, failed], DAY, TZ, "F");
    expect(m.cooling.map((c) => c.statusLabel)).toEqual(["Stage 1 in progress", "Stage 2 in progress", "Failed: not ≤ 70 °F within 2 h"]);
    expect(m.cooling[2]).toMatchObject({ failReason: "not ≤ 70 °F within 2 h", correctiveAction: "Discarded" });
    expect(m.totals).toMatchObject({ cooling: 3, coolingFailed: 1 });
  });
  it("totals the day", () => {
    expect(model.totals).toEqual({ scheduled: 5, logged: 3, onTime: 2, missed: 2, failed: 1, rate: 0.6, cooling: 1, coolingFailed: 0 });
  });
  it("skips deleted checkpoints and readings and shows archived checkpoints with activity", () => {
    const archived = makeCheckpoint({ archivedAt: "2026-10-05T16:00:00.000Z" });
    const m = dailyReportModel(kitchen, [archived, { ...hot, deletedAt: "2026-10-05T00:00:00.000Z" }], [r1, { ...r2b, deletedAt: r2b.takenAt }], [], DAY, TZ, "F");
    expect(m.checkpoints.map((s) => s.name)).toEqual(["Walk-in fridge"]);
    expect(m.checkpoints[0]?.rows).toHaveLength(1);
  });
  it("includes ad-hoc readings with no scheduled time", () => {
    const adhoc = makeReading("2026-10-05T20:00:00.000Z", { valueF: 37 });
    const m = dailyReportModel(kitchen, [fridge], [adhoc], [], DAY, TZ, "F");
    expect(m.checkpoints[0]?.rows[0]).toMatchObject({ time: "16:00", scheduledTime: null, late: false });
  });
});

describe("rangeReportModel", () => {
  it("builds one day model per day and sums totals", () => {
    const m = rangeReportModel(kitchen, [fridge, hot], readings, [cooling], "2026-10-04", "2026-10-06", TZ, "F");
    expect(m.header).toMatchObject({ from: "2026-10-04", to: "2026-10-06" });
    expect(m.days.map((d) => d.header.from)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(m.totals).toMatchObject({ scheduled: 15, logged: 3, missed: 12, failed: 1, cooling: 1 });
    expect(m.totals.rate).toBeCloseTo(3 / 15);
  });
  it("returns no days when to is before from", () => {
    expect(rangeReportModel(kitchen, [fridge], [], [], "2026-10-06", "2026-10-04", TZ, "F").days).toEqual([]);
  });
});

describe("toCsvRows", () => {
  it("starts with the header", () => {
    expect(CSV_HEADER).toEqual(["Date", "Time", "Checkpoint", "Kind", "Value", "Unit", "Limit", "Result", "Corrective action", "Initials"]);
    expect(toCsvRows(model)[0]).toEqual(CSV_HEADER);
  });
  it("has a row per reading, missed check and cooling stage, by time", () => {
    const rows = toCsvRows(model).slice(1);
    expect(rows.map((r) => [r[1], r[2], r[7]])).toEqual([
      ["07:05", "Walk-in fridge", "pass"],
      ["11:10", "Walk-in fridge", "fail"],
      ["11:40", "Walk-in fridge", "pass"],
      ["12:50", "Hot well", "pass"],
      ["15:00", "Walk-in fridge", "missed"],
      ["15:30", "Cooling: Chili", "pass"],
      ["18:00", "Cooling: Chili", "pass"],
      ["19:00", "Walk-in fridge", "missed"],
    ]);
  });
  it("fills value, unit, limit, corrective action and initials", () => {
    const rows = toCsvRows(model).slice(1);
    expect(rows[1]).toEqual([DAY, "11:10", "Walk-in fridge", "Cold holding", 45, "°F", "≤ 41 °F", "fail", "Moved product: to reach-in 2", "JD"]);
    expect(rows[4]).toEqual([DAY, "15:00", "Walk-in fridge", "Cold holding", "", "°F", "≤ 41 °F", "missed", "", ""]);
    expect(rows[5]).toEqual([DAY, "15:30", "Cooling: Chili", "Cooling stage 1", 65, "°F", "≤ 70 °F within 2 h", "pass", "", "SK"]);
  });
  it("flattens a range report day by day under one header", () => {
    const range = rangeReportModel(kitchen, [fridge, hot], readings, [cooling], "2026-10-05", "2026-10-06", TZ, "F");
    const rows = toCsvRows(range);
    expect(rows.filter((r) => r === CSV_HEADER || r[0] === "Date")).toHaveLength(1);
    expect(rows.filter((r) => r[0] === "2026-10-06")).toHaveLength(5); // all five checks missed
  });
});
