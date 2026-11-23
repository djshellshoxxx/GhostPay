import { describe, expect, it } from 'vitest';
import { DashboardExportCoordinator } from './export';
import { buildDashboardProjection } from './projection';
import { decodeDashboardSnapshot, type DashboardContext } from './model';
import type { DashboardProjection, DashboardRow } from './projection';

function context() {
  const controller = new AbortController();
  const live = { operationId: 'operation:1', sessionEpoch: 1, profileRef: 'profile:1', revision: 'revision:1' };
  return { live, controller, value: {
    operationId: 'operation:1', sessionEpoch: 1, signal: controller.signal, deadlineMs: 9_000,
    nowMs: () => 1_000, current: () => live,
  } satisfies DashboardContext };
}
function fixture(): DashboardProjection {
  const row = (invoiceRef: string, alias: string, assetId: string, expectedAtomic: string): DashboardRow => Object.freeze({
    invoiceRef, alias, chainId: 'eip155:1', assetId, expectedAtomic, expiresAt: 2_000,
    state: 'partial', finalAtomic: '40', pendingAtomic: '0', lateFinalAtomic: '0',
    evidenceRefs: Object.freeze(['evidence:1']), assessmentCounts: Object.freeze({ unverified: 0, unknown: 0, pending: 0, final: 1, reorged: 0, reverted: 0 }),
  });
  return Object.freeze({
    schema: 'ghostpay.dashboard-projection/1', profileRef: 'profile:1', revision: 'revision:1', coverage: 'not-evaluated',
    rows: Object.freeze([row('invoice:1', '=2+3', 'native', '900719925474099312345'),
      row('invoice:2', '  \u200b@SUM(1,2)"x', 'erc20:0x' + 'a'.repeat(40), '20')]),
    totals: Object.freeze([]), issues: Object.freeze([]), evidence: Object.freeze([]),
  });
}
const columns = ['invoiceRef', 'chainId', 'assetId', 'state', 'expectedAtomic', 'finalAtomic'];
const request = (invoiceRefs: readonly string[] = ['invoice:1'], format = 'json', fields: readonly string[] = columns) => ({ invoiceRefs, columns: fields, format });

