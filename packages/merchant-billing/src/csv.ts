import { BillingError } from './errors.js';

export interface CsvLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxFieldLength: number;
}

export const DEFAULT_CSV_LIMITS: CsvLimits = { maxBytes: 1_048_576, maxRows: 5000, maxFieldLength: 200 };

/**
 * Strict RFC 4180 parser: LF or CRLF rows, `"` quoting with `""` escapes, one optional
 * leading BOM, comma delimiter only.
 *
 * @remarks Rejects: oversize input, NUL and other control characters, line breaks inside
 * fields, stray quotes, text after a closing quote, ragged rows, blank lines, lone CR,
 * bidirectional/zero-width format characters. Errors carry only a row number.
 *
 * @throws {BillingError} `CSV` (`where` = `row N`) or `LIMIT`.
 * @security Untrusted file. Output cells are raw text: callers must still apply
 * {@link assertNoFormula} to free-text cells and validate typed cells.
 */
export function parseCsv(input: string, limits: CsvLimits = DEFAULT_CSV_LIMITS): string[][] {
  if (typeof input !== 'string') throw new BillingError('CSV', 'not text');
  if (input.length > limits.maxBytes || new TextEncoder().encode(input).length > limits.maxBytes)
    throw new BillingError('LIMIT', 'file too large');
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/.test(text))
    throw new BillingError('CSV', 'forbidden character');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  const n = text.length;
  const fail = (msg: string): never => {
    throw new BillingError('CSV', msg, `row ${rows.length + 1}`);
  };
  const endField = (): void => {
    if (field.length > limits.maxFieldLength) throw new BillingError('LIMIT', 'field too long', `row ${rows.length + 1}`);
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    if (row.length === 1 && row[0] === '') fail('blank line');
    if (rows.length > 0 && row.length !== (rows[0] as string[]).length) fail('column count');
    rows.push(row);
    if (rows.length > limits.maxRows) throw new BillingError('LIMIT', 'too many rows');
    row = [];
  };
  while (i < n) {
    const c = text[i] as string;
    if (field === '' && c === '"') {
      i++;
      let closed = false;
      while (i < n) {
        const d = text[i] as string;
        if (d === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        if (d === '\n' || d === '\r') fail('newline in field');
        field += d;
        i++;
      }
      if (!closed) fail('unterminated quote');
      const e = text[i];
      if (e !== undefined && e !== ',' && e !== '\n' && e !== '\r') fail('text after quote');
    } else if (c === ',') {
      endField();
      i++;
    } else if (c === '\n') {
      endRow();
      i++;
    } else if (c === '\r') {
      if (text[i + 1] !== '\n') fail('lone CR');
      endRow();
      i += 2;
    } else if (c === '"') {
      fail('stray quote');
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  if (rows.length === 0) throw new BillingError('CSV', 'empty file');
  return rows;
}

/**
 * Rejects cells a spreadsheet would execute: after leading spaces, a first character
 * of `=`, `+`, `-`, `@`, tab or CR (OWASP CSV injection list).
 *
 * @throws {BillingError} `CSV`.
 */
export function assertNoFormula(cell: string, where: string): void {
  if (/^[ ]*[=+\-@\t\r]/.test(cell)) throw new BillingError('CSV', 'formula-like cell', where);
}

/** Escapes a cell for CSV export: neutralizes formulas with a leading `'` and quotes as needed. */
export function csvEscapeCell(cell: string): string {
  const safe = /^[ ]*[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
