import { formatUnits } from './amount.js';
import { ChunkWriter, type ExportOptions } from './encoder.js';
import { ExportError } from './errors.js';
import { cleanText, neutralizeFormula } from './text.js';
import { assertTimestamp } from './time.js';
import { isStatus, validateRow, type LedgerRow, type LedgerStatus } from './types.js';

/** Aggregation bucket size (all UTC). `all` yields one bucket per asset. */
export type SummaryPeriod = 'day' | 'month' | 'quarter' | 'year' | 'all';

export interface SummaryOptions {
  readonly period: SummaryPeriod;
  /** Statuses to include (default `['confirmed']`). */
  readonly statuses?: readonly LedgerStatus[];
  /** Inclusive lower bound, epoch ms. */
  readonly fromMs?: number;
  /** Exclusive upper bound, epoch ms. */
  readonly toMs?: number;
}

/** Totals for one (period, asset) bucket, all in base units. */
export interface SummaryLine {
  readonly period: string;
  readonly asset: string;
  readonly decimals: number;
  readonly count: number;
  /** Sum of `amount` for direction `in`. */
  readonly received: bigint;
  /** Sum of `amount` for direction `out`. */
  readonly sent: bigint;
  /** Sum of `fee` over all included rows. */
  readonly fees: bigint;
  /** received - sent - fees. May be negative. */
  readonly net: bigint;
}

/** UTC period label for an instant. */
export function periodKey(ms: number, period: SummaryPeriod): string {
  assertTimestamp(ms);
  if (period === 'all') return 'ALL';
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = d.getUTCMonth();
  if (period === 'year') return y;
  if (period === 'quarter') return `${y}-Q${Math.floor(m / 3) + 1}`;
  const mm = String(m + 1).padStart(2, '0');
  if (period === 'month') return `${y}-${mm}`;
  return `${y}-${mm}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Acc {
  period: string;
  asset: string;
  decimals: number;
  count: number;
  received: bigint;
  sent: bigint;
  fees: bigint;
}

/**
 * Tax-report style totals per (period, asset) using bigint only.
 * Output is sorted by period then asset (code-unit order) so it is deterministic.
 *
 * @security Rows of the same asset with different `decimals` are rejected
 * (`SUMMARY_MISMATCH`) rather than silently mis-scaled and summed.
 */
export function summarize(rows: Iterable<LedgerRow>, options: SummaryOptions): SummaryLine[] {
  const statuses = options.statuses ?? ['confirmed'];
  for (const s of statuses) {
    if (!isStatus(s)) throw new ExportError('INVALID_OPTION', 'unknown status filter');
  }
  const { fromMs, toMs } = options;
  if (fromMs !== undefined) assertTimestamp(fromMs);
  if (toMs !== undefined) assertTimestamp(toMs);
  const buckets = new Map<string, Acc>();
  const assetDecimals = new Map<string, number>();
  let i = 0;
  for (const r of rows) {
    i++;
    validateRow(r, i);
    if (!statuses.includes(r.status)) continue;
    if (fromMs !== undefined && r.timestampMs < fromMs) continue;
    if (toMs !== undefined && r.timestampMs >= toMs) continue;
    const known = assetDecimals.get(r.asset);
    if (known !== undefined && known !== r.decimals) {
      throw new ExportError('SUMMARY_MISMATCH', 'same asset appears with different decimals', i);
    }
    assetDecimals.set(r.asset, r.decimals);
    const period = periodKey(r.timestampMs, options.period);
    const key = `${period}\u0000${r.asset}`;
    let a = buckets.get(key);
    if (a === undefined) {
      a = { period, asset: r.asset, decimals: r.decimals, count: 0, received: 0n, sent: 0n, fees: 0n };
      buckets.set(key, a);
    }
    a.count++;
    if (r.direction === 'in') a.received += r.amount;
    else a.sent += r.amount;
    a.fees += r.fee;
  }
  return [...buckets.values()]
    .sort((x, y) => cmp(x.period, y.period) || cmp(x.asset, y.asset))
    .map((a) => ({ ...a, net: a.received - a.sent - a.fees }));
}

/** Collapses period lines into one grand-total line per asset. */
export function totalsPerAsset(lines: readonly SummaryLine[]): SummaryLine[] {
  const m = new Map<string, SummaryLine>();
  for (const l of lines) {
    const p = m.get(l.asset);
    if (p === undefined) {
      m.set(l.asset, { ...l, period: 'TOTAL' });
      continue;
    }
    if (p.decimals !== l.decimals) {
      throw new ExportError('SUMMARY_MISMATCH', 'same asset appears with different decimals');
    }
    const received = p.received + l.received;
    const sent = p.sent + l.sent;
    const fees = p.fees + l.fees;
    m.set(l.asset, { ...p, count: p.count + l.count, received, sent, fees, net: received - sent - fees });
  }
  return [...m.values()].sort((a, b) => cmp(a.asset, b.asset));
}

const SUMMARY_HEADERS = ['period', 'asset', 'decimals', 'count', 'received', 'sent', 'fees', 'net'] as const;

/**
 * Renders summary lines as CSV using the same quoting/neutralisation/limits as
 * ledger export. Only `bom`, `eol`, `trimZeros`, limits and `invalidText` apply.
 */
export function summaryToCsv(lines: readonly SummaryLine[], options: ExportOptions = {}): string {
  const w = new ChunkWriter(options);
  const policy = options.invalidText ?? 'throw';
  const trim = options.trimZeros === true;
  let out = w.header([...SUMMARY_HEADERS]) ?? '';
  let n = 1;
  for (const l of lines) {
    n++;
    const f = [
      neutralizeFormula(cleanText(l.period, policy, n, 1)),
      neutralizeFormula(cleanText(l.asset, policy, n, 2)),
      String(l.decimals),
      String(l.count),
      formatUnits(l.received, l.decimals, trim),
      formatUnits(l.sent, l.decimals, trim),
      formatUnits(l.fees, l.decimals, trim),
      formatUnits(l.net, l.decimals, trim),
    ];
    out += w.row(f) ?? '';
  }
  return out + w.flush();
}
