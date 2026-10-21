import { describe, expect, it } from 'vitest';
import type { LogFilter, RpcLog } from '@ghostpay/chain-adapters';
import { A, FakeRpc, manifest } from './fixtures.testutil.js';
import { createW4Probe, type W4Inputs } from './w4.js';
import { createW5Probe } from './w5.js';
import { createW6Probe } from './w6.js';
import type { MonitorContext } from './types.js';

const dummy = (rpcs: FakeRpc[]): MonitorContext => ({ rpcs, manifests: [manifest()], now: 0 });

describe('W4', () => {
  const base: W4Inputs = {
    chainId: 1,
    address: A.hot,
    balanceWei: 10n ** 18n,
    balanceFloorWei: 10n ** 17n,
    latestNonce: 5,
    pendingNonce: 5,
    maxNonceGap: 2,
    unreimbursedGasWeiToday: 0n,
    dailyUnreimbursedCapWei: 100n,
  };
  const run = (o: Partial<W4Inputs>): ReturnType<ReturnType<typeof createW4Probe>['run']> =>
    createW4Probe(() => Promise.resolve({ ...base, ...o })).run(dummy([]));

  it('healthy', async () => {
    expect(await run({})).toEqual([expect.objectContaining({ severity: 'info', subject: A.hot })]);
  });
  it('balance tiers', async () => {
    expect((await run({ balanceWei: 10n ** 17n + 1n }))[0]?.severity).toBe('warn');
    expect((await run({ balanceWei: 1n }))[0]?.severity).toBe('page');
  });
  it('nonce gap tiers', async () => {
    expect((await run({ pendingNonce: 8 }))[0]?.severity).toBe('warn');
    expect((await run({ pendingNonce: 20 }))[0]?.severity).toBe('page');
    expect(await run({ pendingNonce: 7 })).toHaveLength(1);
  });
  it('loss tiers', async () => {
    expect((await run({ unreimbursedGasWeiToday: 80n }))[0]?.severity).toBe('warn');
    expect((await run({ unreimbursedGasWeiToday: 79n }))[0]?.severity).toBe('info');
    expect((await run({ unreimbursedGasWeiToday: 100n }))[0]?.severity).toBe('page');
  });
  it('multiple findings and sync source', async () => {
    const f = await createW4Probe(() => ({ ...base, balanceWei: 0n, pendingNonce: 99 })).run(dummy([]));
    expect(f).toHaveLength(2);
  });
  it('rejects invalid inputs', async () => {
    for (const bad of [
      { pendingNonce: 4 },
      { latestNonce: -1 },
      { latestNonce: 1.5 },
      { maxNonceGap: -1 },
      { balanceWei: -1n },
      { dailyUnreimbursedCapWei: 0n },
      { unreimbursedGasWeiToday: -1n },
    ]) {
      await expect(run(bad)).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    }
  });
});

describe('W5', () => {
  const log = {} as RpcLog;
  const make = (ann: number, fees: number, head = 1000n): FakeRpc =>
    new FakeRpc({
      head,
      handler: () => null,
      logs: (f: LogFilter) => {
        if (f.address === A.router) return Array<RpcLog>(fees).fill(log);
        return Array<RpcLog>(ann / 2).fill(log);
      },
    });
  const p = createW5Probe({ baselinePerBlock: 1, windowBlocks: 100 });

  it('normal', async () => {
    const f = await p.run(dummy([make(100, 50)]));
    expect(f[0]).toMatchObject({ severity: 'info', subject: A.announcer });
  });
  it('elevated with fee share is warn; without share is page', async () => {
    expect((await p.run(dummy([make(400, 200)])))[0]?.severity).toBe('warn');
    expect((await p.run(dummy([make(400, 0)])))[0]?.severity).toBe('page');
  });
  it('very high is page', async () => {
    expect((await p.run(dummy([make(1200, 1200)])))[0]?.severity).toBe('page');
  });
  it('zero announcements and short chains', async () => {
    const f = await p.run(dummy([make(0, 0, 5n)]));
    expect(f[0]?.severity).toBe('info');
    expect(f[0]?.detail).toContain('in 6 blocks');
  });
  it('failures warn', async () => {
    expect((await p.run(dummy([new FakeRpc({ handler: () => null })])))[0]?.severity).toBe('warn');
    expect((await p.run(dummy([])))[0]?.severity).toBe('warn');
  });
  it('validates config', () => {
    for (const o of [
      { baselinePerBlock: 0 },
      { baselinePerBlock: Infinity },
      { baselinePerBlock: 1, windowBlocks: 0 },
      { baselinePerBlock: 1, windowBlocks: 5001 },
      { baselinePerBlock: 1, warnFactor: 5, pageFactor: 2 },
      { baselinePerBlock: 1, schemeIds: [] },
    ]) {
      expect(() => createW5Probe(o)).toThrow();
    }
  });
});

