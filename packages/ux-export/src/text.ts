import { ExportError } from './errors.js';

/** First characters that spreadsheet apps may interpret as a formula/command. */
const DANGEROUS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** C0 controls other than TAB, LF, CR (NUL etc. are never legitimate text). */
// eslint-disable-next-line no-control-regex
const BAD_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True when `s` contains a control character or unpaired surrogate. */
export function hasInvalidText(s: string): boolean {
  return BAD_CONTROL.test(s) || LONE_SURROGATE.test(s);
}

/** Index of the first invalid character in `s`, or -1. */
export function indexOfInvalidText(s: string): number {
  const a = s.search(BAD_CONTROL);
  const b = s.search(LONE_SURROGATE);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** Replaces invalid characters with U+FFFD. */
export function replaceInvalidText(s: string): string {
  return s
    .replace(new RegExp(BAD_CONTROL.source, 'g'), '�')
    .replace(new RegExp(LONE_SURROGATE.source, 'g'), '�');
}

/**
 * Whether stripping any run of leading apostrophes from `s` exposes a
 * formula-trigger character. Used so neutralisation is exactly reversible.
 */
function needsGuard(s: string): boolean {
  let i = 0;
  while (s[i] === "'") i++;
  const c = s[i];
  return c !== undefined && DANGEROUS.has(c);
}

/**
 * Neutralises CSV/formula injection by prefixing a single apostrophe when the
 * value starts with `=`, `+`, `-`, `@`, TAB or CR (optionally behind existing
 * apostrophes, which keeps the transform bijective; see {@link unneutralizeFormula}).
 *
 * @security Spreadsheet apps treat a leading apostrophe as a text marker, so
 * the cell is never evaluated. Apply to every free-text cell; numeric cells
 * generated from bigint (which may start with `-`) must not pass through here.
 */
export function neutralizeFormula(value: string): string {
  return needsGuard(value) ? `'${value}` : value;
}

/**
 * Exact inverse of {@link neutralizeFormula}: removes one leading apostrophe
 * only if what follows would have required a guard.
 */
export function unneutralizeFormula(value: string): string {
  return value.startsWith("'") && needsGuard(value.slice(1)) ? value.slice(1) : value;
}

/**
 * RFC 4180 quoting: wraps in double quotes (doubling embedded quotes) when the
 * field contains a comma, quote, CR or LF, or when `force` is set.
 */
export function quoteField(value: string, force = false): string {
  if (force || /[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** UTF-8 byte length of a JS string (lone surrogates count as U+FFFD, 3 bytes). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

/** Policy for invalid text (controls / lone surrogates) when exporting. */
export type InvalidTextPolicy = 'throw' | 'replace';

/**
 * Validates free text for export.
 * @security Control characters can smuggle terminal/log escapes or break
 * downstream parsers; by default they are rejected.
 */
export function cleanText(value: string, policy: InvalidTextPolicy, row: number, column: number): string {
  if (!hasInvalidText(value)) return value;
  if (policy === 'replace') return replaceInvalidText(value);
  throw new ExportError(
    'INVALID_TEXT',
    'text contains control characters or unpaired surrogates',
    row,
    column,
  );
}
