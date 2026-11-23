import type { ReconciliationState, VaultRecord } from '../../../lib/reconciliationVault';
import { buildDashboardProjection, type DashboardEvidenceProvider, type DashboardProjection, type DashboardRow } from './projection';
import { DASHBOARD_MAX_DATE_SECONDS, type DashboardContext, type DashboardObservation } from './model';

export const assetId = (asset: string): string => asset === 'native' ? asset : 'erc20:' + asset;

export type ObservationState = 'historical' | 'imported' | 'reorged' | 'ambiguous';
export type InvoiceState = 'open' | 'expired' | 'ambiguous' | 'late' | 'reorged';
export interface LedgerObservation {
  readonly record: VaultRecord;
  readonly state: ObservationState;
  readonly invoiceRefs: readonly string[];
}

export function observationTime(record: VaultRecord): number | undefined {
  if (record.blockTimestamp === undefined || !/^[0-9]+$/.test(record.blockTimestamp)) return undefined;
  const seconds = Number(record.blockTimestamp);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= DASHBOARD_MAX_DATE_SECONDS ? seconds : undefined;
}

export async function readMerchantDashboard(
  state: ReconciliationState,
  chain: number,
  seller: string,
  context: DashboardContext,
): Promise<{ readonly projection: DashboardProjection; readonly payments: readonly LedgerObservation[] }> {
  const { profileRef, revision } = context.current();
  const chainId = 'eip155:' + chain;
  const invoices = state.invoices.filter((invoice) => invoice.chainId === chain).map((invoice) => ({
    invoiceRef: invoice.invoiceDigest, alias: '', chainId, assetId: assetId(invoice.asset),
    expectedAtomic: invoice.expectedNetMinorUnits, expiresAt: invoice.expiresAt,
  }));
  const observations = new Map<string, LedgerObservation>();
  for (const record of state.records) {
    if (record.chainId !== chain || record.sellerKeyId !== seller) continue;
    const identity = record.transactionHash + ':' + record.logIndex;
    const existing = observations.get(identity);
    const invoiceRefs = new Set(existing?.invoiceRefs);
    if (record.invoiceDigest !== undefined) invoiceRefs.add(record.invoiceDigest);
    const kind: ObservationState = record.evidenceStatus === 'invalidated-after-reorg' ? 'reorged'
      : record.provenance === 'imported-history' ? 'imported' : 'historical';
    if (existing === undefined) {
      observations.set(identity, { record, state: kind, invoiceRefs: [...invoiceRefs] });
    } else if (existing.record.id !== record.id || existing.record.amountMinorUnits !== record.amountMinorUnits ||
               existing.record.asset !== record.asset || existing.record.blockTimestamp !== record.blockTimestamp ||
               existing.record.invoiceDigest !== record.invoiceDigest || existing.state !== kind) {
      observations.set(identity, { record: existing.record, state: 'ambiguous', invoiceRefs: [...invoiceRefs] });
    }
  }
  const claims: DashboardObservation[] = [];
  const invalidated = new Set<string>();
  const registered = new Set(invoices.map(({ invoiceRef }) => invoiceRef));
  for (const [identity, entry] of observations) {
    const { record } = entry;
    const observedAt = observationTime(record);
    if (entry.state === 'ambiguous' || observedAt === undefined || record.logIndex > 0xffff_ffff) continue;
    if (entry.state === 'reorged') invalidated.add(identity);
    const linked = record.invoiceDigest;
    claims.push({
      evidenceRef: identity, invoiceRef: linked !== undefined && registered.has(linked) ? linked : null,
      chainId, assetId: assetId(record.asset), transactionHash: record.transactionHash, position: record.logIndex,
      amountAtomic: record.amountMinorUnits, observedAt,
    });
  }
  // The encrypted ledger supplies local reorg invalidations only. Historical scan status and seller links
  // cannot establish current canonicality or invoice attribution, so this adapter cannot emit pending/final.
  const provider: DashboardEvidenceProvider = {
    assess: (claim) => ({ kind: invalidated.has(claim.transactionHash + ':' + claim.position) ? 'reorged' : 'unverified' }),
  };
  const projection = await buildDashboardProjection({
    schema: 'ghostpay.dashboard-input/1', profileRef, revision, invoices, observations: claims,
  }, provider, context);
  return { projection, payments: [...observations.values()] };
}

export function invoiceState(row: DashboardRow, observations: readonly LedgerObservation[], now: number): InvoiceState {
  if (observations.some((entry) => entry.state === 'ambiguous' || assetId(entry.record.asset) !== row.assetId)) return 'ambiguous';
  const historical = observations.filter((entry) => entry.state === 'historical');
  if (historical.some(({ record }) => (observationTime(record) ?? -1) >= row.expiresAt)) return 'late';
  if (historical.length > 0 || observations.some((entry) => entry.state === 'imported')) return 'ambiguous';
  if (observations.some((entry) => entry.state === 'reorged')) return 'reorged';
  return now >= row.expiresAt ? 'expired' : 'open';
}

/** Include both calendar dates, interpreted in UTC, with a half-open upper bound. */
export function utcRange(from: string, through: string): readonly [number, number] | undefined {
  const parse = (value: string): number => {
    if (!/^\d{4,6}-\d{2}-\d{2}(?![\s\S])/.test(value)) return NaN;
    const [year, month, day] = value.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined || year === 0) return NaN;
    const date = new Date(0);
    const ms = date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? ms / 1000 : NaN;
  };
  const start = from === '' ? 0 : parse(from);
  const end = through === '' ? Infinity : parse(through) + 86_400;
  return start < end ? [start, end] : undefined;
}
