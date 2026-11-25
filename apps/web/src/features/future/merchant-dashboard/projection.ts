import {
  assertDashboardCurrent, DashboardError, decodeDashboardSnapshot, fields, reference,
  type DashboardContext, type DashboardEvidenceClaim, type DashboardInvoice, type DashboardObservation,
  type EvidenceAssessment, type EvidenceKind,
} from './model';

export type DashboardState = EvidenceKind | 'partial' | 'late' | 'overpaid' | 'conflicted';
export type DashboardIssueCode = 'UNLINKED' | 'UNKNOWN_INVOICE' | 'ASSET_MISMATCH' | 'CONFLICTING_EVIDENCE' | 'MISSING_AMOUNT' | 'ASSESSMENT_UNAVAILABLE';

export interface DashboardRow extends DashboardInvoice {
  readonly state: DashboardState;
  /** Only explicitly bound, provider-final observations before expiry contribute here. */
  readonly finalAtomic: string;
  readonly pendingAtomic: string;
  readonly lateFinalAtomic: string;
  readonly evidenceRefs: readonly string[];
  readonly assessmentCounts: Readonly<Record<EvidenceKind, number>>;
}

export interface DashboardTotals {
  readonly chainId: string;
  readonly assetId: string;
  readonly expectedAtomic: string;
  readonly finalAtomic: string;
  readonly pendingAtomic: string;
  readonly lateFinalAtomic: string;
  /** This projection has no fee evidence; unavailable never becomes zero. */
  readonly recordedFeesAtomic: null;
}

export interface DashboardProjection {
  readonly schema: 'ghostpay.dashboard-projection/1';
  readonly profileRef: string;
  readonly revision: string;
  /** Per-event assessments establish no completeness claim about the merchant's history. */
  readonly coverage: 'not-evaluated';
  readonly rows: readonly DashboardRow[];
  readonly totals: readonly DashboardTotals[];
  readonly issues: readonly { readonly code: DashboardIssueCode; readonly evidenceRefs: readonly string[] }[];
  readonly evidence: readonly {
    readonly identity: string;
    readonly evidenceRefs: readonly string[];
    readonly invoiceRef: string | null;
    readonly amountAtomic: string | null;
    readonly kind: EvidenceKind | 'conflicted' | 'unmatched';
    readonly proofRef: string | null;
  }[];
}

export interface DashboardEvidenceProvider {
  /** Pure canonical-event lookup into an approved adapter's current evidence. Must not perform I/O. */
  readonly assess: (claim: DashboardEvidenceClaim, invoice: DashboardInvoice) => EvidenceAssessment;
}

interface Group {
  readonly observation: DashboardObservation;
  readonly signature: string;
  readonly refs: Set<string>;
  readonly invoices: Set<string>;
  conflict: boolean;
}

