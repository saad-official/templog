// UI-only: the text typed on the reading keypad. Readings are at most 3 integer digits and one
// decimal (0.1 resolution, like the shared rules), optionally negative (freezers in °C).
import { useState } from 'react';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back' | 'clear' | 'sign';

const MAX_INT_DIGITS = 3;

/** Applies one key to the entry text. Pure, so it is easy to reason about. */
export function applyKey(text: string, key: KeypadKey): string {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  if (key === 'clear') return '';
  if (key === 'sign') return negative ? body : `-${body}`;
  if (key === 'back') {
    const next = body.slice(0, -1);
    return next ? `${negative ? '-' : ''}${next}` : '';
  }
  if (key === '.') {
    if (body.includes('.')) return text;
    return `${negative ? '-' : ''}${body || '0'}.`;
  }
  // A digit.
  const [int = '', dec] = body.split('.');
  if (dec !== undefined) {
    if (dec.length >= 1) return text;
    return `${text}${key}`;
  }
  if (int === '0') return `${negative ? '-' : ''}${key}`;
  if (int.length >= MAX_INT_DIGITS) return text;
  return `${text}${key}`;
}

/** Entry text → number (null while empty or just a sign). A trailing point is ignored. */
export function parseEntry(text: string): number | null {
  const trimmed = text.replace(/\.$/, '');
  if (!trimmed || trimmed === '-') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** A number → entry text (`38.5`, `-18`), used when the unit toggle converts a typed value. */
export function entryFromNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function useKeypadEntry(initial = '') {
  const [text, setText] = useState(initial);
  const press = (key: KeypadKey) => setText((t) => applyKey(t, key));
  return { text, value: parseEntry(text), press, setText };
}
