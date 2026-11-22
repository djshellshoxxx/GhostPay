import { describe, expect, it } from 'vitest';
import { summarizeDashboardProjection } from './analytics';
import { buildDashboardProjection } from './projection';
import { DashboardError, type DashboardContext, type DashboardEvidenceClaim, type DashboardInvoice, type DashboardObservation } from './model';

const makeInvoice = (invoiceRef: string, patch: Partial<DashboardInvoice> = {}): DashboardInvoice => ({
  invoiceRef, alias: 'Invoice ' + invoiceRef, chainId: 'eip155:1', assetId: 'native',
  expectedAtomic: '100', expiresAt: 2_000, ...patch,
});
const makeObservation = (invoiceRef: string, position: number, amountAtomic: string, patch: Partial<DashboardObservation> = {}): DashboardObservation => ({
  evidenceRef: 'evidence:' + position, invoiceRef, chainId: 'eip155:1', assetId: 'native',
  transactionHash: '0x' + 'a'.repeat(64), position, amountAtomic, observedAt: 1_000, ...patch,
});
function session() {
  const controller = new AbortController();
  const live = { operationId: 'operation:1', sessionEpoch: 1, profileRef: 'profile:1', revision: 'revision:1' };
  return { controller, live, context: {
    operationId: live.operationId, sessionEpoch: live.sessionEpoch, signal: controller.signal,
    deadlineMs: 10_000, nowMs: () => 1_000, current: () => live,
  } satisfies DashboardContext };
}
function source(invoices: readonly DashboardInvoice[], observations: readonly DashboardObservation[]) {
  return { schema: 'ghostpay.dashboard-input/1', profileRef: 'profile:1', revision: 'revision:1', invoices, observations };
}
const provider = { assess: (observation: DashboardEvidenceClaim, invoice: DashboardInvoice) => ({
  kind: 'final' as const, invoiceRef: observation.invoiceRef ?? '', chainId: observation.chainId,
  assetId: observation.assetId, transactionHash: observation.transactionHash, position: observation.position,
  amountAtomic: observation.amountAtomic ?? '0', observedAt: observation.observedAt,
  expectedAtomic: invoice.expectedAtomic, expiresAt: invoice.expiresAt, proofRef: 'proof:1',
}) };
const immediate = (): Promise<void> => Promise.resolve();

