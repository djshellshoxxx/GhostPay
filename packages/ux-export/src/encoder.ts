import { formatUnits } from './amount.js';
import { ExportError } from './errors.js';
import { cleanText, neutralizeFormula, quoteField, utf8Length, type InvalidTextPolicy } from './text.js';
import { formatTimestamp, type DateFormat } from './time.js';
import {
  DEFAULT_COLUMNS,
  resolveColumns,
  validateRow,
  type ColumnSpec,
  type LedgerRow,
  type ResolvedColumn,
} from './types.js';

/** Default hard ceilings for one export. */
export const DEFAULT_MAX_ROWS = 1_000_000;
export const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
export const DEFAULT_CHUNK_CHARS = 64 * 1024;

/** Options shared by all generators. */
export interface ExportOptions {
  /** Columns in output order (default {@link DEFAULT_COLUMNS}). */
  readonly columns?: readonly ColumnSpec[];
  /** Date format for the `timestamp` column (default `iso`, UTC). */
  readonly dateFormat?: DateFormat;
  /** Prepend a UTF-8 BOM so Excel detects the encoding (default false). */
  readonly bom?: boolean;
  /** Record separator: RFC 4180 `crlf` (default) or `lf`. */
  readonly eol?: 'crlf' | 'lf';
  /** Drop trailing fractional zeros (default false: fixed `decimals` digits). */
  readonly trimZeros?: boolean;
  /** Maximum data rows (default 1,000,000). */
  readonly maxRows?: number;
  /** Maximum output size in UTF-8 bytes including BOM (default 64 MiB). */
  readonly maxBytes?: number;
  /** Approximate chunk size in UTF-16 code units (default 65,536). */
  readonly chunkChars?: number;
  /** What to do with control chars / lone surrogates in text (default throw). */
  readonly invalidText?: InvalidTextPolicy;
}

function posInt(v: number | undefined, def: number, name: string): number {
  const n = v ?? def;
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ExportError('INVALID_OPTION', `${name} must be a positive integer`);
  return n;
}

/**
 * Low-level chunk accumulator enforcing size limits. Shared by the ledger and
 * summary generators, in sync and async flavours.
 *
 * @security Limits are checked before a chunk is released, so a hostile or
 * runaway source cannot make the producer emit unbounded output.
 */
export class ChunkWriter {
  private parts: string[] = [];
  private chars = 0;
  private bytes = 0;
  private rows = 0;
  private started = false;
  readonly eolText: string;
  private readonly maxRows: number;
  private readonly maxBytes: number;
  private readonly chunkChars: number;
  private readonly bom: boolean;

  constructor(o: Pick<ExportOptions, 'maxRows' | 'maxBytes' | 'chunkChars' | 'bom' | 'eol'>) {
    this.maxRows = posInt(o.maxRows, DEFAULT_MAX_ROWS, 'maxRows');
    this.maxBytes = posInt(o.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
    this.chunkChars = posInt(o.chunkChars, DEFAULT_CHUNK_CHARS, 'chunkChars');
    this.bom = o.bom === true;
    this.eolText = o.eol === 'lf' ? '\n' : '\r\n';
  }

  private add(text: string): void {
    this.bytes += utf8Length(text);
    if (this.bytes > this.maxBytes) throw new ExportError('LIMIT_BYTES', 'export exceeds maxBytes');
    this.parts.push(text);
    this.chars += text.length;
  }

  private take(): string | undefined {
    if (this.chars < this.chunkChars) return undefined;
    return this.flush();
  }

  /** Writes the header record (first call only). */
  header(fields: readonly string[]): string | undefined {
    this.started = true;
    if (this.bom) this.add('﻿');
    this.add(this.line(fields));
    return this.take();
  }

  /** Writes one data record; returns a chunk when the buffer is full. */
  row(fields: readonly string[]): string | undefined {
    if (!this.started) throw new ExportError('INVALID_OPTION', 'header must be written first');
    this.rows++;
    if (this.rows > this.maxRows) throw new ExportError('LIMIT_ROWS', 'export exceeds maxRows');
    this.add(this.line(fields));
    return this.take();
  }

  /** Returns any buffered text (possibly ''). */
  flush(): string {
    const out = this.parts.join('');
    this.parts = [];
    this.chars = 0;
    return out;
  }

  private line(fields: readonly string[]): string {
    // A single empty field must be quoted or the record is indistinguishable from a blank line.
    const force = fields.length === 1 && fields[0] === '';
    return fields.map((f) => quoteField(f, force)).join(',') + this.eolText;
  }
}

/** Prepared, validated configuration for ledger export. */
export class LedgerEncoder {
  readonly columns: readonly ResolvedColumn[];
  readonly writer: ChunkWriter;
  private readonly dateFormat: DateFormat;
  private readonly trim: boolean;
  private readonly policy: InvalidTextPolicy;
  private n = 0;

