// Killer tests for surviving Stryker mutants in packages/relayer-guard. Drop into packages/relayer-guard/src/.
import { describe, expect, it } from 'vitest';
import { GuardedBreaker, type GuardedBreakerOptions, type Outcome } from './breaker.js';
import { TrustedProxies, resolveClientIp } from './client.js';
import { bucketKey, cidrContains, parseCidr, parseIp } from './ip.js';
import { LossBudget, TokenBucketLimiter } from './limiter.js';

describe('killers: ip.ts', () => {
  it('rejects IPv6 zone ids (ip.ts:52 includes("%"))', () => {
    expect(parseIp('fe80::1%eth0')).toBeNull();
    expect(parseIp('::1%1')).toBeNull();
  });
  it('only ::ffff:0:0/96 is normalised to IPv4 (ip.ts:56)', () => {
    expect(parseIp('::ffff:1.2.3.4')).toEqual({ family: 4, bytes: Uint8Array.of(1, 2, 3, 4) });
    for (const t of ['::fffe:1.2.3.4', '::ff00:1.2.3.4', '::00ff:1.2.3.4', '2001:db8::ffff:1.2.3.4', '1::ffff:0102:0304']) {
      expect(parseIp(t)?.family, t).toBe(6);
    }
  });
  it('a v6 block never contains a v4 address and vice versa (ip.ts:96)', () => {
    const v4 = parseIp('1.2.3.4')!;
    expect(cidrContains(parseCidr('::/0'), v4)).toBe(false);
    expect(cidrContains(parseCidr('0.0.0.0/0'), parseIp('::1')!)).toBe(false);
    expect(cidrContains(parseCidr('0.0.0.0/0'), v4)).toBe(true);
  });
  it('bucketKey prefix bounds are inclusive (ip.ts:130-131)', () => {
    const a = parseIp('203.0.113.7')!;
    const b = parseIp('2001:db8::1')!;
    expect(bucketKey(a, { v4: 1 })).toBe('4:128.0.0.0/1');
    expect(bucketKey(a, { v4: 32 })).toBe('4:203.0.113.7/32');
    expect(bucketKey(b, { v6: 1 })).toBe('6:0:0:0:0:0:0:0:0/1');
    expect(bucketKey(b, { v6: 128 })).toBe('6:2001:db8:0:0:0:0:0:1/128');
    for (const v4 of [0, 33, 1.5, NaN]) expect(() => bucketKey(a, { v4 })).toThrow();
    for (const v6 of [0, 129, 1.5, NaN]) expect(() => bucketKey(b, { v6 })).toThrow();
  });
  it('parseCidr rejects negative-looking and oversize prefixes (ip.ts:79)', () => {
    for (const t of ['1.2.3.4/33', '1.2.3.4/-1', '::/129', '1.2.3.4/1/2', '1.2.3.4/', '1.2.3.4/ 8', 'x/8', '1.2.3.4/08x']) {
      expect(() => parseCidr(t), t).toThrow();
    }
    expect(parseCidr('1.2.3.4/0').prefix).toBe(0);
  });
});

describe('killers: client.ts', () => {
  const trusted = new TrustedProxies(['10.0.0.0/8']);
  it('maxEntries bounds are inclusive 1..256 (client.ts:60)', () => {
    const base = { peer: '10.0.0.1', forwardedFor: '6.6.6.6, 198.51.100.9, 10.0.0.2', trusted };
    expect(resolveClientIp({ ...base, maxEntries: 1 })?.ip.bytes).toEqual(Uint8Array.of(10, 0, 0, 2)); // only last entry examined, trusted -> leftmost examined
    expect(resolveClientIp({ ...base, maxEntries: 256 })?.ip.bytes).toEqual(Uint8Array.of(198, 51, 100, 9));
    for (const maxEntries of [0, 257, 1.5, NaN]) expect(() => resolveClientIp({ ...base, maxEntries })).toThrow();
  });
});