describe('W6', () => {
  const GOOD = `0x${'aa'.repeat(32)}`;
  const BAD = `0x${'bb'.repeat(32)}`;
  const node = (o: { id?: unknown; head?: bigint | undefined; hash?: string | null | undefined; throwId?: boolean }): FakeRpc =>
    new FakeRpc({
      head: 'head' in o ? o.head : 100n,
      blockHash: 'hash' in o ? (o.hash === undefined ? undefined : () => o.hash as string | null) : () => GOOD,
      handler: () => {
        if (o.throwId === true) throw new Error('boom');
        return 'id' in o ? o.id : '0x1';
      },
    });
  const p = createW6Probe();

  it('agreeing providers', async () => {
    const f = await p.run(dummy([node({}), node({ head: 103n })]));
    expect(f).toEqual([expect.objectContaining({ severity: 'info', subject: A.announcer })]);
    expect(f[0]?.detail).toContain('block 94');
  });
  it('lying provider returns different hash', async () => {
    const f = await p.run(dummy([node({}), node({ hash: BAD })]));
    expect(f).toEqual([expect.objectContaining({ severity: 'page' })]);
  });
  it('wrong chain id is a page', async () => {
    const f = await p.run(dummy([node({}), node({ id: '0x2' })]));
    expect(f.map((x) => x.severity)).toEqual(['page']);
  });
  it('unreachable providers warn', async () => {
    const f = await p.run(dummy([node({}), node({ head: undefined }), node({ throwId: true }), node({ id: 'x', head: undefined })]));
    expect(f.filter((x) => x.severity === 'warn').length).toBeGreaterThanOrEqual(3);
  });
  it('one live provider cannot cross-check', async () => {
    const f = await p.run(dummy([node({}), node({ head: undefined })]));
    expect(f.map((x) => x.severity)).toEqual(['warn']);
    const g = await p.run(dummy([node({}), node({ id: '0x2' })]));
    expect(g.map((x) => x.severity)).toEqual(['page']);
    const h = await p.run(dummy([node({}), node({}), node({ head: undefined })]));
    expect(h.map((x) => x.severity)).toEqual(['warn']);
  });
  it('single provider warns', async () => {
    expect((await p.run(dummy([node({})])))[0]?.severity).toBe('warn');
  });
  it('missing block or failing getBlock warns; young chains clamp to 0', async () => {
    const f = await p.run(dummy([node({}), node({ hash: null })]));
    expect(f.some((x) => x.severity === 'warn')).toBe(true);
    const g = await p.run(dummy([node({}), node({ hash: undefined })]));
    expect(g.some((x) => x.severity === 'warn')).toBe(true);
    const y = await p.run(dummy([node({ head: 2n }), node({ head: 3n })]));
    expect(y[0]?.detail).toContain('block 0');
  });
  it('validates confirmations', () => {
    expect(() => createW6Probe({ confirmations: -1 })).toThrow();
  });
});
