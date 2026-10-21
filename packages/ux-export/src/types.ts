import { ExportError } from './errors.js';
import { MAX_AMOUNT, assertDecimals } from './amount.js';
import { assertTimestamp } from './time.js';

/** Settlement status of a ledger row. */
export type LedgerStatus = 'pending' | 'confirmed' | 'failed';
/** Direction relative to the user's wallet. */
export type LedgerDirection = 'in' | 'out';

/**
 * One payment-history row. Amounts are unsigned bigint base units; sign is
 * carried by `direction`. All data is local; nothing here is fetched.
 */
export interface LedgerRow {
  readonly id: string;
  /** Epoch milliseconds (UTC). */
  readonly timestampMs: number;
  readonly direction: LedgerDirection;
  readonly chain: string;
  readonly asset: string;
  readonly decimals: number;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly counterparty: string;
  readonly txHash: string;
  readonly memo: string;
  readonly status: LedgerStatus;
}

/** Column identifiers (CSV header defaults are the snake_case names). */
export type ColumnKey =
  | 'id'
  | 'timestamp'
  | 'direction'
  | 'chain'
  | 'asset'
  | 'decimals'
  | 'amount'
  | 'signed_amount'
  | 'fee'
  | 'counterparty'
  | 'tx_hash'
  | 'memo'
  | 'status';

/** A column key, or a key with a custom header label. */
export type ColumnSpec = ColumnKey | { readonly key: ColumnKey; readonly header: string };

export const ALL_COLUMNS: readonly ColumnKey[] = [
  'id',
  'timestamp',
  'direction',
  'chain',
  'asset',
  'decimals',
  'amount',
  'signed_amount',
  'fee',
  'counterparty',
  'tx_hash',
  'memo',
  'status',
];

/** Default export/import column set (round-trips every LedgerRow field). */
export const DEFAULT_COLUMNS: readonly ColumnSpec[] = [
  'id',
  'timestamp',
  'direction',
  'chain',
  'asset',
  'decimals',
  'amount',
  'fee',
  'counterparty',
  'tx_hash',
  'memo',
  'status',
];

/** Columns generated from validated numbers/bigints; exempt from formula guard. */
export const NUMERIC_COLUMNS: ReadonlySet<ColumnKey> = new Set<ColumnKey>([
  'timestamp',
  'decimals',
  'amount',
  'signed_amount',
  'fee',
]);

export interface ResolvedColumn {
  readonly key: ColumnKey;
  readonly header: string;
}

/** Validates a column list: known keys, no duplicate keys or headers, non-empty. */
export function resolveColumns(specs: readonly ColumnSpec[]): ResolvedColumn[] {
  if (specs.length === 0 || specs.length > ALL_COLUMNS.length) {
    throw new ExportError('INVALID_OPTION', 'columns must contain 1..13 entries');
  }
  const keys = new Set<string>();
  const headers = new Set<string>();
  return specs.map((s) => {
    const key = typeof s === 'string' ? s : s.key;
    const header = typeof s === 'string' ? s : s.header;
    if (!ALL_COLUMNS.includes(key)) throw new ExportError('INVALID_OPTION', 'unknown column key');
    if (header === '' || header.length > 64)
      throw new ExportError('INVALID_OPTION', 'header must be 1..64 chars');
    if (keys.has(key) || headers.has(header)) throw new ExportError('INVALID_OPTION', 'duplicate column');
    keys.add(key);
    headers.add(header);
    return { key, header };
  });
}

const DIRECTIONS: readonly string[] = ['in', 'out'];
const STATUSES: readonly string[] = ['pending', 'confirmed', 'failed'];

export function isDirection(v: string): v is LedgerDirection {
  return DIRECTIONS.includes(v);
}
export function isStatus(v: string): v is LedgerStatus {
  return STATUSES.includes(v);
}

/** Runtime validation of a row (inputs may come from untyped storage). */
export function validateRow(r: LedgerRow, index: number): void {
  const bad = (m: string): never => {
    throw new ExportError('INVALID_ROW', m, index);
  };
  for (const k of ['id', 'chain', 'asset', 'counterparty', 'txHash', 'memo'] as const) {
    if (typeof r[k] !== 'string') bad(`field ${k} must be a string`);
  }
  if (r.id === '' || r.asset === '') bad('id and asset must be non-empty');
  if (!isDirection(r.direction)) bad('invalid direction');
  if (!isStatus(r.status)) bad('invalid status');
  if (typeof r.amount !== 'bigint' || r.amount < 0n || r.amount > MAX_AMOUNT)
    bad('amount must be bigint in 0..2^256-1');
  if (typeof r.fee !== 'bigint' || r.fee < 0n || r.fee > MAX_AMOUNT) bad('fee must be bigint in 0..2^256-1');
  try {
    assertDecimals(r.decimals);
    assertTimestamp(r.timestampMs);
  } catch {
    bad('invalid decimals or timestamp');
  }
}