  constructor(o: ExportOptions = {}) {
    this.columns = resolveColumns(o.columns ?? DEFAULT_COLUMNS);
    this.writer = new ChunkWriter(o);
    this.dateFormat = o.dateFormat ?? 'iso';
    this.trim = o.trimZeros === true;
    this.policy = o.invalidText ?? 'throw';
  }

  private text(v: string, col: number): string {
    return neutralizeFormula(cleanText(v, this.policy, this.n + 1, col));
  }

  headerFields(): string[] {
    return this.columns.map((c, i) => this.text(c.header, i + 1));
  }

  rowFields(r: LedgerRow): string[] {
    this.n++;
    validateRow(r, this.n + 1);
    return this.columns.map((c, i) => {
      const col = i + 1;
      switch (c.key) {
        case 'id':
          return this.text(r.id, col);
        case 'timestamp':
          return formatTimestamp(r.timestampMs, this.dateFormat);
        case 'direction':
          return r.direction;
        case 'chain':
          return this.text(r.chain, col);
        case 'asset':
          return this.text(r.asset, col);
        case 'decimals':
          return String(r.decimals);
        case 'amount':
          return formatUnits(r.amount, r.decimals, this.trim);
        case 'signed_amount':
          return formatUnits(r.direction === 'out' ? -r.amount : r.amount, r.decimals, this.trim);
        case 'fee':
          return formatUnits(r.fee, r.decimals, this.trim);
        case 'counterparty':
          return this.text(r.counterparty, col);
        case 'tx_hash':
          return this.text(r.txHash, col);
        case 'memo':
          return this.text(r.memo, col);
        case 'status':
          return r.status;
      }
    });
  }
}

/**
 * Streams CSV chunks for `rows`. Memory is bounded by `chunkChars` plus one row.
 *
 * @security Every text cell is validated, formula-neutralised and RFC 4180
 * quoted; numeric cells come only from bigint/number formatting.
 */
export function* csvChunks(
  rows: Iterable<LedgerRow>,
  options: ExportOptions = {},
): Generator<string, void, undefined> {
  const enc = new LedgerEncoder(options);
  const first = enc.writer.header(enc.headerFields());
  if (first !== undefined) yield first;
  for (const r of rows) {
    const c = enc.writer.row(enc.rowFields(r));
    if (c !== undefined) yield c;
  }
  const rest = enc.writer.flush();
  if (rest !== '') yield rest;
}

/** Async-iterable variant of {@link csvChunks} (e.g. paged storage reads). */
export async function* csvChunksAsync(
  rows: AsyncIterable<LedgerRow> | Iterable<LedgerRow>,
  options: ExportOptions = {},
): AsyncGenerator<string, void, undefined> {
  const enc = new LedgerEncoder(options);
  const first = enc.writer.header(enc.headerFields());
  if (first !== undefined) yield first;
  for await (const r of rows) {
    const c = enc.writer.row(enc.rowFields(r));
    if (c !== undefined) yield c;
  }
  const rest = enc.writer.flush();
  if (rest !== '') yield rest;
}

/** Convenience: whole CSV as one string (subject to the same limits). */
export function exportCsv(rows: Iterable<LedgerRow>, options: ExportOptions = {}): string {
  let out = '';
  for (const c of csvChunks(rows, options)) out += c;
  return out;
}