describe('F04 deliberate, local merchant exports', () => {
  it('returns a non-sensitive preview, then selected JSON with exact atomic strings and explicit unknown coverage', () => {
    const session = new DashboardExportCoordinator(); const ctx = context();
    const preview = session.preview(fixture(), request(), ctx.value);
    expect(preview).toMatchObject({ count: 1, format: 'json', coverage: 'not-evaluated' });
    expect(JSON.stringify(preview)).not.toContain('=2+3');
    const exported = session.approve(preview, ctx.value);
    const parsed = JSON.parse(exported.content) as { schema: string; coverage: string; units: string; rows: Record<string, unknown>[] };
    expect(parsed).toMatchObject({ schema: 'ghostpay.dashboard-export/1', coverage: 'not-evaluated', units: 'atomic' });
    expect(parsed.rows).toEqual([{ invoiceRef: 'invoice:1', chainId: 'eip155:1', assetId: 'native', state: 'partial',
      expectedAtomic: '900719925474099312345', finalAtomic: '40' }]);
    expect(exported.bytes).toBe(new TextEncoder().encode(exported.content).byteLength);
    expect(() => session.approve(preview, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('rejects forged previews, burns failed approval and invalidates superseded tokens', () => {
    const session = new DashboardExportCoordinator(); const ctx = context(); const data = fixture();
    const first = session.preview(data, request(), ctx.value);
    expect(() => session.approve({ ...first }, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => session.approve(first, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const second = session.preview(data, request(), ctx.value);
    const third = session.preview(data, request(['invoice:2']), ctx.value);
    expect(() => session.approve(second, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => session.approve(third, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('fails closed after lock, revision, session and cancellation changes', () => {
    for (const change of [(ctx: ReturnType<typeof context>) => { ctx.live.revision = 'revision:2'; },
      (ctx: ReturnType<typeof context>) => { ctx.live.sessionEpoch++; },
      (ctx: ReturnType<typeof context>) => { ctx.controller.abort(); }]) {
      const session = new DashboardExportCoordinator(); const ctx = context();
      const preview = session.preview(fixture(), request(), ctx.value);
      change(ctx);
      expect(() => session.approve(preview, ctx.value)).toThrow();
      expect(() => session.approve(preview, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
    const session = new DashboardExportCoordinator(); const ctx = context();
    const preview = session.preview(fixture(), request(), ctx.value); session.cancel();
    expect(() => session.approve(preview, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('neutralizes formula-leading CSV fields and preserves CSV quoting', () => {
    const session = new DashboardExportCoordinator(); const ctx = context();
    const preview = session.preview(fixture(), request(['invoice:1', 'invoice:2'], 'csv', ['invoiceRef', 'alias', 'chainId', 'assetId', 'state']), ctx.value);
    const exported = session.approve(preview, ctx.value);
    expect(exported.mimeType).toContain('text/csv');
    expect(exported.content).toContain("invoice:1,'=2+3,eip155:1,native,partial");
    expect(exported.content).toContain('invoice:2,"\'  \u200b@SUM(1,2)""x"');
    expect(exported.content.endsWith('\r\n')).toBe(true);
  });

  it('rejects unknown columns, ambiguous amount exports, duplicates, accessors and sparse selections', () => {
    const session = new DashboardExportCoordinator(); const ctx = context(); const data = fixture();
    const bad = [request(['invoice:missing']), request(['invoice:1', 'invoice:1']), request(['invoice:1'], 'xml'),
      request(['invoice:1'], 'csv', ['alias', 'alias']), request(['invoice:1'], 'csv', ['alias', 'notAColumn']),
      request(['invoice:1'], 'csv', ['finalAtomic']), request([]), request(['invoice:1'], 'json', []), { ...request(), extra: 1 }];
    for (const req of bad) expect(() => session.preview(data, req, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const sparse = new Array<string>(1);
    expect(() => session.preview(data, request(sparse), ctx.value)).toThrow();
    let calls = 0;
    const accessor = Object.defineProperty({ ...request() }, 'columns', { get: () => { calls++; return columns; } });
    expect(() => session.preview(data, accessor, ctx.value)).toThrow();
    expect(calls).toBe(0);
    expect(() => session.preview({ ...data }, request(), ctx.value)).toThrow();
  });

  it('exports a real unverified projection without promoting claims to confirmed settlement', async () => {
    const ctx = context();
    const snapshot = decodeDashboardSnapshot({ schema: 'ghostpay.dashboard-input/1', profileRef: 'profile:1', revision: 'revision:1',
      invoices: [{ invoiceRef: 'invoice:1', alias: 'Unverified', chainId: 'eip155:1', assetId: 'native', expectedAtomic: '10', expiresAt: 2_000 }],
      observations: [{ evidenceRef: 'evidence:1', invoiceRef: 'invoice:1', chainId: 'eip155:1', assetId: 'native',
        transactionHash: '0x' + 'a'.repeat(64), position: 0, amountAtomic: '10', observedAt: 1_000 }] });
    const projection = await buildDashboardProjection(snapshot, undefined, ctx.value);
    const session = new DashboardExportCoordinator();
    const preview = session.preview(projection, request(), ctx.value);
    const output = JSON.parse(session.approve(preview, ctx.value).content) as { rows: { state: string; finalAtomic: string }[] };
    expect(output.rows[0]).toMatchObject({ state: 'unverified', finalAtomic: '0' });
  });
  it('rejects frozen row arrays containing getters without invoking them', () => {
    let calls = 0;
    const source = fixture();
    const first = source.rows[0];
    if (!first) throw new Error('Missing test fixture row');
    const rows = [first];
    Object.defineProperty(rows, '0', { enumerable: true, get: () => { calls++; return first; } });
    Object.freeze(rows);
    const projection = Object.freeze({ ...source, rows });
    const session = new DashboardExportCoordinator();
    expect(() => session.preview(projection, request(), context().value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(calls).toBe(0);
  });

  it('rejects lone UTF-16 surrogates rather than silently replacing them in exported bytes', () => {
    const source = fixture(); const ctx = context();
    const first = source.rows[0];
    if (!first) throw new Error('Missing test fixture row');
    const malformed = Object.freeze({ ...first, alias: '\ud800' });
    const session = new DashboardExportCoordinator();
    const preview = session.preview(Object.freeze({ ...source, rows: Object.freeze([malformed]) }),
      request(['invoice:1'], 'csv', ['alias']), ctx.value);
    expect(() => session.approve(preview, ctx.value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const valid = Object.freeze({ ...first, alias: '\ud83d\ude80' });
    const next = session.preview(Object.freeze({ ...source, rows: Object.freeze([valid]) }),
      request(['invoice:1'], 'csv', ['alias']), ctx.value);
    expect(session.approve(next, ctx.value).content).toContain('🚀');
  });

});
