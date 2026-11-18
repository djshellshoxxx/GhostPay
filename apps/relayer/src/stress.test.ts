import { describe, expect, it } from 'vitest';
import { CHAIN_ID, DEST, OWNER, USDC, call, errCode, startHarness } from './harness.testutil.js';

describe('bounded HTTP burst and recovery', () => {
  it('contains 128 concurrent distinct-client quotes with the global budget and recovers after refill', async () => {
    const h = await startHarness({ config: {
      trustedProxies: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
      rateLimit: {
        ipPerMinute: 60, ipBurst: 2, ownerPerMinute: 60, ownerBurst: 20,
        maxKeys: 1024, saltRotationHours: 24, quoteGlobalPerMinute: 20, quoteGlobalBurst: 20,
        // one /24: keep its group budget out of the way, this exercises the global one
        quoteGroupPerMinute: 6000, quoteGroupBurst: 1000,
      },
    } });
    try {
      const body = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
      const responses = await Promise.all(Array.from({ length: 128 }, (_, i) =>
        call(h, 'POST', '/v1/quote', body, { 'x-forwarded-for': `203.0.113.${String(i + 1)}` })));
      expect(responses.filter((r) => r.status === 200)).toHaveLength(20);
      const refused = responses.filter((r) => r.status !== 200);
      expect(refused).toHaveLength(108);
      for (const r of refused) {
        expect(r.status).toBe(429);
        expect(errCode(r)).toBe('rate_limited_global');
        expect(r.headers.get('retry-after')).toBeTruthy();
      }
      expect(h.fake.sent).toHaveLength(0);
      expect((await call(h, 'GET', '/healthz')).status).toBe(200);
      h.clock.ms += 60_001;
      expect((await call(h, 'POST', '/v1/quote', body, { 'x-forwarded-for': '198.51.100.1' })).status).toBe(200);
    } finally {
      await h.stop();
      h.relayer.dispose();
    }
  });
});

describe('bounded sweep flood with the state journal', () => {
  it('admits at most queue.maxPending, sends one at a time with unique nonces, and persists exactly the gas paid', async () => {
    const { MemoryStateBackend, StateJournal, decodeState } = await import('./stateStore.js');
    const { prepare, testConfig, FakeChain, NOW_MS } = await import('./harness.testutil.js');
    const backend = new MemoryStateBackend();
    const fake = new FakeChain();
    let open: () => void = () => undefined;
    fake.sendGate = new Promise((r) => { open = r; });
    const chain = testConfig().chains[0];
    if (chain === undefined) throw new Error('chain');
    const h = await startHarness({
      fake,
      journal: new StateJournal(backend, () => NOW_MS),
      config: {
        queue: { maxPending: 8, receiptTimeoutSeconds: 30 },
        chains: [{ ...chain, dailyBudgetWei: 10n ** 18n }],
        rateLimit: { ...testConfig().rateLimit, ipPerMinute: 10_000, ipBurst: 1000 },
        lossBudget: { windowSeconds: 3600, perKeyWei: 10n ** 18n, globalWei: 10n ** 18n, maxKeys: 100 },
      },
    });
    try {
      const keys = Array.from({ length: 40 }, (_, i) => `0x${(i + 1).toString(16).padStart(64, '0')}` as const);
      const bodies = await Promise.all(keys.map((k) => prepare(h, { ownerKey: k, nonce: 1n }).then((p) => p.body)));
      let refusedSoFar = 0;
      const pending = bodies.map((b) => call(h, 'POST', '/v1/sweep', b).then((r) => {
        if (r.status !== 200) refusedSoFar += 1;
        return r;
      }));
      // The admitted 8 wait on the held send; every other request is answered at once. Open only when all have been.
      for (let i = 0; i < 300 && refusedSoFar < 32; i += 1) await new Promise((r) => setTimeout(r, 20));
      open();
      const replies = await Promise.all(pending);
      const ok = replies.filter((r) => r.status === 200);
      const full = replies.filter((r) => r.status === 503);
      expect(ok).toHaveLength(8);
      expect(full).toHaveLength(32);
      for (const r of full) expect(errCode(r)).toBe('queue_full');
      await new Promise((r) => setTimeout(r, 300));
      expect(fake.maxInFlight).toBe(1);
      expect(fake.sent.map((s) => s.opts.nonce)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
      const stored = decodeState(backend.text ?? '').get(CHAIN_ID);
      expect(stored?.sends).toEqual([]);
      expect(stored?.budget.spentWei).toBe(8n * 100_000n * 1_000_000_000n);
    } finally {
      await h.stop();
    }
  });
});
