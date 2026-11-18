import { describe, expect, it, vi } from 'vitest';
import type { BlockRef, RpcClient } from '@ghostpay/chain-adapters';
import { CanonicalSourceChecks } from './sourceChecks.js';
import { Metrics } from './metrics.js';
import type { AlertEvent } from './alerts.js';

const hash = `0x${'11'.repeat(32)}` as const;
function rpc(tip = 100n, change: Partial<BlockRef> = {}) {
  return { chainId: 11155111, request: vi.fn(), getLogs: vi.fn(), blockNumber: vi.fn(() => Promise.resolve(tip)),
    getBlock: vi.fn<(number: bigint) => Promise<BlockRef | null>>((number) => Promise.resolve({ number, hash, parentHash: hash, timestamp: 1000n, ...change })) } satisfies RpcClient;
}
function setup(primary = rpc(), secondary = rpc(102n)) {
  const events: AlertEvent[] = []; const metrics = new Metrics();
  return { primary, secondary, events, metrics, checks: new CanonicalSourceChecks(new Map([[11155111,
    { primary, secondary, finalityDepth: 10 }]]), { send: (event) => { events.push(event); } }, metrics) };
}
describe('configured canonical provider checks', () => {
  it('compares the same finalized height despite ordinary tip lag, and records no addresses', async () => {
    const s = setup(); await s.checks.ensureAgreement(11155111);
    expect(s.primary.getBlock).toHaveBeenCalledWith(91n); expect(s.secondary.getBlock).toHaveBeenCalledWith(91n);
    expect(s.events).toEqual([]); expect(s.metrics.render()).toContain('relayer_rpc_agreement_checks_total{chain_id="11155111"} 1');
    expect(s.metrics.render()).not.toContain(hash);
  });
  it.each([{ hash: `0x${'22'.repeat(32)}` as const }, { parentHash: `0x${'22'.repeat(32)}` as const }, { timestamp: 1001n }, { number: 90n }])('rejects differing canonical metadata %#', async (change) => {
    const s = setup(rpc(), rpc(100n, change)); await expect(s.checks.ensureAgreement(11155111)).rejects.toMatchObject({ code: 'rpc_disagree', status: 503 });
    expect(s.events).toEqual([{ kind: 'rpc_disagree', chainId: 11155111 }]);
  });
  it('does not label an unavailable provider as disagreement', async () => {
    const s = setup(); vi.mocked(s.secondary.getBlock).mockRejectedValue(new Error('private endpoint'));
    await expect(s.checks.ensureAgreement(11155111)).rejects.toMatchObject({ code: 'rpc_unavailable' });
    expect(s.events).toEqual([]);
  });
  it.each([null, { number: 91n, hash, parentHash: hash }])('fails closed without a complete header %#', async (block) => {
    const s = setup(); vi.mocked(s.secondary.getBlock).mockResolvedValue(block);
    await expect(s.checks.ensureAgreement(11155111)).rejects.toMatchObject({ code: 'rpc_unavailable' }); expect(s.events).toEqual([]);
  });
  it('fails closed on wrong client chain and insufficient finality', async () => {
    const s = setup(rpc(1n), rpc(1n)); await expect(s.checks.ensureAgreement(11155111)).rejects.toMatchObject({ code: 'rpc_unavailable' });
    const wrong = setup({ ...rpc(), chainId: 1 }); await expect(wrong.checks.ensureAgreement(11155111)).rejects.toMatchObject({ code: 'rpc_unavailable' });
  });
  it('refuses an excessively lagging comparison provider without claiming a fork', async () => {
    const s = setup(rpc(100n), rpc(89n)); await expect(s.checks.ensureAgreement(11155111)).rejects.toMatchObject({ code: 'rpc_unavailable' });
    expect(s.events).toEqual([]); expect(s.primary.getBlock).not.toHaveBeenCalled();
  });
  it('coalesces concurrent checks per configured chain without caching completed agreement', async () => {
    const s = setup(); await Promise.all([s.checks.ensureAgreement(11155111), s.checks.ensureAgreement(11155111)]);
    expect(s.primary.getBlock).toHaveBeenCalledTimes(1); await s.checks.ensureAgreement(11155111); expect(s.primary.getBlock).toHaveBeenCalledTimes(2);
    await s.checks.ensureAgreement(1); expect(s.primary.getBlock).toHaveBeenCalledTimes(2);
  });
});
