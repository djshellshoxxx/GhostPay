import { describe, expect, it, vi } from 'vitest';
import {
  buildDashboardProjection, DASHBOARD_LIMITS, DashboardError, decodeDashboardSnapshot, selectDashboardRows,
  type DashboardContext, type DashboardEvidenceClaim, type DashboardEvidenceProvider, type DashboardInvoice,
  type DashboardObservation, type DashboardSnapshot, type EvidenceAssessment,
} from './index';

const invoice = (over: Partial<DashboardInvoice> = {}): DashboardInvoice => ({
  invoiceRef: 'invoice:1', alias: 'North shop', chainId: 'eip155:1', assetId: 'native', expectedAtomic: '100', expiresAt: 2_000, ...over,
});
const observation = (over: Partial<DashboardObservation> = {}): DashboardObservation => ({
  evidenceRef: 'evidence:1', invoiceRef: 'invoice:1', chainId: 'eip155:1', assetId: 'native',
  transactionHash: `0x${'a'.repeat(64)}`, position: 0, amountAtomic: '100', observedAt: 1_000, ...over,
});
const snapshot = (observations: readonly DashboardObservation[] = [observation()], invoices: readonly DashboardInvoice[] = [invoice()]): DashboardSnapshot => ({
  schema: 'ghostpay.dashboard-input/1', profileRef: 'profile:1', revision: 'revision:1', invoices, observations,
});
const binding = (row: DashboardEvidenceClaim, expected: DashboardInvoice = invoice(), kind: 'final' | 'pending' = 'final'): EvidenceAssessment => ({
  kind, invoiceRef: row.invoiceRef ?? 'unlinked', chainId: row.chainId, assetId: row.assetId,
  transactionHash: row.transactionHash, position: row.position, amountAtomic: row.amountAtomic ?? '0', observedAt: row.observedAt,
  expectedAtomic: expected.expectedAtomic, expiresAt: expected.expiresAt, proofRef: 'proof:1',
});
const finalProvider: DashboardEvidenceProvider = { assess: (row, expected) => binding(row, expected) };
function runtime(): { context: DashboardContext; controller: AbortController; live: { operationId: string; sessionEpoch: number; profileRef: string; revision: string }; clock: { now: number } } {
  const controller = new AbortController();
  const live = { operationId: 'operation:1', sessionEpoch: 1, profileRef: 'profile:1', revision: 'revision:1' };
  const clock = { now: 1_000 };
  return { controller, live, clock, context: {
    operationId: live.operationId, sessionEpoch: live.sessionEpoch, signal: controller.signal,
    deadlineMs: 10_000, nowMs: () => clock.now, current: () => live,
  } };
}
const noWait = (): Promise<void> => Promise.resolve();

