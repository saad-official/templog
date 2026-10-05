/** Temperature units. Readings and limits are stored in °F; the kitchen picks a display unit. */

export type Unit = "F" | "C";
export const UNITS: readonly Unit[] = ["F", "C"];

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const out = (Math.sign(value) * Math.round(Number((Math.abs(value) * factor).toPrecision(12)))) / factor;
  return out === 0 ? 0 : out;
}

/** Round to 0.1, halves away from zero, never -0. Float noise is trimmed first (36.65 → 36.7). */
export function roundTenth(value: number): number {
  return roundTo(value, 1);
}

/** °C → °F to 0.1. */
export function toF(celsius: number): number {
  return roundTenth((celsius * 9) / 5 + 32);
}

/** °F → °C to 0.1. */
export function toC(fahrenheit: number): number {
  return roundTenth(((fahrenheit - 32) * 5) / 9);
}

/** Convert between units, exact to 0.1 (same unit just rounds). */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return roundTenth(value);
  return to === "C" ? toC(value) : toF(value);
}

/** A value typed in `unit` → the °F value stored on readings and limits. */
export function toStoredF(value: number, unit: Unit): number {
  return convert(value, unit, "F");
}

/** A stored °F value → the number shown in `unit`. */
export function displayTemp(valueF: number, unit: Unit): number {
  return convert(valueF, "F", unit);
}

export interface FormatTempOptions {
  /** Fixed decimals; default: up to one decimal with a trailing `.0` dropped. */
  digits?: number;
}

/** `41 °F`, `40.5 °F`, `5 °C`. `value` is already in `unit`. */
export function formatTemp(value: number, unit: Unit, options: FormatTempOptions = {}): string {
  const text =
    options.digits === undefined ? String(roundTenth(value)) : roundTo(value, options.digits).toFixed(options.digits);
  return `${text} °${unit}`;
}
