import { describe, expect, it } from 'vitest';
import { A, FakeRpc, addrWord, manifest, numWord } from './fixtures.testutil.js';
import { createW2Probe } from './w2.js';
import { selector } from './util.js';
import type { MonitorContext } from './types.js';

const ctx = (rpcs: FakeRpc[]): MonitorContext => ({ rpcs, manifests: [manifest()], now: 0 });
const probe = createW2Probe({ tokensByChain: { 1: [A.pToken] } });
const black = `${A.pToken}${selector('isBlacklisted(address)')}${addrWord(A.fee).slice(2)}`;
const paused = `${A.pToken}${selector('paused()')}`;

function rpc(opts: { calls?: Record<string, string>; native?: 'ok' | 'revert'; head?: bigint | undefined } = {}): FakeRpc {
  return new FakeRpc({
    head: 'head' in opts ? opts.head : 1n,
    handler: (m, p) => {
      expect(m).toBe('eth_call');
      const c = (p as { to: string; data?: string }[])[0];
      if (c?.data === undefined) {
        if (opts.native === 'revert') throw new Error('revert');
        return '0x';
      }
      const v = opts.calls?.[`${c.to}${c.data}`];
      if (v === undefined) throw new Error('no such function');
      return v;
    },
  });
}

describe('W2', () => {
  it('healthy and tokens without getters', async () => {
    const f = await probe.run(ctx([rpc()]));
    expect(f).toEqual([expect.objectContaining({ severity: 'info', subject: A.fee })]);
  });
  it('blacklisted recipient and paused token are pages', async () => {
    const f = await probe.run(ctx([rpc({ calls: { [black]: numWord(1n), [paused]: numWord(1n) } })]));
    expect(f.map((x) => [x.severity, x.subject])).toEqual([['page', A.pToken], ['page', A.pToken]]);
  });
  it('false flags are fine', async () => {
    const f = await probe.run(ctx([rpc({ calls: { [black]: numWord(0n), [paused]: numWord(0n) } })]));
    expect(f[0]?.severity).toBe('info');
  });
  it('native send revert is a page', async () => {
    const f = await probe.run(ctx([rpc({ native: 'revert' })]));
    expect(f).toEqual([expect.objectContaining({ severity: 'page', subject: A.fee })]);
  });
  it('unreachable endpoint warns; no client warns', async () => {
    expect((await probe.run(ctx([rpc({ head: undefined })])))[0]?.severity).toBe('warn');
    expect((await probe.run(ctx([])))[0]?.severity).toBe('warn');
  });
  it('chains without a token list only test native', async () => {
    const f = await createW2Probe({ tokensByChain: {} }).run(ctx([rpc()]));
    expect(f).toHaveLength(1);
  });
});
