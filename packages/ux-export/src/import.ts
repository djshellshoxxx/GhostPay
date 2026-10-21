import { parseUnits } from './amount.js';
import { ExportError } from './errors.js';
import { assertRectangular, parseCsv, PARSE_DEFAULTS, type ParseLimits } from './parser.js';
import { unneutralizeFormula } from './text.js';
import { parseTimestamp, type DateFormat } from './time.js';
import {
  DEFAULT_COLUMNS,
  isDirection,
  isStatus,
  resolveColumns,
  validateRow,
  type ColumnKey,
  type ColumnSpec,
  type LedgerDirection,
  type LedgerRow,
} from './types.js';

export interface ImportOptions extends ParseLimits {
  /** Expected columns; the header row must match exactly (default {@link DEFAULT_COLUMNS}). */
  readonly columns?: readonly ColumnSpec[];
  /** Date format of the `timestamp` column (default `iso`). */
  readonly dateFormat?: DateFormat;
  /** Decimals per asset, used when there is no `decimals` column. */
  readonly assetDecimals?: ReadonlyMap<string, number>;
  /** Reverse the formula guard on text cells (default true). */
  readonly unneutralize?: boolean;
  /** Reject repeated `id` values (default true). */
  readonly rejectDuplicateIds?: boolean;
}

/**
 * Strictly parses CSV produced by this package back into ledger rows.
 *
 * Requirements: header equals the configured columns (order and labels);
 * columns `id`, `timestamp`, `asset` and either `amount`+`direction` or
 * `signed_amount`; amounts must fit the asset's decimals exactly.
 * If both `amount` and `signed_amount` appear they must agree.
 *
 * @security Untrusted input. Every cell is validated against a closed grammar
 * (enum, strict decimal, strict UTC date) and the result passes the same
 * `validateRow` as export. Errors carry positions, never cell contents.
 */
export function parseLedgerCsv(text: string, options: ImportOptions = {}): LedgerRow[] {
  const cols = resolveColumns(options.columns ?? DEFAULT_COLUMNS);
  const keys = new Set<ColumnKey>(cols.map((c) => c.key));
  const need = (k: ColumnKey): void => {
    if (!keys.has(k)) throw new ExportError('INVALID_OPTION', `columns must include ${k}`);
  };
  need('id');
  need('timestamp');
  need('asset');
  if (!keys.has('signed_amount')) {
    need('amount');
    need('direction');
  }
  if (!keys.has('decimals') && options.assetDecimals === undefined) {
    throw new ExportError('INVALID_OPTION', 'need a decimals column or assetDecimals');
  }

  const records = parseCsv(text, { ...options, maxRows: (options.maxRows ?? PARSE_DEFAULTS.maxRows - 1) + 1 });
  if (records.length === 0) throw new ExportError('PARSE_HEADER', 'empty input; header row required');
  assertRectangular(records);
  const un = options.unneutralize !== false;
  const txt = (s: string): string => (un ? unneutralizeFormula(s) : s);

  const header = records[0] ?? [];
  cols.forEach((c, i) => {
    if (txt(header[i] ?? '') !== c.header) throw new ExportError('PARSE_HEADER', 'header does not match columns', 1, i + 1);
  });
  if (header.length !== cols.length) throw new ExportError('PARSE_HEADER', 'header has wrong number of columns', 1);

  const dateFormat = options.dateFormat ?? 'iso';
  const seen = new Set<string>();
  const out: LedgerRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r] ?? [];
    const rowNo = r + 1;
    const get = (k: ColumnKey): { v: string; col: number } | undefined => {
      const idx = cols.findIndex((c) => c.key === k);
      return idx === -1 ? undefined : { v: rec[idx] ?? '', col: idx + 1 };
    };
    const wrap = <T>(k: ColumnKey, f: (v: string) => T): T => {
      const cell = get(k);
      /* c8 ignore next */
      if (cell === undefined) throw new ExportError('PARSE_VALUE', 'missing column', rowNo);
      try {
        return f(cell.v);
      } catch (e) {
        if (e instanceof ExportError) throw new ExportError('PARSE_VALUE', e.message, rowNo, cell.col);
        /* c8 ignore next */
        throw e;
      }
    };
    const fail = (k: ColumnKey, m: string): never => {
      throw new ExportError('PARSE_VALUE', m, rowNo, get(k)?.col);
    };
    const optText = (k: ColumnKey): string => {
      const c = get(k);
      return c === undefined ? '' : txt(c.v);
    };

    const asset = wrap('asset', (v) => txt(v));
    if (asset === '') fail('asset', 'asset must be non-empty');
    const id = wrap('id', (v) => txt(v));
    if (id === '') fail('id', 'id must be non-empty');
    if (options.rejectDuplicateIds !== false) {
      if (seen.has(id)) throw new ExportError('PARSE_DUPLICATE', 'duplicate id', rowNo, get('id')?.col);
      seen.add(id);
    }

    let decimals: number;
    if (keys.has('decimals')) {
      decimals = wrap('decimals', (v) => {
        if (!/^(0|[1-9][0-9]?)$/.test(v)) throw new ExportError('INVALID_AMOUNT', 'decimals not a plain integer');
        return Number(v);
      });
      const expected = options.assetDecimals?.get(asset);
      if (expected !== undefined && expected !== decimals) fail('decimals', 'decimals disagree with assetDecimals');
    } else {
      const d = options.assetDecimals?.get(asset);
      if (d === undefined) fail('asset', 'no decimals known for asset');
      decimals = d as number;
    }

    let direction: LedgerDirection | undefined;
    if (keys.has('direction')) {
      direction = wrap('direction', (v) => {
        if (!isDirection(v)) throw new ExportError('PARSE_VALUE', 'direction must be in or out');
        return v;
      });
    }
    let amount: bigint | undefined;
    if (keys.has('amount')) amount = wrap('amount', (v) => parseUnits(v, decimals));
    if (keys.has('signed_amount')) {
      const { dir, abs } = wrap('signed_amount', (v) => {
        const neg = v.startsWith('-');
        const a = parseUnits(neg ? v.slice(1) : v, decimals);
        if (neg && a === 0n) throw new ExportError('INVALID_AMOUNT', 'negative zero');
        return { dir: neg ? ('out' as const) : ('in' as const), abs: a };
      });
      // zero amounts carry no sign, so only non-zero amounts can contradict `direction`
      if (direction !== undefined && abs !== 0n && dir !== direction) {
        fail('signed_amount', 'sign disagrees with direction');
      }
      if (amount !== undefined && amount !== abs) fail('signed_amount', 'signed_amount disagrees with amount');
      direction ??= dir;
      amount ??= abs;
    }
    /* c8 ignore next */
    if (direction === undefined || amount === undefined) throw new ExportError('PARSE_VALUE', 'cannot determine amount', rowNo);

    const fee = keys.has('fee') ? wrap('fee', (v) => parseUnits(v, decimals)) : 0n;
    const timestampMs = wrap('timestamp', (v) => parseTimestamp(v, dateFormat));
    const status = keys.has('status')
      ? wrap('status', (v) => {
          if (!isStatus(v)) throw new ExportError('PARSE_VALUE', 'invalid status');
          return v;
        })
      : 'confirmed';

    const row: LedgerRow = {
      id,
      timestampMs,
      direction,
      chain: optText('chain'),
      asset,
      decimals,
      amount,
      fee,
      counterparty: optText('counterparty'),
      txHash: optText('tx_hash'),
      memo: optText('memo'),
      status,
    };
    validateRow(row, rowNo);
    out.push(row);
  }
  return out;
}
