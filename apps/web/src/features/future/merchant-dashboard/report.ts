import { csvCell } from './export';
import { assetId, observationTime, type InvoiceState, type LedgerObservation, type ObservationState } from './ledger';
import { DashboardError } from './model';
import type { DashboardRow } from './projection';

/** Merchant reporting over one filtered dashboard view. All amounts are exact atomic units as decimal strings. */
export interface DashboardAssetReport {
  readonly assetId: string;
  readonly invoiceCount: number;
  readonly expectedAtomic: string;
  /** Observations verified at scan time, not imported, not invalidated by a reorg and not conflicting. */
  readonly verifiedPayments: number;
  readonly verifiedAtomic: string;
  /** The part of verifiedAtomic the seller associated locally with a registered invoice of the same asset. */
  readonly linkedVerifiedAtomic: string;
}

export interface DashboardReport {
  readonly assets: readonly DashboardAssetReport[];
  /** Imported, reorg-invalidated and conflicting observations: never part of any total. */
  readonly excludedPayments: number;
  readonly invoiceStates: Readonly<Record<InvoiceState, number>>;
  readonly paymentStates: Readonly<Record<ObservationState, number>>;
}

export interface ReportInvoice {
  readonly row: DashboardRow;
  readonly state: InvoiceState;
}

const ATOMIC = /^(?:0|[1-9][0-9]{0,99})(?![\s\S])/;
function atomic(value: string): bigint {
  if (!ATOMIC.test(value)) throw new DashboardError('INVALID_INPUT');
  return BigInt(value);
}
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Asset choices for the filter: invoice assets plus assets of non-conflicting observations. */
export function dashboardAssetIds(rows: readonly DashboardRow[], payments: readonly LedgerObservation[]): readonly string[] {
  const assets = new Set(rows.map((row) => row.assetId));
  for (const { record, state } of payments) if (state !== 'ambiguous') assets.add(assetId(record.asset));
  return [...assets].sort(byText);
}

export function buildDashboardReport(
  invoices: readonly ReportInvoice[],
  payments: readonly LedgerObservation[],
  registered: readonly DashboardRow[] = invoices.map(({ row }) => row),
): DashboardReport {
  const invoiceStates: Record<InvoiceState, number> = { open: 0, expired: 0, late: 0, ambiguous: 0, reorged: 0 };
  const paymentStates: Record<ObservationState, number> = { historical: 0, imported: 0, reorged: 0, ambiguous: 0 };
  const groups = new Map<string, { invoiceCount: number; expected: bigint; verifiedPayments: number; verified: bigint; linked: bigint }>();
  const group = (id: string) => {
    let entry = groups.get(id);
    if (entry === undefined) {
      entry = { invoiceCount: 0, expected: 0n, verifiedPayments: 0, verified: 0n, linked: 0n };
      groups.set(id, entry);
    }
    return entry;
  };
  for (const { row, state } of invoices) {
    invoiceStates[state]++;
    const entry = group(row.assetId);
    entry.invoiceCount++;
    entry.expected += atomic(row.expectedAtomic);
  }
  const invoiceAssets = new Map(registered.map((row) => [row.invoiceRef, row.assetId]));
  let excludedPayments = 0;
  for (const { record, state, invoiceRefs } of payments) {
    paymentStates[state]++;
    if (state !== 'historical') {
      excludedPayments++;
      continue;
    }
    const id = assetId(record.asset);
    const amount = atomic(record.amountMinorUnits);
    const entry = group(id);
    entry.verifiedPayments++;
    entry.verified += amount;
    if (invoiceRefs.some((ref) => invoiceAssets.get(ref) === id)) entry.linked += amount;
  }
  const assets = [...groups].sort(([a], [b]) => byText(a, b)).map(([id, entry]) => ({
    assetId: id, invoiceCount: entry.invoiceCount, expectedAtomic: entry.expected.toString(),
    verifiedPayments: entry.verifiedPayments, verifiedAtomic: entry.verified.toString(),
    linkedVerifiedAtomic: entry.linked.toString(),
  }));
  return { assets, excludedPayments, invoiceStates, paymentStates };
}

export const PAYMENT_HISTORY_COLUMNS = Object.freeze([
  'chainId', 'assetId', 'status', 'includedAtUtc', 'blockNumber', 'amountAtomic', 'transactionHash', 'logIndex',
  'localInvoiceRefs',
] as const);

/**
 * Transaction history as CSV. Conflicting copies withhold amount, asset, block and time, as the dashboard does.
 * The stealth address and keys are never written; the transaction hash identifies the payment on-chain.
 */
export function buildPaymentHistoryCsv(
  payments: readonly LedgerObservation[],
  chain: number,
): { readonly content: string; readonly mimeType: string } {
  const lines = [PAYMENT_HISTORY_COLUMNS.map(csvCell).join(',')];
  for (const { record, state, invoiceRefs } of payments) {
    const trusted = state !== 'ambiguous';
    const seconds = trusted ? observationTime(record) : undefined;
    const cells = [
      'eip155:' + chain,
      trusted ? assetId(record.asset) : '',
      state,
      seconds === undefined ? '' : new Date(seconds * 1000).toISOString(),
      trusted ? record.blockNumber : '',
      trusted ? atomic(record.amountMinorUnits).toString() : '',
      record.transactionHash,
      String(record.logIndex),
      invoiceRefs.join('; '),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return { content: lines.join('\r\n') + '\r\n', mimeType: 'text/csv;charset=utf-8' };
}