describe('killers: limiter.ts', () => {
  const mk = (o: Partial<ConstructorParameters<typeof TokenBucketLimiter>[0]> = {}) => {
    const c = { t: 0 };
    return { c, l: new TokenBucketLimiter({ ratePerSecond: 2, burst: 3, maxKeys: 4, ...o }, () => c.t) };
  };
  it('refill is exactly rate * elapsed (limiter.ts:151)', () => {
    const { c, l } = mk();
    l.take('a', 3);
    c.t = 499; expect(l.take('a').ok).toBe(false);
    c.t = 500; expect(l.take('a').ok).toBe(true);   // 1 token after 500 ms at 2/s
    expect(l.take('a').ok).toBe(false);
  });
  it('retryAfterMs is exact and finite at cost == burst (limiter.ts:145)', () => {
    const { c, l } = mk();
    l.take('a', 3);
    expect(l.take('a', 3)).toEqual({ ok: false, retryAfterMs: 1500, overflow: false });
    c.t = 250;                                          // 0.5 token
    expect(l.take('a', 1)).toEqual({ ok: false, retryAfterMs: 250, overflow: false });
    expect(l.take('a', 3.5).retryAfterMs).toBe(Number.POSITIVE_INFINITY);
  });
  it('burst must be finite and >= 1 (limiter.ts:105)', () => {
    for (const burst of [0.5, 0, NaN, Infinity, -1]) expect(() => mk({ burst }), String(burst)).toThrow();
    expect(() => mk({ burst: 1 })).not.toThrow();
  });
  it('LRU: touching a key protects it from eviction ordering (limiter.ts:24-25)', () => {
    const { l } = mk({ maxKeys: 2 });
    l.take('a', 2);          // a drained -> not idle
    l.take('b', 0);          // b idle (full)
    l.take('a', 0);          // touch a: order is now b, a
    expect(l.take('c').overflow).toBe(false); // evicts idle b, not blocked by active a
    expect(l.take('a', 2).ok).toBe(false);    // a was not evicted (still has 1 token)
  });
  describe('LossBudget', () => {
    const mkb = (o = {}) => {
      const c = { t: 0 };
      return { c, b: new LossBudget({ windowMs: 1000, perKeyLimit: 3n, globalLimit: 5n, maxKeys: 1, ...o }, () => c.t) };
    };
    it('window index is floor(now / windowMs) (limiter.ts:241)', () => {
      const { c, b } = mkb();
      b.charge('k', 3n);
      c.t = 999; expect(b.allows('k')).toBe(false);
      c.t = 1000; expect(b.allows('k')).toBe(true);
    });
    it('global spend resets with the window (limiter.ts:207)', () => {
      const { c, b } = mkb({ perKeyLimit: 10n, maxKeys: 4 });
      b.charge('a', 5n);
      expect(b.allows('z')).toBe(false);
      c.t = 1000; expect(b.allows('z')).toBe(true);
    });
    it('global limit is strict (limiter.ts:208)', () => {
      const { b } = mkb({ perKeyLimit: 10n, maxKeys: 4 });
      b.charge('a', 4n); expect(b.allows('z')).toBe(true);
      b.charge('a', 1n); expect(b.allows('z')).toBe(false);
    });
    it('zero amounts and zero limits are legal, negatives are not (limiter.ts:197,219)', () => {
      const { b } = mkb();
      expect(b.charge('k', 0n)).toBe(0n);
      expect(() => b.charge('k', -1n)).toThrow();
      expect(() => mkb({ perKeyLimit: 0n })).not.toThrow();
      expect(() => mkb({ globalLimit: 0n })).not.toThrow();
      expect(() => mkb({ perKeyLimit: -1n })).toThrow();
      expect(() => mkb({ globalLimit: -1n })).toThrow();
    });
    it('stale-window entries are evictable, so a new window does not collapse into the overflow entry (limiter.ts:199)', () => {
      const { c, b } = mkb({ perKeyLimit: 3n, globalLimit: 100n });
      b.charge('k1', 1n);
      c.t = 1000;
      b.charge('k2', 3n);                     // must take k1's slot (stale) instead of the shared overflow
      expect(b.allows('k2')).toBe(false);
      expect(b.allows('k3')).toBe(true);      // k3 shares overflow, which k2 must not have polluted
    });
  });
});