describe('F04 strict input boundary', () => {
  it('clones and freezes claims while rejecting imported finality status', () => {
    const data = snapshot();
    const decoded = decodeDashboardSnapshot(data);
    expect(decoded).toEqual(data);
    expect(decoded.observations[0]).not.toBe(data.observations[0]);
    expect(Object.isFrozen(decoded.observations[0])).toBe(true);
    expect(Object.isFrozen(decoded.invoices)).toBe(true);
    expect(() => decodeDashboardSnapshot({ ...data, observations: [{ ...observation(), state: 'final' }] })).toThrow(DashboardError);
  });

  it.each(['01', '-1', '1.5', '1e9', '', ' 1', (1n << 256n).toString(), 1, null])('rejects a noncanonical expected amount %s', (amount) => {
    expect(() => decodeDashboardSnapshot({ ...snapshot(), invoices: [{ ...invoice(), expectedAtomic: amount }] })).toThrow(DashboardError);
  });

  it.each(['\n', '\r', '\r\n', '\u2028', '\u2029'])('rejects canonical fields with a trailing line terminator %j', (suffix) => {
    for (const patch of [
      { invoiceRef: `invoice:1${suffix}` }, { expectedAtomic: `100${suffix}` },
      { chainId: `eip155:1${suffix}` }, { assetId: `erc20:0x${'1'.repeat(40)}${suffix}` },
    ]) {
      expect(() => decodeDashboardSnapshot(snapshot([], [invoice(patch)]))).toThrow(DashboardError);
    }
    expect(() => decodeDashboardSnapshot(snapshot([observation({ transactionHash: `0x${'a'.repeat(64)}${suffix}` })])))
      .toThrow(DashboardError);
  });

  it('rejects duplicate invoice references, unsupported networks, noncanonical assets and unsafe timestamps', () => {
    expect(() => decodeDashboardSnapshot(snapshot([], [invoice(), invoice()]))).toThrow(expect.objectContaining({ code: 'DUPLICATE_REFERENCE' }));
    for (const patch of [{ chainId: 'eip155:01' }, { chainId: 'bitcoin:mainnet' }, { assetId: 'ETH' }, { expiresAt: Number.NaN }, { expiresAt: -0 }]) {
      expect(() => decodeDashboardSnapshot(snapshot([], [invoice(patch)]))).toThrow(DashboardError);
    }
  });

  it('bounds input before iterating excess records and rejects sparse rows or accessors', () => {
    expect(() => decodeDashboardSnapshot(snapshot(Array.from({ length: DASHBOARD_LIMITS.observations + 1 }, () => observation())))).toThrow(expect.objectContaining({ code: 'LIMIT' }));
    expect(() => decodeDashboardSnapshot({ ...snapshot(), invoices: new Array<unknown>(1) })).toThrow(DashboardError);
    const getter = vi.fn(() => '100');
    const value = Object.defineProperty({ ...invoice() }, 'expectedAtomic', { get: getter });
    expect(() => decodeDashboardSnapshot({ ...snapshot(), invoices: [value] })).toThrow(DashboardError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('F04 evidence-qualified projection', () => {
  it('never treats an unverified amount match as finality or guesses a missing invoice link', async () => {
    const result = await buildDashboardProjection(snapshot([observation(), observation({ evidenceRef: 'evidence:2', position: 1, invoiceRef: null })]), undefined, runtime().context);
    expect(result.rows[0]).toMatchObject({ state: 'unverified', finalAtomic: '0' });
    expect(result.issues).toEqual([{ code: 'UNLINKED', evidenceRefs: ['evidence:2'] }]);
    expect(result.totals[0]).toMatchObject({ finalAtomic: '0', recordedFeesAtomic: null });
    expect(result.coverage).toBe('not-evaluated');
  });

  it('counts two partial payments once per chain/transaction/position despite repeated evidence', async () => {
    const first = observation({ amountAtomic: '40' });
    const second = observation({ evidenceRef: 'evidence:2', position: 1, amountAtomic: '60' });
    const assess = vi.fn(finalProvider.assess);
    const result = await buildDashboardProjection(snapshot([second, first, { ...first, evidenceRef: 'evidence:copy' }, first]), { assess }, runtime().context);
    expect(result.rows[0]).toMatchObject({ state: 'final', finalAtomic: '100', evidenceRefs: ['evidence:1', 'evidence:2', 'evidence:copy'] });
    expect(result.rows[0]?.assessmentCounts.final).toBe(2);
    expect(assess).toHaveBeenCalledTimes(2);
  });

  it('excludes one observation linked to two invoices from both totals', async () => {
    const rows = [observation(), observation({ evidenceRef: 'evidence:2', invoiceRef: 'invoice:2' })];
    const assess = vi.fn(finalProvider.assess);
    const result = await buildDashboardProjection(snapshot(rows, [invoice(), invoice({ invoiceRef: 'invoice:2' })]), { assess }, runtime().context);
    expect(result.rows.map((row) => [row.state, row.finalAtomic])).toEqual([['conflicted', '0'], ['conflicted', '0']]);
    expect(result.totals[0]?.finalAtomic).toBe('0');
    expect(result.evidence[0]).toMatchObject({ kind: 'conflicted', invoiceRef: null, amountAtomic: null });
    expect(assess).not.toHaveBeenCalled();
  });

  it('is deterministic across conflicting amount/metadata ordering', async () => {
    const a = observation();
    const b = observation({ evidenceRef: 'evidence:2', amountAtomic: '1' });
    const forward = await buildDashboardProjection(snapshot([a, b]), finalProvider, runtime().context);
    const reverse = await buildDashboardProjection(snapshot([b, a]), finalProvider, runtime().context);
    expect(forward).toEqual(reverse);
    expect(forward.rows[0]?.state).toBe('conflicted');
  });

  it('rejects a reused evidence reference for another transaction position', async () => {
    await expect(buildDashboardProjection(snapshot([observation(), observation({ position: 1 })]), finalProvider, runtime().context))
      .rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });
  });

  it.each([
    { invoiceRef: 'invoice:other' }, { chainId: 'eip155:10' }, { assetId: `erc20:0x${'1'.repeat(40)}` },
    { amountAtomic: '99' }, { transactionHash: `0x${'b'.repeat(64)}` }, { position: 1 }, { proofRef: '' }, { extra: true },
    { observedAt: 999 }, { expectedAtomic: '99' }, { expiresAt: 999 },
  ])('does not accept a provider assessment with mismatched binding %j', async (patch) => {
    const provider = { assess: (row: DashboardEvidenceClaim): EvidenceAssessment => ({ ...binding(row), ...patch }) };
    const result = await buildDashboardProjection(snapshot(), provider, runtime().context);
    expect(result.rows[0]).toMatchObject({ state: 'unknown', finalAtomic: '0' });
    expect(result.issues[0]?.code).toBe('ASSESSMENT_UNAVAILABLE');
  });

  it('keeps missing amounts and provider failure unknown without exposing provider error text', async () => {
    const provider = { assess: (): EvidenceAssessment => { throw new Error('private provider details'); } };
    const result = await buildDashboardProjection(snapshot([observation(), observation({ evidenceRef: 'evidence:2', position: 1, amountAtomic: null })]), provider, runtime().context);
    expect(result.rows[0]).toMatchObject({ state: 'unknown', finalAtomic: '0' });
    expect(result.evidence[1]?.amountAtomic).toBe(null);
    expect(result.issues.map((item) => item.code)).toEqual(['ASSESSMENT_UNAVAILABLE', 'MISSING_AMOUNT']);
    expect(JSON.stringify(result)).not.toContain('private provider details');
  });

  it('keeps pending, partial, overpaid and late values distinct', async () => {
    const pending = await buildDashboardProjection(snapshot(), { assess: (row, expected) => binding(row, expected, 'pending') }, runtime().context);
    expect(pending.rows[0]).toMatchObject({ state: 'pending', finalAtomic: '0', pendingAtomic: '100' });
    const partial = await buildDashboardProjection(snapshot([observation({ amountAtomic: '40' })]), finalProvider, runtime().context);
    expect(partial.rows[0]).toMatchObject({ state: 'partial', finalAtomic: '40' });
    const overpaid = await buildDashboardProjection(snapshot([observation({ amountAtomic: '101' })]), finalProvider, runtime().context);
    expect(overpaid.rows[0]?.state).toBe('overpaid');
    const late = await buildDashboardProjection(snapshot([observation({ observedAt: 2_000 })]), finalProvider, runtime().context);
    expect(late.rows[0]).toMatchObject({ state: 'late', finalAtomic: '0', lateFinalAtomic: '100' });
  });

  it.each(['reorged', 'reverted'] as const)('rebuilds without a formerly final contribution when provider reports %s', async (kind) => {
    const data = snapshot();
    const before = await buildDashboardProjection(data, finalProvider, runtime().context);
    const after = await buildDashboardProjection(data, { assess: () => ({ kind }) }, runtime().context);
    expect(before.totals[0]?.finalAtomic).toBe('100');
    expect(after.rows[0]).toMatchObject({ state: kind, finalAtomic: '0', evidenceRefs: ['evidence:1'] });
    expect(after.evidence[0]?.kind).toBe(kind);
  });

  it('assesses current canonical finality independently of old-final/new-reorg evidence-reference order', async () => {
    const old = observation({ evidenceRef: 'history:final' });
    const removed = observation({ evidenceRef: 'history:reorged' });
    const assess = vi.fn((claim: DashboardEvidenceClaim): EvidenceAssessment => {
      expect(claim).not.toHaveProperty('evidenceRef');
      expect(Object.isFrozen(claim)).toBe(true);
      // The approved adapter's current canonical lookup has demoted this event.
      return claim.transactionHash === old.transactionHash && claim.position === old.position
        ? { kind: 'reorged' } : { kind: 'unknown' };
    });
    const forward = await buildDashboardProjection(snapshot([old, removed]), { assess }, runtime().context);
    const reverse = await buildDashboardProjection(snapshot([removed, old]), { assess }, runtime().context);
    expect(forward).toEqual(reverse);
    expect(forward.rows[0]).toMatchObject({ state: 'reorged', finalAtomic: '0' });
    expect(assess).toHaveBeenCalledTimes(2);
  });

  it('partitions chain/asset totals and handles sums above Number and uint256 ranges exactly', async () => {
    const max = ((1n << 256n) - 1n).toString();
    const token = `erc20:0x${'1'.repeat(40)}`;
    const invoices = [invoice({ expectedAtomic: max }), invoice({ invoiceRef: 'invoice:2', expectedAtomic: max }),
      invoice({ invoiceRef: 'invoice:3', chainId: 'eip155:10' }), invoice({ invoiceRef: 'invoice:4', assetId: token })];
    const observations = invoices.map((item, position) => observation({ evidenceRef: `evidence:${position}`, invoiceRef: item.invoiceRef,
      chainId: item.chainId, assetId: item.assetId, amountAtomic: item.expectedAtomic, position }));
    const result = await buildDashboardProjection(snapshot(observations, invoices), finalProvider, runtime().context);
    expect(result.totals).toHaveLength(3);
    expect(result.totals.find((row) => row.chainId === 'eip155:1' && row.assetId === 'native')?.finalAtomic).toBe((BigInt(max) * 2n).toString());
    expect(result.totals.every((row) => row.recordedFeesAtomic === null)).toBe(true);
  });

  it('does not use a wrong-chain/asset observation even if an adapter would accept it', async () => {
    const assess = vi.fn(finalProvider.assess);
    const result = await buildDashboardProjection(snapshot([observation({ chainId: 'eip155:10' })]), { assess }, runtime().context);
    expect(result.rows[0]).toMatchObject({ state: 'conflicted', finalAtomic: '0' });
    expect(result.issues[0]?.code).toBe('ASSET_MISMATCH');
    expect(assess).not.toHaveBeenCalled();
  });
});

describe('F04 cancellation and result lifetime', () => {
  it('rejects a pre-aborted operation before reading records', async () => {
    const rt = runtime();
    rt.controller.abort();
    await expect(buildDashboardProjection(null, finalProvider, rt.context)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it.each(['operationId', 'sessionEpoch', 'profileRef', 'revision'] as const)('rejects a superseded %s before returning decrypted rows', async (field) => {
    const rt = runtime();
    const provider = { assess: (row: DashboardEvidenceClaim): EvidenceAssessment => {
      if (field === 'sessionEpoch') rt.live.sessionEpoch++;
      else rt.live[field] = 'changed';
      return binding(row);
    } };
    await expect(buildDashboardProjection(snapshot(), provider, rt.context)).rejects.toMatchObject({ code: 'STALE_CONTEXT' });
  });

  it('yields during a bounded large rebuild and discards the result on lock', async () => {
    const rt = runtime();
    const observations = Array.from({ length: 300 }, (_, position) => observation({ evidenceRef: `evidence:${position}`, position }));
    const assess = vi.fn(finalProvider.assess);
    const yieldToHost = vi.fn((): Promise<void> => { rt.controller.abort(); return Promise.resolve(); });
    await expect(buildDashboardProjection(snapshot(observations), { assess }, rt.context, yieldToHost)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(yieldToHost).toHaveBeenCalledOnce();
    expect(assess).not.toHaveBeenCalled();
  });

  it('captures claims and expected context before an asynchronous yield', async () => {
    const rt = runtime();
    const observations = Array.from({ length: 300 }, (_, position) => ({ ...observation({ evidenceRef: `evidence:${position}`, position, amountAtomic: '1' }) }));
    const result = await buildDashboardProjection(snapshot(observations), finalProvider, rt.context, () => {
      const first = observations[0];
      if (first !== undefined) first.amountAtomic = '99';
      return Promise.resolve();
    });
    expect(result.rows[0]?.finalAtomic).toBe('300');
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(Object.isFrozen(result.rows[0]?.assessmentCounts)).toBe(true);
  });

  it('does not let a mutable context replace the expected operation after a yield', async () => {
    const rt = runtime();
    const mutableContext = { ...rt.context };
    const observations = Array.from({ length: 300 }, (_, position) => observation({ evidenceRef: `evidence:${position}`, position }));
    await expect(buildDashboardProjection(snapshot(observations), finalProvider, mutableContext, () => {
      mutableContext.operationId = 'new-operation';
      rt.live.operationId = 'new-operation';
      return Promise.resolve();
    })).rejects.toMatchObject({ code: 'STALE_CONTEXT' });
  });

  it('rechecks the deadline after provider work and rejects invalid clocks', async () => {
    const rt = runtime();
    await expect(buildDashboardProjection(snapshot(), { assess: (row) => { rt.clock.now = rt.context.deadlineMs; return binding(row); } }, rt.context))
      .rejects.toMatchObject({ code: 'DEADLINE' });
    rt.clock.now = Number.NaN;
    await expect(buildDashboardProjection(snapshot(), finalProvider, rt.context)).rejects.toMatchObject({ code: 'DEADLINE' });
  });

  it('performs no ambient network requests in local projection and search', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('unexpected request')));
    try {
      const rt = runtime();
      const result = await buildDashboardProjection(snapshot(), finalProvider, rt.context);
      selectDashboardRows(result, { search: 'north' }, rt.context);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});

describe('F04 bounded selectors', () => {
  it('filters in deterministic order and buffers at most the requested page', async () => {
    const invoices = Array.from({ length: 125 }, (_, i) => invoice({ invoiceRef: `invoice:${String(i).padStart(3, '0')}`, alias: i % 2 ? 'North shop' : 'South shop' }));
    const rt = runtime();
    const result = await buildDashboardProjection(snapshot([], invoices.reverse()), undefined, rt.context);
    const page = selectDashboardRows(result, { search: 'NORTH', state: 'unknown', offset: 2, limit: 3 }, rt.context);
    expect(page.totalMatches).toBe(62);
    expect(page.rows.map((row) => row.invoiceRef)).toEqual(['invoice:005', 'invoice:007', 'invoice:009']);
    expect(selectDashboardRows(result, { limit: 100 }, rt.context).rows).toHaveLength(100);
    expect(selectDashboardRows(result, { chainId: 'eip155:10' }, rt.context).rows).toHaveLength(0);
    expect(Object.isFrozen(page.rows)).toBe(true);
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: null }, { offset: -1 }, { search: null }, { search: 'x'.repeat(257) }, { state: 'paid' }, { unknown: true }])('rejects an invalid filter %j', async (filter) => {
    const rt = runtime();
    const result = await buildDashboardProjection(snapshot(), undefined, rt.context);
    expect(() => selectDashboardRows(result, filter, rt.context)).toThrow(DashboardError);
  });

  it('refuses to search an old projection after revision or session changes', async () => {
    const rt = runtime();
    const result = await buildDashboardProjection(snapshot(), undefined, rt.context);
    rt.live.revision = 'revision:2';
    expect(() => selectDashboardRows(result, {}, rt.context)).toThrow(expect.objectContaining({ code: 'STALE_CONTEXT' }));
    rt.live.revision = 'revision:1'; rt.controller.abort();
    expect(() => selectDashboardRows(result, {}, rt.context)).toThrow(expect.objectContaining({ code: 'CANCELLED' }));
  });

  it('processes the specified 10k invoice / 50k observation cap with bounded pages', async () => {
    const invoices = Array.from({ length: DASHBOARD_LIMITS.invoices }, (_, i) => invoice({ invoiceRef: `invoice:${i}`, expectedAtomic: '5' }));
    const observations = Array.from({ length: DASHBOARD_LIMITS.observations }, (_, i) => observation({
      invoiceRef: `invoice:${Math.floor(i / 5)}`, evidenceRef: `evidence:${i}`, position: i, amountAtomic: '1',
    }));
    const rt = runtime();
    const result = await buildDashboardProjection(snapshot(observations, invoices), finalProvider, rt.context, noWait);
    expect(result.rows).toHaveLength(10_000);
    expect(result.evidence).toHaveLength(50_000);
    expect(result.totals[0]?.finalAtomic).toBe('50000');
    expect(selectDashboardRows(result, { limit: 100 }, rt.context).rows).toHaveLength(100);
  });
});
