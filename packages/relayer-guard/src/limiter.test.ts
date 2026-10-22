import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GuardError } from './errors.js';
import { LossBudget, TokenBucketLimiter, type TokenBucketOptions } from './limiter.js';

function limiter(opts: Partial<TokenBucketOptions> = {}): { l: TokenBucketLimiter; clock: { t: number } } {
  const clock = { t: 0 };
  const l = new TokenBucketLimiter({ ratePerSecond: 1, burst: 3, maxKeys: 4, ...opts }, () => clock.t);
  return { l, clock };
}

describe('TokenBucketLimiter', () => {
  it('allows the burst then refills at the rate', () => {
    const { l, clock } = limiter();
    for (let i = 0; i < 3; i++) expect(l.take('a').ok).toBe(true);
    const denied = l.take('a');
    expect(denied).toEqual({ ok: false, retryAfterMs: 1000, overflow: false });
    clock.t += 1000;
    expect(l.take('a').ok).toBe(true);
    expect(l.take('b').ok).toBe(true);
  });

  it('a backwards clock step never removes tokens (haiku L6)', () => {
    const { l, clock } = limiter();
    clock.t = 10_000;
    l.take('a');
    clock.t = 0;
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(true);
    clock.t = 5_000; // still behind the stored timestamp: no refill, no loss
    expect(l.take('a').ok).toBe(false);
  });

  it('key flooding cannot evict and refill a drained bucket', () => {
    const { l } = limiter({ maxKeys: 2, overflowBurst: 1 });
    for (let i = 0; i < 3; i++) l.take('victim');
    expect(l.take('victim').ok).toBe(false);
    expect(l.take('k1').ok).toBe(true); // second slot
    const flood = Array.from({ length: 50 }, (_, i) => l.take(`spam${i}`));
    expect(flood[0]?.overflow).toBe(true);
    expect(flood.filter((r) => r.ok)).toHaveLength(1); // the overflow bucket holds 1 token
    expect(l.take('victim').ok).toBe(false);
    expect(l.size).toBe(2);
  });

  it('partitions key floods into a shared abuse-group budget', () => {
    const { l } = limiter({ maxKeys: 8, maxPerGroup: 1, overflowBurst: 1 });
    expect(l.take('client-a-1', 1, 'net-a').ok).toBe(true);
    expect(l.take('client-a-2', 1, 'net-a')).toMatchObject({ ok: true, overflow: true });
    expect(l.take('client-a-3', 1, 'net-a').ok).toBe(false);
    expect(l.take('client-b-1', 1, 'net-b').ok).toBe(true);
  });

  it('evicts only idle (fully refilled) buckets', () => {
    const { l, clock } = limiter({ maxKeys: 1 });
    l.take('a');
    expect(l.take('b').overflow).toBe(true);
    clock.t += 1000; // a is full again
    const r = l.take('b');
    expect(r.overflow).toBe(false);
    expect(l.size).toBe(1);
  });

  it('cost above capacity is never satisfiable; zero cost always passes', () => {
    const { l } = limiter();
    expect(l.take('a', 4)).toEqual({ ok: false, retryAfterMs: Number.POSITIVE_INFINITY, overflow: false });
    expect(l.take('a', 0).ok).toBe(true);
    expect(() => l.take('a', -1)).toThrow(GuardError);
  });

  it.each<[Partial<TokenBucketOptions>]>([
    [{ ratePerSecond: 0 }],
    [{ burst: 0.5 }],
    [{ maxKeys: 0 }],
    [{ overflowBurst: 0 }],
  ])('rejects config %j', (bad) => {
    expect(() => limiter(bad)).toThrow(GuardError);
  });

  it('default clock works', () => {
    expect(new TokenBucketLimiter({ ratePerSecond: 1, burst: 1, maxKeys: 1 }).take('a').ok).toBe(true);
  });

  it('property: over any schedule, admitted <= burst + rate * elapsed per key', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 3000 }), { minLength: 1, maxLength: 80 }), (gaps) => {
        const { l, clock } = limiter({ maxKeys: 1 });
        let admitted = 0;
        for (const g of gaps) {
          clock.t += g;
          if (l.take('k').ok) admitted++;
        }
        return admitted <= 3 + clock.t / 1000 + 1e-9;
      }),
    );
  });
});

