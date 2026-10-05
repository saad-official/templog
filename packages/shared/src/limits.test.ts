import {
  checkpointTone,
  COOKING_MINIMUMS_F,
  defaultLimitsFor,
  evaluateReading,
  FOOD_CODE_DEFAULTS,
  kindLabel,
  limitsLabel,
} from "./limits";
import type { Limits } from "./schemas";

const cp = (limits: Limits) => ({ limits });

describe("FOOD_CODE_DEFAULTS", () => {
  it("holds the Food Code limits per kind in °F", () => {
    expect(FOOD_CODE_DEFAULTS).toEqual({
      "cold-holding": { max: 41 },
      "hot-holding": { min: 135 },
      cooking: { min: 165 },
      receiving: { max: 41 },
      freezer: { max: 0 },
    });
  });
  it("lists cooking minimums by item type", () => {
    expect(COOKING_MINIMUMS_F.poultry).toBe(165);
    expect(COOKING_MINIMUMS_F["ground-meat"]).toBe(155);
    expect(COOKING_MINIMUMS_F["whole-muscle"]).toBe(145);
    expect(COOKING_MINIMUMS_F.reheat).toBe(165);
  });
});

describe("defaultLimitsFor", () => {
  it("returns the kind default", () => {
    expect(defaultLimitsFor("hot-holding")).toEqual({ min: 135 });
    expect(defaultLimitsFor("freezer")).toEqual({ max: 0 });
  });
  it("uses the cooking item minimum when given", () => {
    expect(defaultLimitsFor("cooking", "ground-meat")).toEqual({ min: 155 });
    expect(defaultLimitsFor("cooking")).toEqual({ min: 165 });
  });
  it("returns a fresh copy callers may edit", () => {
    const l = defaultLimitsFor("cold-holding");
    l.max = 38;
    expect(FOOD_CODE_DEFAULTS["cold-holding"].max).toBe(41);
  });
});

describe("evaluateReading", () => {
  it("passes a cold reading at or below the max", () => {
    expect(evaluateReading(cp({ max: 41 }), 41)).toEqual({ result: "pass", failReason: null });
    expect(evaluateReading(cp({ max: 41 }), 36.2)).toEqual({ result: "pass", failReason: null });
  });
  it("fails a cold reading above the max with a reason", () => {
    expect(evaluateReading(cp({ max: 41 }), 41.1)).toEqual({ result: "fail", failReason: "above 41 °F" });
  });
  it("fails a hot reading below the min", () => {
    expect(evaluateReading(cp({ min: 135 }), 128)).toEqual({ result: "fail", failReason: "below 135 °F" });
    expect(evaluateReading(cp({ min: 135 }), 135).result).toBe("pass");
  });
  it("checks both bounds of a range", () => {
    expect(evaluateReading(cp({ min: 33, max: 41 }), 31).failReason).toBe("below 33 °F");
    expect(evaluateReading(cp({ min: 33, max: 41 }), 42).failReason).toBe("above 41 °F");
    expect(evaluateReading(cp({ min: 33, max: 41 }), 37).result).toBe("pass");
  });
  it("compares at 0.1 °F resolution", () => {
    expect(evaluateReading(cp({ max: 41 }), 41.04).result).toBe("pass");
  });
  it("can phrase the reason in °C", () => {
    expect(evaluateReading(cp({ max: 41 }), 45, "C").failReason).toBe("above 5 °C");
  });
  it("throws on a non-finite value", () => {
    expect(() => evaluateReading(cp({ max: 41 }), Number.NaN)).toThrow(RangeError);
  });
});

describe("limitsLabel", () => {
  it("labels a max, a min and a range", () => {
    expect(limitsLabel(cp({ max: 41 }), "F")).toBe("≤ 41 °F");
    expect(limitsLabel(cp({ min: 135 }), "F")).toBe("≥ 135 °F");
    expect(limitsLabel(cp({ min: 33, max: 41 }), "F")).toBe("33–41 °F");
  });
  it("converts to the display unit", () => {
    expect(limitsLabel(cp({ max: 41 }), "C")).toBe("≤ 5 °C");
    expect(limitsLabel(cp({ min: 135 }), "C")).toBe("≥ 57.2 °C");
  });
});

describe("kindLabel and checkpointTone", () => {
  it("labels kinds for people", () => {
    expect(kindLabel("cold-holding")).toBe("Cold holding");
    expect(kindLabel("freezer")).toBe("Freezer");
  });
  it("marks cold kinds cold and heated kinds hot", () => {
    expect(checkpointTone("cold-holding")).toBe("cold");
    expect(checkpointTone("freezer")).toBe("cold");
    expect(checkpointTone("receiving")).toBe("cold");
    expect(checkpointTone("hot-holding")).toBe("hot");
    expect(checkpointTone("cooking")).toBe("hot");
  });
});
