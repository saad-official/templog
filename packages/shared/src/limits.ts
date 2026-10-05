/**
 * Food-safety limits. All temperatures are °F; the UI converts for display and never hardcodes one.
 *
 * FDA Food Code (2022) references:
 * - 3-501.16(A)(1) hot holding: TCS food at 135 °F (57 °C) or above.
 * - 3-501.16(A)(2) cold holding: TCS food at 41 °F (5 °C) or below.
 * - 3-202.11(A) receiving: refrigerated TCS food at 41 °F or below on receipt
 *   (3-202.11(B) exceptions such as milk and shellstock at 45 °F are set per checkpoint).
 * - 3-501.11 frozen food must be kept frozen; 0 °F (-18 °C) is the conventional freezer target.
 * - 3-401.11 cooking minimums: poultry and stuffed foods 165 °F; ground/injected meats 155 °F;
 *   whole-muscle meat, seafood and eggs for immediate service 145 °F; plant food for hot holding 135 °F.
 * - 3-403.11(A) reheating for hot holding: 165 °F.
 * - 3-501.14 cooling: see `cooling.ts`.
 */
import type { CheckpointKind, Limits } from "./schemas";
import { formatTemp, roundTenth, type Unit, displayTemp } from "./units";

export const FOOD_CODE_DEFAULTS: Readonly<Record<CheckpointKind, Readonly<Limits>>> = {
  "cold-holding": { max: 41 }, // 3-501.16(A)(2)
  "hot-holding": { min: 135 }, // 3-501.16(A)(1)
  cooking: { min: 165 }, // 3-401.11(A)(3) / 3-403.11(A): the strictest minimum is the safe default
  receiving: { max: 41 }, // 3-202.11(A)
  freezer: { max: 0 }, // 3-501.11 (kept frozen; 0 °F conventional target)
};

/** Minimum internal cooking temperatures by item type, °F (3-401.11, 3-403.11). */
export const COOKING_MINIMUMS_F = {
  poultry: 165,
  stuffed: 165,
  reheat: 165,
  "ground-meat": 155,
  "whole-muscle": 145,
  seafood: 145,
  eggs: 145,
  "plant-hot-hold": 135,
} as const;
export type CookingItem = keyof typeof COOKING_MINIMUMS_F;

/** Editable default limits for a new checkpoint. */
export function defaultLimitsFor(kind: CheckpointKind, cookingItem?: CookingItem): Limits {
  if (kind === "cooking" && cookingItem) return { min: COOKING_MINIMUMS_F[cookingItem] };
  return { ...FOOD_CODE_DEFAULTS[kind] };
}

export interface Evaluation {
  result: "pass" | "fail";
  failReason: string | null;
}

/** Pass when `min <= value <= max` at 0.1 °F resolution; the reason names the broken bound. */
export function evaluateReading(checkpoint: { limits: Limits }, valueF: number, unit: Unit = "F"): Evaluation {
  if (!Number.isFinite(valueF)) throw new RangeError("valueF must be a finite number");
  const v = roundTenth(valueF);
  const { min, max } = checkpoint.limits;
  if (max !== undefined && v > max) return { result: "fail", failReason: `above ${formatTemp(displayTemp(max, unit), unit)}` };
  if (min !== undefined && v < min) return { result: "fail", failReason: `below ${formatTemp(displayTemp(min, unit), unit)}` };
  return { result: "pass", failReason: null };
}

/** `≤ 41 °F`, `≥ 135 °F`, `33–41 °F`, in the display unit. */
export function limitsLabel(checkpoint: { limits: Limits }, unit: Unit): string {
  const { min, max } = checkpoint.limits;
  if (min !== undefined && max !== undefined) {
    return `${displayTemp(min, unit)}–${formatTemp(displayTemp(max, unit), unit)}`;
  }
  if (max !== undefined) return `≤ ${formatTemp(displayTemp(max, unit), unit)}`;
  if (min !== undefined) return `≥ ${formatTemp(displayTemp(min, unit), unit)}`;
  return "";
}

const KIND_LABELS: Record<CheckpointKind, string> = {
  "cold-holding": "Cold holding",
  "hot-holding": "Hot holding",
  cooking: "Cooking",
  receiving: "Receiving",
  freezer: "Freezer",
};

export function kindLabel(kind: CheckpointKind): string {
  return KIND_LABELS[kind];
}

/** Accent family for a checkpoint: cold blue or heat orange. */
export function checkpointTone(kind: CheckpointKind): "cold" | "hot" {
  return kind === "hot-holding" || kind === "cooking" ? "hot" : "cold";
}
