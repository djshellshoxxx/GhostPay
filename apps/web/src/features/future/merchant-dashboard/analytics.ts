import { assertDashboardCurrent, atomic, DashboardError, fields, integer, reference, type DashboardContext } from './model.js';
import type { DashboardProjection, DashboardState } from './projection.js';

/** Local analytics over a trusted in-memory F04 projection, never an imported bookkeeping file. */
export interface DashboardAssetAnalytics {
  readonly chainId: string;
  readonly assetId: string;
  readonly invoiceCount: number;
  readonly settledOnTimeInvoices: number;
  readonly outstandingInvoices: number;
  readonly expiredUnsettledInvoices: number;
  readonly pendingInvoices: number;
  readonly partiallyPaidInvoices: number;
  readonly latePaymentInvoices: number;
  readonly reviewRequiredInvoices: number;
  readonly expectedAtomic: string;
  /** Only provider-final, on-time evidence contributes; this is not a full-history revenue claim. */
  readonly finalAtomic: string;
  readonly pendingAtomic: string;
  readonly lateFinalAtomic: string;
}

export interface DashboardAnalytics {
  readonly schema: 'ghostpay.dashboard-analytics/1';
  readonly profileRef: string;
  readonly revision: string;
  /** Scanning completeness is not established by isolated F04 event assessments. */
  readonly coverage: 'not-evaluated';
  readonly asOfSeconds: number;
  readonly groups: readonly DashboardAssetAnalytics[];
  readonly reconciliationIssueCount: number;
}

interface Counted {
  chainId: string;
  assetId: string;
  invoiceCount: number;
  settledOnTimeInvoices: number;
  outstandingInvoices: number;
  expiredUnsettledInvoices: number;
  pendingInvoices: number;
  partiallyPaidInvoices: number;
  latePaymentInvoices: number;
  reviewRequiredInvoices: number;
  expected: bigint;
  final: bigint;
  pending: bigint;
  late: bigint;
}

const PROJECTION_KEYS = ['schema', 'profileRef', 'revision', 'coverage', 'rows', 'totals', 'issues', 'evidence'] as const;
const ROW_KEYS = [
  'invoiceRef', 'alias', 'chainId', 'assetId', 'expectedAtomic', 'expiresAt', 'state',
  'finalAtomic', 'pendingAtomic', 'lateFinalAtomic', 'evidenceRefs', 'assessmentCounts',
] as const;
const TOTAL_KEYS = ['chainId', 'assetId', 'expectedAtomic', 'finalAtomic', 'pendingAtomic', 'lateFinalAtomic', 'recordedFeesAtomic'] as const;
const STATES = new Set<DashboardState>([
  'unknown', 'unverified', 'pending', 'final', 'partial', 'late', 'overpaid', 'conflicted', 'reorged', 'reverted',
]);
const REVIEW_STATES = new Set<DashboardState>(['unknown', 'unverified', 'late', 'overpaid', 'conflicted', 'reorged', 'reverted']);
// 50,000 uint256 observation amounts cannot exceed 83 decimal digits.
const TOTAL = /^(?:0|[1-9][0-9]{0,83})(?![\s\S])/;

function invalid(): never { throw new DashboardError('INVALID_INPUT'); }
function exactTotal(value: unknown): bigint {
  if (typeof value !== 'string' || !TOTAL.test(value)) return invalid();
  return BigInt(value);
}
function denseArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max ||
      Object.getOwnPropertyNames(value).length !== value.length + 1 ||
      Object.getOwnPropertySymbols(value).length !== 0) return invalid();
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) return invalid();
    copy.push(descriptor.value as unknown);
  }
  return copy;
}
const groupKey = (chainId: string, assetId: string): string => JSON.stringify([chainId, assetId]);
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/**
 * This deliberately does not verify the chain. Its only input is the result of
 * buildDashboardProjection with an approved evidence provider, retained while unlocked.
 * The caller must discard the returned summary on lock or revision change.
 */