describe('killers: breaker.ts', () => {
  const O: GuardedBreakerOptions = { windowSize: 3, minSamples: 3, failureRatio: 0.5, cooldownMs: 10_000, probeTimeoutMs: 500 };
  const mk = (o: Partial<GuardedBreakerOptions> = {}, t0 = 0) => {
    const c = { t: t0 };
    return { c, b: new GuardedBreaker({ ...O, ...o }, () => c.t) };
  };
  const settle = (b: GuardedBreaker, o: Outcome) => b.tryAcquire()!.settle(o);

  it('probeTimeoutMs must be > 0 (breaker.ts:87)', () => {
    expect(() => mk({ probeTimeoutMs: 0 })).toThrow();
  });
  it('no phantom sample on a fresh breaker (breaker.ts:66)', () => {
    const { b } = mk({ minSamples: 2, windowSize: 4, failureRatio: 0.5 });
    settle(b, 'failure');
    expect(b.state).toBe('closed');
  });
  it('neutral outcomes are not recorded (breaker.ts:198)', () => {
    const { b } = mk({ minSamples: 2, windowSize: 4, failureRatio: 0.5 });
    settle(b, 'neutral'); settle(b, 'failure');
    expect(b.state).toBe('closed');
  });
  it('window slides: old failures age out (breaker.ts:200)', () => {
    const { b } = mk();
    for (const o of ['failure', 'success', 'success'] as const) settle(b, o);
    settle(b, 'failure');                    // window [S,S,F] = 1/3 < 0.5; an unbounded window would give 2/4
    expect(b.state).toBe('closed');
  });
  it('only a failure can trip (breaker.ts:201)', () => {
    const { b } = mk({ windowSize: 10 });
    settle(b, 'failure'); settle(b, 'failure'); settle(b, 'success');
    expect(b.state).toBe('closed');
  });
  it('retryAfterMs is 0 when closed, a nonzero floor while half-open (breaker.ts:107)', () => {
    const { c, b } = mk();
    expect(b.retryAfterMs()).toBe(0);
    b.trip(); c.t = 10_000;
    expect(b.tryAcquire()?.probe).toBe(true);
    // Half-open with a probe in flight: since the M-4 fix this is a nonzero floor, not 0 (see DEVIATIONS.md).
    expect(b.retryAfterMs()).toBeGreaterThan(0);
  });
  it('health uses now - openedAt (breaker.ts:101)', () => {
    const { c, b } = mk({}, 6000);
    b.trip(); c.t = 6500;                   // now + openedAt (12 500) >= cooldown (10 000) would wrongly read as elapsed
    expect(b.health()).toBe('unhealthy');
    c.t = 16_000; expect(b.health()).toBe('degraded');
  });
  it('a probe that outlives probeTimeoutMs cannot close the breaker (breaker.ts:177)', () => {
    const { c, b } = mk();
    b.trip(); c.t = 10_000;
    const p = b.tryAcquire()!;
    c.t = 10_600;
    expect(p.settle('success')).toBe(false);
    expect(b.state).toBe('open');
  });
  it('expired probe restarts the cooldown at issued + timeout (breaker.ts:213)', () => {
    const { c, b } = mk();
    b.trip(); c.t = 10_000; b.tryAcquire();
    c.t = 14_000;
    expect(b.state).toBe('open');
    expect(b.retryAfterMs()).toBe(10_000 - (14_000 - 10_500));
  });
  it('run() hands the classifier the exact result objects (breaker.ts:160,163)', async () => {
    const { b } = mk();
    const seen: unknown[] = [];
    await b.run(async () => await Promise.resolve(7), (r) => { seen.push(r); return 'success'; });
    const boom = new Error('x');
    await expect(b.run(async () => { await Promise.resolve(); throw boom; }, (r) => { seen.push(r); return 'neutral'; })).rejects.toBe(boom);
    expect(seen).toEqual([{ ok: true, value: 7 }, { ok: false, error: boom }]);
  });
});
