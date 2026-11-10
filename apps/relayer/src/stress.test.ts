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
