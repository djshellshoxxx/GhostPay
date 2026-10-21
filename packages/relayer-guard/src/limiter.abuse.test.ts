import { describe, expect, it } from 'vitest';
import { GuardError } from './errors.js';
import { LossBudget, TokenBucketLimiter, type LossBudgetOptions } from './limiter.js';
import { bucketKey, groupKey, groupOfBucketKey, parseIp } from './ip.js';

function budget(over: Partial<LossBudgetOptions> = {}): { b: LossBudget; clock: { t: number } } {
  const clock = { t: 0 };
  const b = new LossBudget(
    { windowMs: 1000, perKeyLimit: 10n, globalLimit: 100n, maxKeys: 4, ...over },
    () => clock.t,
  );
  return { b, clock };
}

describe('M-2: LossBudget reserve/settle/release is atomic', () => {
  it('50 parallel reserve(5n) against perKeyLimit 10n admit at most 2 (PoC shape)', async () => {
    const { b } = budget();
    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        await Promise.resolve();
        return b.reserve('k', 5n);
      }),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(2);
    expect(b.reserve('k', 1n)).toBeNull();
  });

  it('the global limit holds across keys', () => {
    const { b } = budget({ perKeyLimit: 1000n, globalLimit: 30n, maxKeys: 100 });
    let ok = 0;
    for (let i = 0; i < 50; i++) if (b.reserve(`k${i}`, 5n) !== null) ok++;
    expect(ok).toBe(6);
  });

  it('settle adjusts to the actual cost, never below zero, and is idempotent', () => {
    const { b } = budget();
    const r = b.reserve('k', 10n);
    expect(r).not.toBeNull();
    expect(b.reserve('k', 1n)).toBeNull();
    expect(b.settle(r!, 2n)).toBe(true);
    expect(b.settle(r!, 0n)).toBe(false); // double settle ignored
    const r2 = b.reserve('k', 8n);
    expect(r2).not.toBeNull(); // 2 + 8 = 10 fits exactly
    expect(b.reserve('k', 1n)).toBeNull();
    // actual above the estimate is recorded (real loss), pushing the total over the limit
    b.settle(r2!, 30n);
    expect(b.allows('k')).toBe(false);
    expect(b.charge('k', 0n)).toBe(32n);
  });

  it('release fully refunds; refund cannot drive totals negative', () => {
    const { b } = budget();
    const r = b.reserve('k', 10n)!;
    expect(b.release(r)).toBe(true);
    expect(b.release(r)).toBe(false);
    expect(b.charge('k', 0n)).toBe(0n);
    expect(b.reserve('k', 10n)).not.toBeNull();
  });

  it('a reservation that spans a window rollover does not corrupt the new window', () => {
    const { b, clock } = budget();
    const r = b.reserve('k', 10n)!;
    clock.t = 1000;
    const r2 = b.reserve('k', 10n)!;
    expect(r2).not.toBeNull();
    expect(b.release(r)).toBe(true);
    expect(b.reserve('k', 1n)).toBeNull(); // new window still holds r2's 10n
  });

  it('works through the overflow slot when the table is full of active keys', () => {
    const { b } = budget({ maxKeys: 1, perKeyLimit: 5n });
    expect(b.reserve('a', 5n)).not.toBeNull();
    expect(b.reserve('b', 5n)).not.toBeNull(); // overflow spend
    expect(b.reserve('c', 1n)).toBeNull();
  });

  it('validates inputs and foreign reservations', () => {
    const { b } = budget();
    expect(() => b.reserve('k', -1n)).toThrow(GuardError);
    const r = b.reserve('k', 1n)!;
    expect(() => b.settle(r, -1n)).toThrow(GuardError);
    expect(() => budget().b.settle(r, 1n)).toThrow(GuardError);
    expect(() => b.settle({} as never, 1n)).toThrow(GuardError);
  });

  it('a zero estimate is admitted while below both limits', () => {
    const { b } = budget({ perKeyLimit: 0n });
    expect(b.reserve('k', 0n)).not.toBeNull();
    expect(b.reserve('k', 1n)).toBeNull();
  });
});

