import {
  COOLING_LIMITS,
  coolingDeadlines,
  coolingLabel,
  coolingProgress,
  discardCooling,
  evaluateCooling,
  expireCooling,
  formatMinutes,
  nextCoolingPrompt,
  revertCoolingReading,
} from "./cooling";
import type { CoolingItem } from "./schemas";

const START = "2026-10-05T14:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000).toISOString();
const RID = "0199b3a0-0000-7000-8000-0000000000f1";

function item(overrides: Partial<CoolingItem> = {}): CoolingItem {
  return {
    id: "0199b3a0-0000-7000-8000-0000000000c1",
    kitchenId: "0199b3a0-0000-7000-8000-0000000000a1",
    name: "Chili",
    startedAt: START,
    status: "cooling",
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}
const stage1Passed = (minutes = 90) => item({ status: "stage1-pass", stage1At: at(minutes) });

describe("COOLING_LIMITS and coolingDeadlines", () => {
  it("encodes 3-501.14: 70 °F in 2 h, 41 °F within 6 h total", () => {
    expect(COOLING_LIMITS).toEqual({ startF: 135, stage1MaxF: 70, stage2MaxF: 41, stage1Hours: 2, totalHours: 6 });
  });
  it("puts stage 1 at +2 h and stage 2 at +6 h from the start", () => {
    expect(coolingDeadlines(START)).toEqual({ stage1DueAt: at(120), stage2DueAt: at(360) });
  });
  it("is measured in elapsed time across a DST change", () => {
    const start = "2026-11-01T05:30:00.000Z"; // 01:30 EDT, clocks fall back at 06:00Z
    expect(coolingDeadlines(start).stage2DueAt).toBe("2026-11-01T11:30:00.000Z");
  });
});

describe("evaluateCooling — stage 1", () => {
  it("passes stage 1 at or below 70 °F before the deadline", () => {
    const e = evaluateCooling(item(), 68, at(100), { readingId: RID });
    expect(e).toMatchObject({ stage: "stage1", outcome: "pass", status: "stage1-pass", readingResult: "pass", failReason: null });
    expect(e.patch).toEqual({ status: "stage1-pass", stage1ReadingId: RID, stage1At: at(100) });
  });
  it("passes exactly at 70 °F and exactly at the deadline", () => {
    expect(evaluateCooling(item(), 70, at(120)).status).toBe("stage1-pass");
  });
  it("keeps cooling on an early reading still above 70 °F", () => {
    const e = evaluateCooling(item(), 95, at(60), { readingId: RID });
    expect(e).toMatchObject({ outcome: "pending", status: "cooling", readingResult: "pass", failReason: null });
    expect(e.patch).toEqual({});
  });
  it("fails a reading above 70 °F after the deadline", () => {
    const e = evaluateCooling(item(), 75, at(125), { readingId: RID });
    expect(e).toMatchObject({ outcome: "fail", status: "failed", readingResult: "fail" });
    expect(e.failReason).toBe("not ≤ 70 °F within 2 h");
    expect(e.patch).toMatchObject({ status: "failed", stage1ReadingId: RID, failedAt: at(120), failReason: "not ≤ 70 °F within 2 h" });
  });
  it("fails a late stage-1 reading even when it is cold enough", () => {
    expect(evaluateCooling(item(), 60, at(121)).outcome).toBe("fail");
  });
  it("completes both stages when stage 1 already reads 41 °F or below", () => {
    const e = evaluateCooling(item(), 40, at(110), { readingId: RID });
    expect(e).toMatchObject({ stage: "stage1", outcome: "pass", status: "done" });
    expect(e.patch).toEqual({ status: "done", stage1ReadingId: RID, stage2ReadingId: RID, stage1At: at(110), completedAt: at(110) });
  });
  it("phrases the reason in °C when asked", () => {
    expect(evaluateCooling(item(), 30, at(130), { unit: "C" }).failReason).toBe("not ≤ 21.1 °C within 2 h");
  });
});

describe("evaluateCooling — stage 2", () => {
  it("finishes at or below 41 °F before 6 h", () => {
    const e = evaluateCooling(stage1Passed(), 41, at(300), { readingId: RID });
    expect(e).toMatchObject({ stage: "stage2", outcome: "pass", status: "done", readingResult: "pass" });
    expect(e.patch).toEqual({ status: "done", stage2ReadingId: RID, completedAt: at(300) });
  });
  it("keeps going on an on-time reading above 41 °F", () => {
    expect(evaluateCooling(stage1Passed(), 50, at(240))).toMatchObject({ outcome: "pending", status: "stage1-pass" });
  });
  it("fails a reading after the 6-hour deadline", () => {
    const e = evaluateCooling(stage1Passed(), 40, at(365), { readingId: RID });
    expect(e).toMatchObject({ outcome: "fail", status: "failed", failReason: "not ≤ 41 °F within 6 h" });
    expect(e.patch).toMatchObject({ stage2ReadingId: RID, failedAt: at(360) });
  });
  it("fails a reading above 41 °F exactly at the deadline", () => {
    expect(evaluateCooling(stage1Passed(), 42, at(360)).outcome).toBe("fail");
  });
});

describe("evaluateCooling — guards", () => {
  it("refuses readings on a closed item", () => {
    for (const status of ["done", "failed", "discarded"] as const) {
      expect(() => evaluateCooling(item({ status }), 40, at(10))).toThrow(/closed/);
    }
  });
  it("refuses a reading taken before cooling started", () => {
    expect(() => evaluateCooling(item(), 40, at(-5))).toThrow(RangeError);
  });
  it("refuses a non-finite value", () => {
    expect(() => evaluateCooling(item(), Number.NaN, at(5))).toThrow(RangeError);
  });
});

describe("expireCooling", () => {
  it("auto-fails stage 1 once its deadline passes with no passing reading", () => {
    expect(expireCooling(item(), at(121))).toEqual({ status: "failed", failedAt: at(120), failReason: "not ≤ 70 °F within 2 h" });
  });
  it("auto-fails stage 2 after 6 h", () => {
    expect(expireCooling(stage1Passed(), at(361))).toEqual({ status: "failed", failedAt: at(360), failReason: "not ≤ 41 °F within 6 h" });
  });
  it("does nothing before a deadline, exactly at it, or on a closed item", () => {
    expect(expireCooling(item(), at(119))).toBeNull();
    expect(expireCooling(item(), at(120))).toBeNull();
    expect(expireCooling(item({ status: "done" }), at(999))).toBeNull();
  });
});

describe("revertCoolingReading", () => {
  const OTHER = "0199b3a0-0000-7000-8000-0000000000f2";
  const apply = (base: CoolingItem, value: number, minutes: number) => {
    const e = evaluateCooling(base, value, at(minutes), { readingId: RID });
    return { ...base, ...e.patch, ...(e.readingResult === "fail" ? { correctiveAction: { kind: "discard" as const } } : {}) };
  };
  /** The item's open-stage fields, with missing ones read as null. */
  const fields = (i: CoolingItem) => ({
    status: i.status,
    stage1ReadingId: i.stage1ReadingId ?? null,
    stage1At: i.stage1At ?? null,
    stage2ReadingId: i.stage2ReadingId ?? null,
    completedAt: i.completedAt ?? null,
    failedAt: i.failedAt ?? null,
    failReason: i.failReason ?? null,
    correctiveAction: i.correctiveAction ?? null,
  });

  it("undoes a stage-1 pass back to cooling", () => {
    const after = apply(item(), 68, 100);
    expect({ ...after, ...revertCoolingReading(after, RID) }).toMatchObject({ status: "cooling", stage1ReadingId: null, stage1At: null });
  });
  it("undoes a stage-1 reading that completed both stages", () => {
    const after = apply(item(), 40, 110);
    expect(fields({ ...after, ...revertCoolingReading(after, RID) })).toEqual(fields(item()));
  });
  it("undoes a stage-1 fail and its corrective action", () => {
    const after = apply(item(), 75, 125);
    expect(fields({ ...after, ...revertCoolingReading(after, RID) })).toEqual(fields(item()));
  });
  it("undoes a stage-2 pass back to stage1-pass, keeping the stage-1 reading", () => {
    const base = item({ status: "stage1-pass", stage1ReadingId: OTHER, stage1At: at(90) });
    const after = apply(base, 40, 300);
    expect({ ...after, ...revertCoolingReading(after, RID) }).toMatchObject({
      status: "stage1-pass",
      stage1ReadingId: OTHER,
      stage1At: at(90),
      stage2ReadingId: null,
      completedAt: null,
    });
  });
  it("undoes a stage-2 fail and its corrective action", () => {
    const base = item({ status: "stage1-pass", stage1ReadingId: OTHER, stage1At: at(90) });
    const after = apply(base, 45, 365);
    expect({ ...after, ...revertCoolingReading(after, RID) }).toMatchObject({
      status: "stage1-pass",
      stage1ReadingId: OTHER,
      stage2ReadingId: null,
      failedAt: null,
      failReason: null,
      correctiveAction: null,
    });
  });
  it("changes nothing on the item for a pending reading", () => {
    expect(revertCoolingReading(item(), RID)).toEqual({});
  });
  it("refuses to undo stage 1 under a later stage-2 result, a stage-2 expiry or a discard", () => {
    expect(revertCoolingReading(item({ status: "done", stage1ReadingId: RID, stage1At: at(90), stage2ReadingId: OTHER }), RID)).toBeNull();
    expect(revertCoolingReading(item({ status: "failed", stage1ReadingId: RID, stage1At: at(90), failedAt: at(360) }), RID)).toBeNull();
    expect(revertCoolingReading(item({ status: "discarded", stage1ReadingId: RID, stage1At: at(90) }), RID)).toBeNull();
  });
});

describe("discardCooling", () => {
  it("closes the item as discarded", () => {
    expect(discardCooling(item(), at(30))).toEqual({ status: "discarded", discardedAt: at(30) });
  });
});

describe("nextCoolingPrompt", () => {
  it("prompts for stage 1 with minutes left", () => {
    expect(nextCoolingPrompt(item(), at(45))).toEqual({ kind: "stage1", dueAt: at(120), minutesLeft: 75 });
  });
  it("prompts for stage 2 after stage 1 passed", () => {
    expect(nextCoolingPrompt(stage1Passed(), at(200))).toEqual({ kind: "stage2", dueAt: at(360), minutesLeft: 160 });
  });
  it("rounds partial minutes up and goes negative when overdue", () => {
    expect(nextCoolingPrompt(item(), at(119.5))?.minutesLeft).toBe(1);
    expect(nextCoolingPrompt(item(), at(125))?.minutesLeft).toBe(-5);
  });
  it("is null for closed items", () => {
    expect(nextCoolingPrompt(item({ status: "done" }), at(10))).toBeNull();
    expect(nextCoolingPrompt(item({ status: "discarded" }), at(10))).toBeNull();
  });
});

describe("coolingProgress", () => {
  it("runs 0..1 across stage 1", () => {
    expect(coolingProgress(item(), START)).toBe(0);
    expect(coolingProgress(item(), at(60))).toBe(0.5);
    expect(coolingProgress(item(), at(500))).toBe(1);
  });
  it("runs from the stage-1 pass to the 6-hour deadline in stage 2", () => {
    expect(coolingProgress(stage1Passed(60), at(60))).toBe(0);
    expect(coolingProgress(stage1Passed(60), at(210))).toBe(0.5);
  });
  it("falls back to the 2-hour mark when stage1At is missing", () => {
    expect(coolingProgress(item({ status: "stage1-pass" }), at(240))).toBe(0.5);
  });
  it("is 1 for closed items", () => {
    expect(coolingProgress(item({ status: "done" }), at(10))).toBe(1);
  });
});

describe("formatMinutes and coolingLabel", () => {
  it("formats durations", () => {
    expect(formatMinutes(45)).toBe("45 m");
    expect(formatMinutes(72)).toBe("1 h 12 m");
    expect(formatMinutes(180)).toBe("3 h");
    expect(formatMinutes(0)).toBe("0 m");
  });
  it("describes each state", () => {
    expect(coolingLabel(item(), at(48))).toBe("Stage 1: ≤ 70 °F in 1 h 12 m");
    expect(coolingLabel(item(), at(48), "C")).toBe("Stage 1: ≤ 21.1 °C in 1 h 12 m");
    expect(coolingLabel(item(), at(125))).toBe("Stage 1 overdue by 5 m");
    expect(coolingLabel(stage1Passed(), at(300))).toBe("Stage 2: ≤ 41 °F in 1 h");
    expect(coolingLabel(item({ status: "done" }), at(1))).toBe("Cooled");
    expect(coolingLabel(item({ status: "discarded" }), at(1))).toBe("Discarded");
    expect(coolingLabel(item({ status: "failed", failReason: "not ≤ 70 °F within 2 h" }), at(1))).toBe("Failed: not ≤ 70 °F within 2 h");
    expect(coolingLabel(item({ status: "failed" }), at(1))).toBe("Failed");
  });
});