interface WorkingRow {
  readonly invoice: DashboardInvoice;
  readonly refs: Set<string>;
  readonly counts: Record<EvidenceKind, number>;
  final: bigint;
  pending: bigint;
  late: bigint;
  conflict: boolean;
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const identity = (value: DashboardObservation): string => JSON.stringify([value.chainId, value.transactionHash, value.position]);
const signature = (value: DashboardObservation): string => JSON.stringify([value.invoiceRef, value.assetId, value.amountAtomic, value.observedAt]);
const freezeRefs = (refs: Set<string>): readonly string[] => Object.freeze([...refs].sort(compare));

function assessment(provider: DashboardEvidenceProvider | undefined, observation: DashboardObservation, invoice: DashboardInvoice): { kind: EvidenceKind; proofRef: string | null; unavailable: boolean } {
  if (provider === undefined) return { kind: 'unverified', proofRef: null, unavailable: false };
  try {
    const claim = Object.freeze({ invoiceRef: observation.invoiceRef, chainId: observation.chainId, assetId: observation.assetId,
      transactionHash: observation.transactionHash, position: observation.position, amountAtomic: observation.amountAtomic, observedAt: observation.observedAt });
    const raw: unknown = provider.assess(claim, invoice);
    if (raw === null || typeof raw !== 'object') throw new DashboardError('INVALID_INPUT');
    const descriptor = Object.getOwnPropertyDescriptor(raw, 'kind');
    const kind: unknown = descriptor?.value;
    if (kind === 'unknown' || kind === 'unverified' || kind === 'reorged' || kind === 'reverted') {
      fields(raw, ['kind']);
      return { kind, proofRef: null, unavailable: false };
    }
    if (kind !== 'pending' && kind !== 'final') throw new DashboardError('INVALID_INPUT');
    const row = fields(raw, ['kind', 'invoiceRef', 'chainId', 'assetId', 'transactionHash', 'position', 'amountAtomic', 'observedAt', 'expectedAtomic', 'expiresAt', 'proofRef']);
    for (const key of ['invoiceRef', 'chainId', 'assetId', 'transactionHash', 'position', 'amountAtomic', 'observedAt'] as const) {
      if (row[key] !== observation[key]) throw new DashboardError('INVALID_INPUT');
    }
    if (row['expectedAtomic'] !== invoice.expectedAtomic || row['expiresAt'] !== invoice.expiresAt) throw new DashboardError('INVALID_INPUT');
    return { kind, proofRef: reference(row['proofRef']), unavailable: false };
  } catch {
    return { kind: 'unknown', proofRef: null, unavailable: true };
  }
}

function state(row: WorkingRow): DashboardState {
  if (row.conflict) return 'conflicted';
  const due = BigInt(row.invoice.expectedAtomic);
  if (row.final > due) return 'overpaid';
  if (row.final === due) return 'final';
  if (row.pending > 0n) return 'pending';
  if (row.final > 0n) return 'partial';
  if (row.late > 0n) return 'late';
  if (row.counts.reorged > 0) return 'reorged';
  if (row.counts.unknown > 0) return 'unknown';
  if (row.counts.unverified > 0) return 'unverified';
  if (row.counts.reverted > 0) return 'reverted';
  return 'unknown';
}

/**
 * Build a disposable local view. Imports cannot assert finality; only the separately injected
 * provider can assess a bound observation. This does not itself verify a chain or a receipt.
 * Every 256 records yields to the host so lock/cancel can revoke a large rebuild.
 */
export async function buildDashboardProjection(
  input: unknown,
  provider: DashboardEvidenceProvider | undefined,
  context: DashboardContext,
  yieldToHost: () => Promise<void> = () => new Promise((resolve) => { setTimeout(resolve, 0); }),
): Promise<DashboardProjection> {
  context = Object.freeze({ ...context });
  if (context.signal.aborted) throw new DashboardError('CANCELLED');
  const snapshot = decodeDashboardSnapshot(input);
  assertDashboardCurrent(snapshot, context);
  let visited = 0;
  const checkpoint = async (): Promise<void> => {
    assertDashboardCurrent(snapshot, context);
    if (++visited % 256 === 0) {
      await yieldToHost();
      assertDashboardCurrent(snapshot, context);
    }
  };
  const groups = new Map<string, Group>();
  const seenRefs = new Map<string, string>();
  for (const observation of snapshot.observations) {
    await checkpoint();
    const id = identity(observation);
    const previous = seenRefs.get(observation.evidenceRef);
    if (previous !== undefined && previous !== id) throw new DashboardError('DUPLICATE_REFERENCE');
    seenRefs.set(observation.evidenceRef, id);
    const existing = groups.get(id);
    if (existing === undefined) {
      groups.set(id, { observation, signature: signature(observation), refs: new Set([observation.evidenceRef]),
        invoices: new Set(observation.invoiceRef === null ? [] : [observation.invoiceRef]), conflict: false });
    } else {
      existing.refs.add(observation.evidenceRef);
      if (observation.invoiceRef !== null) existing.invoices.add(observation.invoiceRef);
      if (existing.signature !== signature(observation)) existing.conflict = true;
    }
  }
  const rows = new Map<string, WorkingRow>(snapshot.invoices.map((invoice) => [invoice.invoiceRef, {
    invoice, refs: new Set<string>(), counts: { unverified: 0, unknown: 0, pending: 0, final: 0, reorged: 0, reverted: 0 },
    final: 0n, pending: 0n, late: 0n, conflict: false,
  }]));
  const issues: DashboardProjection['issues'][number][] = [];
  const evidence: DashboardProjection['evidence'][number][] = [];
  for (const [id, group] of [...groups].sort(([a], [b]) => compare(a, b))) {
    await checkpoint();
    const { observation } = group;
    const evidenceRefs = freezeRefs(group.refs);
    const issue = (code: DashboardIssueCode): void => { issues.push(Object.freeze({ code, evidenceRefs })); };
    const record = (kind: DashboardProjection['evidence'][number]['kind'], proofRef: string | null = null): void => {
      evidence.push(Object.freeze({ identity: id, evidenceRefs, invoiceRef: kind === 'conflicted' ? null : observation.invoiceRef,
        amountAtomic: kind === 'conflicted' ? null : observation.amountAtomic, kind, proofRef }));
    };
    if (group.conflict) {
      issue('CONFLICTING_EVIDENCE');
      for (const invoiceRef of group.invoices) {
        const row = rows.get(invoiceRef);
        if (row !== undefined) { row.conflict = true; for (const ref of group.refs) row.refs.add(ref); }
      }
      record('conflicted');
      continue;
    }
    const row = observation.invoiceRef === null ? undefined : rows.get(observation.invoiceRef);
    if (row === undefined) { issue(observation.invoiceRef === null ? 'UNLINKED' : 'UNKNOWN_INVOICE'); record('unmatched'); continue; }
    for (const ref of group.refs) row.refs.add(ref);
    if (row.invoice.chainId !== observation.chainId || row.invoice.assetId !== observation.assetId) {
      issue('ASSET_MISMATCH'); row.conflict = true; record('conflicted'); continue;
    }
    if (observation.amountAtomic === null) { issue('MISSING_AMOUNT'); row.counts.unknown++; record('unknown'); continue; }
    const verdict = assessment(provider, observation, row.invoice);
    assertDashboardCurrent(snapshot, context);
    if (verdict.unavailable) issue('ASSESSMENT_UNAVAILABLE');
    row.counts[verdict.kind]++;
    if (verdict.kind === 'final') {
      if (observation.observedAt < row.invoice.expiresAt) row.final += BigInt(observation.amountAtomic);
      else row.late += BigInt(observation.amountAtomic);
    } else if (verdict.kind === 'pending') row.pending += BigInt(observation.amountAtomic);
    record(verdict.kind, verdict.proofRef);
  }
  const resultRows = [...rows.values()].sort((a, b) => compare(a.invoice.invoiceRef, b.invoice.invoiceRef)).map((row) => Object.freeze({
    ...row.invoice, state: state(row), finalAtomic: row.final.toString(), pendingAtomic: row.pending.toString(),
    lateFinalAtomic: row.late.toString(), evidenceRefs: freezeRefs(row.refs), assessmentCounts: Object.freeze(row.counts),
  }));
  const totals = new Map<string, { chainId: string; assetId: string; expected: bigint; final: bigint; pending: bigint; late: bigint }>();
  for (const row of resultRows) {
    const key = JSON.stringify([row.chainId, row.assetId]);
    const sum = totals.get(key) ?? { chainId: row.chainId, assetId: row.assetId, expected: 0n, final: 0n, pending: 0n, late: 0n };
    sum.expected += BigInt(row.expectedAtomic); sum.final += BigInt(row.finalAtomic);
    sum.pending += BigInt(row.pendingAtomic); sum.late += BigInt(row.lateFinalAtomic);
    totals.set(key, sum);
  }
  assertDashboardCurrent(snapshot, context);
  return Object.freeze({ schema: 'ghostpay.dashboard-projection/1', profileRef: snapshot.profileRef, revision: snapshot.revision, coverage: 'not-evaluated',
    rows: Object.freeze(resultRows), issues: Object.freeze(issues), evidence: Object.freeze(evidence),
    totals: Object.freeze([...totals].sort(([a], [b]) => compare(a, b)).map(([, sum]) => Object.freeze({
      chainId: sum.chainId, assetId: sum.assetId, expectedAtomic: sum.expected.toString(), finalAtomic: sum.final.toString(),
      pendingAtomic: sum.pending.toString(), lateFinalAtomic: sum.late.toString(), recordedFeesAtomic: null,
    }))),
  });
}