function limiter(over: Record<string, unknown> = {}): { l: TokenBucketLimiter; clock: { t: number } } {
  const clock = { t: 0 };
  const l = new TokenBucketLimiter(
    { ratePerSecond: 1, burst: 2, maxKeys: 100, groupOf: (k: string) => k.split(':')[0] as string, ...over },
    () => clock.t,
  );
  return { l, clock };
}

describe('M-3: overflow cannot be monopolised by one group', () => {
  it('PoC block 3: 100 attacker keys in one group do not starve legit newcomers in other groups', () => {
    const { l } = limiter();
    for (let i = 0; i < 100; i++) l.take(`evil:${i}`);
    for (let g = 0; g < 5; g++) {
      expect([1, 2, 3].map(() => l.take(`legit${g}:1`).ok)).toEqual([true, true, false]);
    }
    expect(l.stats().overflowHits).toBeGreaterThan(0);
  });

  it('an attacker spread over many groups still leaves each newcomer its own overflow bucket', () => {
    const { l } = limiter({ maxKeys: 8 });
    for (let i = 0; i < 64; i++) l.take(`g${i}:x`);
    for (let g = 0; g < 4; g++) {
      const r = l.take(`fresh${g}:x`);
      expect(r.ok).toBe(true);
      expect(l.take(`fresh${g}:x`).ok).toBe(true);
    }
  });

  it('caps one group at maxPerGroup table slots', () => {
    const { l } = limiter({ maxPerGroup: 5 });
    for (let i = 0; i < 40; i++) l.take(`evil:${i}`);
    expect(l.size).toBe(5);
    expect(l.stats().tableSize).toBe(5);
  });

  it('falls back to the global overflow bucket when per-group overflow slots run out', () => {
    const { l } = limiter({ maxKeys: 2, maxPerGroup: 1, maxOverflowGroups: 1 });
    l.take('a:1');
    l.take('b:1');
    expect(l.take('c:1').overflow).toBe(true); // group-c overflow slot
    l.take('c:1');
    const d = l.take('d:1'); // overflow table full of active groups: global bucket
    expect(d.overflow).toBe(true);
    expect(l.stats().overflowHits).toBe(3);
  });

  it('L-8: an idle refilled entry behind a drained LRU entry is evicted instead of overflowing', () => {
    const clock = { t: 0 };
    const l = new TokenBucketLimiter({ ratePerSecond: 1, burst: 2, maxKeys: 2 }, () => clock.t);
    l.take('A');
    l.take('A'); // A drained, oldest
    l.take('B'); // B has 1 token
    clock.t = 1000; // B refilled to 2 (idle); A has 1 (not idle) and is the LRU entry
    expect(l.take('D')).toEqual({ ok: true, retryAfterMs: 0, overflow: false });
  });

  it('a saturated group evicts its own idle entry before overflowing', () => {
    const { l, clock } = limiter({ maxPerGroup: 2 });
    l.take('g:1');
    l.take('g:2');
    clock.t = 5000; // both idle
    expect(l.take('g:3').overflow).toBe(false);
    expect(l.size).toBe(2);
  });

  it('validates the new options', () => {
    expect(() => limiter({ maxPerGroup: 0 })).toThrow(GuardError);
    expect(() => limiter({ maxOverflowGroups: 0 })).toThrow(GuardError);
  });
});

describe('group helpers', () => {
  it('groups IPv6 by /48 and IPv4 by /24', () => {
    const a = parseIp('2001:db8:1:1::1')!;
    const b = parseIp('2001:db8:1:ffff::9')!;
    const c = parseIp('2001:db8:2::1')!;
    expect(groupKey(a)).toBe(groupKey(b));
    expect(groupKey(a)).not.toBe(groupKey(c));
    expect(groupKey(parseIp('203.0.113.7')!)).toBe(groupKey(parseIp('203.0.113.200')!));
    expect(groupKey(parseIp('203.0.113.7')!)).not.toBe(groupKey(parseIp('203.0.114.7')!));
    expect(groupOfBucketKey(bucketKey(a))).toBe(groupKey(b));
    expect(groupOfBucketKey(bucketKey(parseIp('203.0.113.7')!))).toBe(groupKey(parseIp('203.0.113.9')!));
    expect(groupOfBucketKey('not-an-ip')).toBe('not-an-ip');
  });
});