export function summarizeDashboardProjection(
  projection: DashboardProjection,
  asOfSeconds: number,
  context: DashboardContext,
): DashboardAnalytics {
  const head = fields(projection, PROJECTION_KEYS);
  if (head['schema'] !== 'ghostpay.dashboard-projection/1' || head['coverage'] !== 'not-evaluated') return invalid();
  const profileRef = reference(head['profileRef']);
  const revision = reference(head['revision']);
  const identity = Object.freeze({ profileRef, revision });
  assertDashboardCurrent(identity, context);
  integer(asOfSeconds);
  const rawRows = denseArray(head['rows'], 10_000);
  const groups = new Map<string, Counted>();
  const seen = new Set<string>();
  for (const raw of rawRows) {
    const row = fields(raw, ROW_KEYS);
    const invoiceRef = reference(row['invoiceRef']);
    const chainId = reference(row['chainId']);
    const assetId = reference(row['assetId']);
    if (seen.has(invoiceRef) || !STATES.has(row['state'] as DashboardState)) return invalid();
    seen.add(invoiceRef);
    const expiresAt = integer(row['expiresAt']);
    const expected = BigInt(atomic(row['expectedAtomic'], true));
    const final = exactTotal(row['finalAtomic']);
    const pending = exactTotal(row['pendingAtomic']);
    const late = exactTotal(row['lateFinalAtomic']);
    const evidenceRefs = denseArray(row['evidenceRefs'], 50_000);
    const state = row['state'] as DashboardState;
    const key = groupKey(chainId, assetId);
    const counts = groups.get(key) ?? {
      chainId, assetId, invoiceCount: 0, settledOnTimeInvoices: 0, outstandingInvoices: 0,
      expiredUnsettledInvoices: 0, pendingInvoices: 0, partiallyPaidInvoices: 0,
      latePaymentInvoices: 0, reviewRequiredInvoices: 0,
      expected: 0n, final: 0n, pending: 0n, late: 0n,
    };
    counts.invoiceCount++;
    if ((state === 'final' || state === 'overpaid') && final >= expected) counts.settledOnTimeInvoices++;
    if (final < expected) {
      if (asOfSeconds >= expiresAt) counts.expiredUnsettledInvoices++;
      else counts.outstandingInvoices++;
    }
    if (pending > 0n || state === 'pending') counts.pendingInvoices++;
    if (final > 0n && final < expected) counts.partiallyPaidInvoices++;
    if (late > 0n) counts.latePaymentInvoices++;
    if (REVIEW_STATES.has(state) && (state !== 'unknown' || evidenceRefs.length > 0)) counts.reviewRequiredInvoices++;
    counts.expected += expected; counts.final += final; counts.pending += pending; counts.late += late;
    groups.set(key, counts);
    assertDashboardCurrent(identity, context);
  }
  // A malformed or stale projection cannot silently supply inconsistent financial totals.
  const officialTotals = denseArray(head['totals'], 10_000);
  const matched = new Set<string>();
  for (const raw of officialTotals) {
    const total = fields(raw, TOTAL_KEYS);
    const chainId = reference(total['chainId']);
    const assetId = reference(total['assetId']);
    const key = groupKey(chainId, assetId);
    const group = groups.get(key);
    if (group === undefined || matched.has(key) || total['recordedFeesAtomic'] !== null ||
        exactTotal(total['expectedAtomic']) !== group.expected || exactTotal(total['finalAtomic']) !== group.final ||
        exactTotal(total['pendingAtomic']) !== group.pending || exactTotal(total['lateFinalAtomic']) !== group.late) return invalid();
    matched.add(key);
  }
  if (matched.size !== groups.size) return invalid();
  const issues = denseArray(head['issues'], 50_000);
  assertDashboardCurrent(identity, context);
  return Object.freeze({
    schema: 'ghostpay.dashboard-analytics/1', profileRef, revision, coverage: 'not-evaluated', asOfSeconds,
    reconciliationIssueCount: issues.length,
    groups: Object.freeze([...groups].sort(([a], [b]) => compare(a, b)).map(([, group]) => Object.freeze({
      chainId: group.chainId, assetId: group.assetId,
      invoiceCount: group.invoiceCount, settledOnTimeInvoices: group.settledOnTimeInvoices,
      outstandingInvoices: group.outstandingInvoices, expiredUnsettledInvoices: group.expiredUnsettledInvoices,
      pendingInvoices: group.pendingInvoices, partiallyPaidInvoices: group.partiallyPaidInvoices,
      latePaymentInvoices: group.latePaymentInvoices, reviewRequiredInvoices: group.reviewRequiredInvoices,
      expectedAtomic: group.expected.toString(), finalAtomic: group.final.toString(),
      pendingAtomic: group.pending.toString(), lateFinalAtomic: group.late.toString(),
    }))),
  });
}
