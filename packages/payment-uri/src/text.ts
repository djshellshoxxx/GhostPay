import { fail } from './errors.js';

const UNSAFE = /[\p{Cc}\p{Cs}\p{Co}\p{Bidi_Control}\p{Default_Ignorable_Code_Point}\u{E0000}-\u{E007F}  �\p{Cn}]/u;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

/** Maximum UTF-8 bytes accepted for a `label`. */
export const MAX_LABEL_BYTES = 128;
/** Maximum UTF-8 bytes accepted for a `message`. */
export const MAX_MESSAGE_BYTES = 512;
/** Maximum UTF-8 bytes accepted for a Solana `memo`. */
export const MAX_MEMO_BYTES = 256;

const enc = new TextEncoder();

/**
 * Validates untrusted display text. Rejects (never repairs): control, unassigned, private-use, surrogate,
 * bidi-control, default-ignorable (incl. zero-width) and tag characters, non-NFC text, empty text and text over `maxBytes`.
 *
 * @security The result is PLAIN TEXT. Render it with `textContent`, never as HTML.
 */
export function checkText(s: unknown, maxBytes: number): string {
  if (typeof s !== 'string' || s.length === 0) return fail('UNSAFE_TEXT');
  if (s.length > maxBytes || enc.encode(s).length > maxBytes) return fail('TOO_LONG');
  if (UNSAFE.test(s) || s !== s.normalize('NFC')) return fail('UNSAFE_TEXT');
  return s;
}

/** True when any whitespace-separated token mixes Latin with Cyrillic or Greek (lookalike hook for the UI). */
export function hasMixedScript(s: string): boolean {
  return s.split(/\s+/u).some((t) => LATIN.test(t) && LOOKALIKE.test(t));
}
