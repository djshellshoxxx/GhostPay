import { ExportError } from './errors.js';
import { indexOfInvalidText, utf8Length } from './text.js';

/** Hard limits for untrusted CSV input. */
export interface ParseLimits {
  /** Maximum input size in UTF-8 bytes (default 16 MiB). */
  readonly maxBytes?: number;
  /** Maximum records including the header (default 100,001). */
  readonly maxRows?: number;
  /** Maximum fields per record (default 64). */
  readonly maxFields?: number;
  /** Maximum UTF-16 length of any single field (default 8,192). */
  readonly maxFieldChars?: number;
}

export const PARSE_DEFAULTS = {
  maxBytes: 16 * 1024 * 1024,
  maxRows: 100_001,
  maxFields: 64,
  maxFieldChars: 8192,
} as const;

function lim(v: number | undefined, def: number, name: string): number {
  const n = v ?? def;
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ExportError('INVALID_OPTION', `${name} must be a positive integer`);
  return n;
}

/**
 * Strict RFC 4180 parser.
 *
 * Accepted: optional leading BOM, CRLF or LF record separators, optional final
 * separator, quoted fields with `""` escapes and embedded separators/newlines.
 * Rejected (never "repaired"): bare CR, quotes inside unquoted fields, text
 * after a closing quote, unterminated quotes, blank lines, ragged rows,
 * control characters / lone surrogates, and anything over the limits.
 *
 * @security Linear time and memory in the (bounded) input; limits are checked
 * up front (size) and while scanning (rows, fields, field length), so hostile
 * input cannot cause quadratic work or unbounded allocation. No formula
 * evaluation or un-neutralising happens here.
 */
export function parseCsv(text: string, limits: ParseLimits = {}): string[][] {
  const maxBytes = lim(limits.maxBytes, PARSE_DEFAULTS.maxBytes, 'maxBytes');
  const maxRows = lim(limits.maxRows, PARSE_DEFAULTS.maxRows, 'maxRows');
  const maxFields = lim(limits.maxFields, PARSE_DEFAULTS.maxFields, 'maxFields');
  const maxChars = lim(limits.maxFieldChars, PARSE_DEFAULTS.maxFieldChars, 'maxFieldChars');

  // Cheap pre-check (length*3 >= bytes) avoids scanning absurdly large strings.
  if (text.length > maxBytes || utf8Length(text) > maxBytes) {
    throw new ExportError('LIMIT_BYTES', 'input exceeds maxBytes');
  }
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const bad = indexOfInvalidText(text.slice(i));
  if (bad !== -1) throw new ExportError('PARSE_SYNTAX', 'control character or unpaired surrogate in input');

  const rows: string[][] = [];
  if (i >= text.length) return rows;
  const unquoted = /[^",\r\n]*/y;
  let row: string[] = [];
  const rowNo = (): number => rows.length + 1;
  const syntax = (m: string, pushed = false): never => {
    throw new ExportError('PARSE_SYNTAX', m, rowNo(), row.length + (pushed ? 0 : 1));
  };

  for (;;) {
    // ---- one field ----
    let value: string;
    let quotedLast: boolean;
    if (text[i] === '"') {
      quotedLast = true;
      i++;
      value = '';
      for (;;) {
        const q = text.indexOf('"', i);
        if (q === -1) syntax('unterminated quoted field');
        value += text.slice(i, q);
        if (value.length > maxChars)
          throw new ExportError('LIMIT_FIELD_LENGTH', 'field too long', rowNo(), row.length + 1);
        if (text[q + 1] === '"') {
          value += '"';
          i = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
    } else {
      quotedLast = false;
      unquoted.lastIndex = i;
      const m = unquoted.exec(text);
      value = m === null ? '' : m[0];
      i += value.length;
      if (value.length > maxChars)
        throw new ExportError('LIMIT_FIELD_LENGTH', 'field too long', rowNo(), row.length + 1);
      if (text[i] === '"') syntax('quote inside unquoted field');
    }
    row.push(value);
    if (row.length > maxFields) throw new ExportError('LIMIT_FIELDS', 'too many fields', rowNo());

    // ---- terminator ----
    const c = text[i];
    if (c === ',') {
      i++;
      continue;
    }
    if (c !== undefined && c !== '\n' && c !== '\r') syntax('unexpected character after closing quote', true);
    if (c === '\r') {
      if (text[i + 1] !== '\n') syntax('bare CR', true);
      i += 2;
    } else if (c === '\n') i++;
    // blank line = a lone unquoted empty field
    if (row.length === 1 && value === '' && !quotedLast) syntax('blank line', true);
    rows.push(row);
    if (rows.length > maxRows) throw new ExportError('LIMIT_ROWS', 'too many rows', rows.length);
    row = [];
    if (c === undefined || i >= text.length) return rows;
  }
}

/** Throws PARSE_RAGGED unless every record has the same field count. */
export function assertRectangular(rows: readonly (readonly string[])[]): void {
  const w = rows[0]?.length ?? 0;
  rows.forEach((r, idx) => {
    if (r.length !== w)
      throw new ExportError('PARSE_RAGGED', 'record has a different field count than the header', idx + 1);
  });
}