describe('LossBudget (S3-06)', () => {
  function budget(maxKeys = 4): { b: LossBudget; clock: { t: number } } {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 250n, maxKeys },
      () => clock.t,
    );
    return { b, clock };
  }

  it('blocks a key after its limit and resets next window', () => {
    const { b, clock } = budget();
    expect(b.allows('x')).toBe(true);
    expect(b.charge('x', 60n)).toBe(60n);
    expect(b.allows('x')).toBe(true);
    expect(b.charge('x', 40n)).toBe(100n);
    expect(b.allows('x')).toBe(false);
    expect(b.allows('y')).toBe(true);
    clock.t += 1000;
    expect(b.allows('x')).toBe(true);
    expect(b.charge('x', 1n)).toBe(1n);
  });

  it('the global limit binds across keys (fresh addresses do not help)', () => {
    const { b } = budget(10);
    b.charge('a', 99n);
    b.charge('b', 99n);
    b.charge('c', 60n);
    expect(b.allows('fresh')).toBe(false);
  });

  it('loss keys in one abuse group share overflow accounting when its partition quota is full', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 1000n, maxKeys: 4, maxPerGroup: 1 },
      () => clock.t,
    );
    expect(b.charge('owner-a', 60n, 'net-a')).toBe(60n);
    expect(b.charge('owner-b', 40n, 'net-a')).toBe(40n);
    expect(b.allows('owner-c', 'net-a')).toBe(false);
    expect(b.allows('owner-z', 'net-b')).toBe(true);
  });

  it('when full of active keys, newcomers share the overflow entry', () => {
    const { b, clock } = budget(1);
    b.charge('a', 10n);
    expect(b.charge('n1', 50n)).toBe(50n);
    expect(b.charge('n2', 50n)).toBe(100n);
    expect(b.allows('n3')).toBe(false);
    clock.t += 1000; // 'a' is now idle and can be evicted
    expect(b.allows('n4')).toBe(true);
    expect(b.charge('n4', 5n)).toBe(5n);
  });

  it('validates config and amounts', () => {
    expect(() => new LossBudget({ windowMs: 0, perKeyLimit: 1n, globalLimit: 1n, maxKeys: 1 })).toThrow(
      GuardError,
    );
    expect(() => new LossBudget({ windowMs: 1, perKeyLimit: -1n, globalLimit: 1n, maxKeys: 1 })).toThrow(
      GuardError,
    );
    expect(() => new LossBudget({ windowMs: 1, perKeyLimit: 1n, globalLimit: 1n, maxKeys: 0 })).toThrow(
      GuardError,
    );
    const b = new LossBudget({ windowMs: 1000, perKeyLimit: 1n, globalLimit: 1n, maxKeys: 1 });
    expect(() => b.charge('a', -1n)).toThrow(GuardError);
    expect(b.allows('a')).toBe(true);
  });

  it('reserves loss capacity atomically and settles or releases once', () => {
    const { b } = budget();
    const first = b.reserve('owner', 70n);
    expect(first).not.toBeNull();
    expect(b.reserve('owner', 40n)).toBeNull();
    expect(first?.settle(30n)).toBe(true);
    expect(first?.settle(0n)).toBe(false);
    expect(b.allows('owner')).toBe(true);
    const second = b.reserve('owner', 60n);
    expect(second?.release()).toBe(true);
    expect(second?.release()).toBe(false);
    expect(b.reserve('owner', 70n)).not.toBeNull();
  });

  it('late reservation settlement is charged in the current window; release cannot reset it', () => {
    const { b, clock } = budget();
    const pending = b.reserve('owner', 80n);
    expect(pending).not.toBeNull();
    clock.t += 1000;
    b.charge('other', 40n);
    expect(pending?.release()).toBe(true);
    expect(b.allows('other')).toBe(true);
    const lateLoss = b.reserve('late', 10n);
    expect(lateLoss).not.toBeNull();
    clock.t += 1000;
    b.charge('current', 240n);
    expect(lateLoss?.settle(20n)).toBe(true);
    expect(b.allows('fresh')).toBe(false);
  });
});
