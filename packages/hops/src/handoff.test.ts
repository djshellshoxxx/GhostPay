import { describe, expect, it } from 'vitest';
import { assertHopsAllowed, handoffInfo } from './handoff.js';
import { makePlan } from './helpers.testutil.js';
import { addressOfSecret } from './stub.sig.testutil.js';

describe('handoff', () => {
  it('terminal is the last hop address with working scoped key; delay credited 0', async () => {
    const { env, plan } = await makePlan({ hops: 2, handoff: 'pool-exit' });
    const h = handoffInfo(plan, env.addrs);
    expect(h.terminal).toBe(plan.legs[1]?.to);
    expect(h.creditedDelayMs).toBe(0);
    expect(h.hopDelayMs).toBe(plan.legs.reduce((a, l) => a + l.delayMs, 0));
    expect(h.hopDelayMs).toBeGreaterThan(0);
    expect(h.notes.join(' ')).toContain('add no privacy');
    expect(await h.withSecret((s) => Promise.resolve(addressOfSecret(s)))).toBe(h.terminal);
  });
  it('zero hops: terminal is the source; credit still 0', async () => {
    const { env, plan } = await makePlan({ hops: 0, handoff: 'pool-exit' });
    const h = handoffInfo(plan, env.addrs);
    expect(h.terminal).toBe(plan.source);
    expect(h.hopDelayMs).toBe(0);
    expect(h.creditedDelayMs).toBe(0);
    expect(await h.withSecret((s) => Promise.resolve(addressOfSecret(s)))).toBe(plan.source);
  });
  it('rejects non-pool plan, external terminal, mainnet, post-exit', async () => {
    const a = await makePlan({ hops: 1 });
    expect(() => handoffInfo(a.plan, a.env.addrs)).toThrowError(expect.objectContaining({ code: 'HANDOFF_REJECTED' }) as Error);
    const ext = await makePlan({ hops: 1, handoff: 'pool-exit', finalDestination: { kind: 'external', address: '0x00000000000000000000000000000000000e0001' } });
    expect(() => handoffInfo(ext.plan, ext.env.addrs)).toThrowError(expect.objectContaining({ code: 'HANDOFF_REJECTED' }) as Error);
    expect(() => handoffInfo({ ...a.plan, chainId: 1 }, a.env.addrs)).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
    expect(() => assertHopsAllowed('post-exit')).toThrowError(expect.objectContaining({ code: 'HANDOFF_REJECTED' }) as Error);
    expect(() => assertHopsAllowed('pre-pool')).not.toThrow();
  });
});