describe('F04 evidence-qualified local merchant analytics', () => {
  it('does not count imported/unverified payment claims as final or as complete scan coverage', async () => {
    const ctx = session().context;
    const projection = await buildDashboardProjection(source([makeInvoice('invoice:1')], [makeObservation('invoice:1', 0, '100')]), undefined, ctx, immediate);
    const result = summarizeDashboardProjection(projection, 1_500, ctx);
    expect(result).toMatchObject({ schema: 'ghostpay.dashboard-analytics/1', coverage: 'not-evaluated', reconciliationIssueCount: 0 });
    expect(result.groups).toEqual([expect.objectContaining({
      chainId: 'eip155:1', assetId: 'native', invoiceCount: 1, settledOnTimeInvoices: 0,
      outstandingInvoices: 1, reviewRequiredInvoices: 1, finalAtomic: '0', pendingAtomic: '0',
    })]);
  });

  it('uses exact integers and isolates assets and networks without any mixed grand total', async () => {
    const large = '900719925474099312345';
    const invoices = [makeInvoice('invoice:1', { expectedAtomic: large }),
      makeInvoice('invoice:2', { chainId: 'eip155:10', expectedAtomic: large }),
      makeInvoice('invoice:3', { assetId: 'erc20:0x' + 'b'.repeat(40), expectedAtomic: '50' })];
    const observations = [makeObservation('invoice:1', 0, large),
      makeObservation('invoice:2', 1, large, { chainId: 'eip155:10' }),
      makeObservation('invoice:3', 2, '50', { assetId: 'erc20:0x' + 'b'.repeat(40) })];
    const ctx = session().context;
    const projection = await buildDashboardProjection(source(invoices, observations), provider, ctx, immediate);
    const result = summarizeDashboardProjection(projection, 1_500, ctx);
    expect(result.groups).toHaveLength(3);
    expect(result.groups.map((group) => group.finalAtomic)).toEqual(['50', large, large]);
    expect(result.groups.every((group) => group.settledOnTimeInvoices === 1)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('totalAllAssets');
  });

  it('separates expiration, partial payment, pending and late finality at the exact expiry boundary', async () => {
    const invoices = [makeInvoice('invoice:1'), makeInvoice('invoice:2'), makeInvoice('invoice:3')];
    const observations = [makeObservation('invoice:1', 0, '40'),
      makeObservation('invoice:2', 1, '100', { observedAt: 2_000 }),
      makeObservation('invoice:3', 2, '10')];
    const ctx = session().context;
    const qualified = { assess: (claim: Parameters<typeof provider.assess>[0], invoice: DashboardInvoice) => ({
      ...provider.assess(claim, invoice), kind: claim.invoiceRef === 'invoice:3' ? 'pending' as const : 'final' as const,
    }) };
    const projection = await buildDashboardProjection(source(invoices, observations), qualified, ctx, immediate);
    const before = summarizeDashboardProjection(projection, 1_999, ctx).groups[0];
    const expired = summarizeDashboardProjection(projection, 2_000, ctx).groups[0];
    expect(before).toMatchObject({ outstandingInvoices: 3, expiredUnsettledInvoices: 0, partiallyPaidInvoices: 1,
      pendingInvoices: 1, latePaymentInvoices: 1, finalAtomic: '40', lateFinalAtomic: '100', pendingAtomic: '10' });
    expect(expired).toMatchObject({ outstandingInvoices: 0, expiredUnsettledInvoices: 3,
      settledOnTimeInvoices: 0, finalAtomic: '40', lateFinalAtomic: '100' });
  });

  it('retains conflict warnings without counting a duplicated ambiguous payment', async () => {
    const invoices = [makeInvoice('invoice:1'), makeInvoice('invoice:2')];
    const observations = [makeObservation('invoice:1', 0, '100'),
      makeObservation('invoice:2', 0, '100', { evidenceRef: 'evidence:other' })];
    const ctx = session().context;
    const projection = await buildDashboardProjection(source(invoices, observations), provider, ctx, immediate);
    const result = summarizeDashboardProjection(projection, 2_100, ctx);
    expect(result.groups[0]).toMatchObject({ finalAtomic: '0', settledOnTimeInvoices: 0,
      reviewRequiredInvoices: 2, expiredUnsettledInvoices: 2 });
    expect(result.reconciliationIssueCount).toBeGreaterThan(0);
  });

  it('demotes final amounts when canonical evidence is reorganized', async () => {
    const data = source([makeInvoice('invoice:1')], [makeObservation('invoice:1', 0, '100')]);
    const ctx = session().context;
    const earlier = await buildDashboardProjection(data, provider, ctx, immediate);
    const later = await buildDashboardProjection(data, { assess: () => ({ kind: 'reorged' as const }) }, ctx, immediate);
    expect(summarizeDashboardProjection(earlier, 1_500, ctx).groups[0]?.finalAtomic).toBe('100');
    expect(summarizeDashboardProjection(later, 1_500, ctx).groups[0]).toMatchObject({ finalAtomic: '0', reviewRequiredInvoices: 1 });
  });

  it('does not turn an untouched issued invoice into an ambiguous-payment review', async () => {
    const ctx = session().context;
    const projection = await buildDashboardProjection(source([makeInvoice('invoice:1')], []), undefined, ctx, immediate);
    expect(summarizeDashboardProjection(projection, 1_500, ctx).groups[0]).toMatchObject({
      outstandingInvoices: 1, reviewRequiredInvoices: 0, finalAtomic: '0',
    });
  });

  it('rejects stale/locked sessions and invalid reporting clocks', async () => {
    const s = session();
    const projection = await buildDashboardProjection(source([makeInvoice('invoice:1')], []), undefined, s.context, immediate);
    for (const at of [NaN, Infinity, -1, -0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => summarizeDashboardProjection(projection, at, s.context)).toThrow(DashboardError);
    }
    s.live.revision = 'revision:2';
    expect(() => summarizeDashboardProjection(projection, 1_500, s.context)).toThrow(expect.objectContaining({ code: 'STALE_CONTEXT' }));
    s.live.revision = 'revision:1'; s.controller.abort();
    expect(() => summarizeDashboardProjection(projection, 1_500, s.context)).toThrow(expect.objectContaining({ code: 'CANCELLED' }));
  });

  it('rejects forged inconsistent totals, duplicate references and getter-backed rows', async () => {
    const ctx = session().context;
    const projection = await buildDashboardProjection(source([makeInvoice('invoice:1')], []), undefined, ctx, immediate);
    const official = projection.totals[0];
    if (!official) throw new Error('Missing tested total');
    expect(() => summarizeDashboardProjection({ ...projection, totals: [{ ...official, finalAtomic: '1' }] }, 1_500, ctx))
      .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => summarizeDashboardProjection({ ...projection, rows: [projection.rows[0]!, projection.rows[0]!] }, 1_500, ctx))
      .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const sparse = new Array<unknown>(1);
    expect(() => summarizeDashboardProjection({ ...projection, rows: sparse as unknown as typeof projection.rows }, 1_500, ctx)).toThrow(DashboardError);
    let invoked = 0;
    const rows = [projection.rows[0]!];
    Object.defineProperty(rows, '0', { get: () => { invoked++; return projection.rows[0]; } });
    expect(() => summarizeDashboardProjection({ ...projection, rows }, 1_500, ctx)).toThrow(DashboardError);
    expect(invoked).toBe(0);
  });
});
