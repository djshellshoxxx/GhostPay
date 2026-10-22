import { fail, type LinkErrorCode } from './errors.js';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
// Control, format (zero-width, bidi overrides), line/paragraph separators, private use, unassigned.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/u;

/**
 * Validates a human-readable text field (memo, title, label).
 *
 * @remarks Requires: string, 1..`max` code points, NFC-normalised, well-formed
 * UTF-16, no control/format/bidi/private-use/unassigned characters, no leading
 * or trailing whitespace. Text is data to be rendered as text only.
 * @param v Candidate value.
 * @param max Maximum length in Unicode code points.
 * @param code Error code to throw.
 * @param path Field path for the error.
 * @returns The unchanged, validated string.
 * @security Blocks bidi-override and zero-width spoofing in memos shown to payers.
 */
export function validateText(v: unknown, max: number, code: LinkErrorCode, path: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max * 2) return fail(code, path);
  if (LONE_SURROGATE.test(v)) return fail(code, path);
  if (FORBIDDEN.test(v)) return fail(code, path);
  if (v.normalize('NFC') !== v) return fail(code, path);
  if (v.trim() !== v) return fail(code, path);
  let n = 0;
  for (const _ of v) {
    void _;
    n++;
    if (n > max) return fail(code, path);
  }
  return v;
}
