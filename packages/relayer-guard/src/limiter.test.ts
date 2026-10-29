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

  it('L5-02: a multi-source reservation charges every key and group but the global limit once', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 150n, maxKeys: 8 },
      () => clock.t,
    );
    const sources = [
      { key: 'dst:a', kind: 'dst' },
      { key: 'net:a', group: 'net:g', kind: 'net' },
    ];
    const first = b.reserveAll(sources, 70n);
    expect(first).not.toBeNull();
    expect(first?.overflow).toBe(false);
    expect(b.allows('dst:a')).toBe(true); // 70 of 100
    expect(b.allows('net:other', 'net:g')).toBe(true); // the group holds 70 of 100
    expect(b.reserveAll([{ key: 'dst:b' }, { key: 'net:b', group: 'net:h' }], 80n)).not.toBeNull(); // global 150
    expect(b.allowsAll([{ key: 'dst:c' }])).toBe(false);
    expect(first?.settle(70n)).toBe(true); // loss equal to the estimate: totals unchanged
    expect(first?.settled).toBe(true);
    expect(b.allowsAll([{ key: 'dst:c' }])).toBe(false);
    clock.t += 1000;
    expect(b.reserveAll(sources, 100n)).not.toBeNull();
    expect(b.reserveAll([{ key: 'net:z', group: 'net:g' }], 1n)).toBeNull(); // shared group is full
    expect(() => b.reserveAll([], 1n)).toThrow(GuardError);
  });

  it('L5-02: the clean reserve is only for sources with no loss in this window', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 1000n, globalLimit: 400n, maxKeys: 8, cleanReserve: 100n },
      () => clock.t,
    );
    b.reserveAll([{ key: 'dirty' }], 50n)?.settle(50n); // a settled loss marks the source
    expect(b.reserveAll([{ key: 'dirty' }], 251n)).toBeNull(); // 50 + 251 > 400 - 100
    const held = b.reserveAll([{ key: 'dirty' }], 250n); // exactly up to 300
    expect(held).not.toBeNull();
    expect(b.allowsAll([{ key: 'dirty' }])).toBe(false);
    expect(b.allows('clean')).toBe(true);
    expect(b.allowsAll([{ key: 'clean' }, { key: 'dirty' }])).toBe(false); // any lossy source makes it unclean
    const clean = b.reserveAll([{ key: 'clean' }], 100n);
    expect(clean).not.toBeNull(); // the reserve is still available to clean sources
    expect(b.allows('clean2')).toBe(false);
    clean?.release();
    held?.release(); // an unsettled reservation is not a loss
    b.charge('other', 1n);
    expect(b.allows('other')).toBe(true); // 51 of 300 for lossy sources
    clock.t += 1000; // a new window forgets the loss
    expect(b.reserveAll([{ key: 'dirty' }], 400n)).not.toBeNull();
    expect(
      () => new LossBudget({ windowMs: 1, perKeyLimit: 1n, globalLimit: 1n, maxKeys: 1, cleanReserve: 2n }),
    ).toThrow(GuardError);
    expect(
      () => new LossBudget({ windowMs: 1, perKeyLimit: 1n, globalLimit: 1n, maxKeys: 1, cleanReserve: -1n }),
    ).toThrow(GuardError);
  });

  it('L5-02: a late settlement is charged once to the current window', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 1000n, globalLimit: 100n, maxKeys: 8 },
      () => clock.t,
    );
    const r = b.reserveAll([{ key: 'dst:a' }, { key: 'net:a' }], 10n);
    clock.t += 1000;
    expect(r?.settle(60n)).toBe(true);
    expect(b.reserveAll([{ key: 'x' }], 40n)).not.toBeNull(); // 60 + 40 = 100: charged once, not twice
    expect(b.allows('y')).toBe(false);
  });

  it('L5-04: stale groups are evicted, so a full group table overflows only on live entries', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 10_000n, maxKeys: 2 },
      () => clock.t,
    );
    b.charge('a', 1n, 'g-a');
    b.charge('b', 1n, 'g-b');
    clock.t += 1000; // both groups (and keys) are stale now
    const c = b.reserve('c', 100n, 'g-c');
    expect(c?.overflow).toBe(false);
    expect(b.allows('d', 'g-d')).toBe(true); // used to share one never-evicted overflow group with g-c
    expect(b.reserve('d', 100n, 'g-d')?.overflow).toBe(false);
    // Now both tables are full of live entries: newcomers overflow, and the reservation says so.
    const e = b.reserve('e', 10n, 'g-e');
    expect(e?.overflow).toBe(true);
    expect(b.allows('f', 'g-f')).toBe(true); // 10 of 100 in the overflow entry
  });

  it('L5-04: sources of different kinds never share an overflow entry; one sweep charges it once', () => {
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 10_000n, maxKeys: 1 },
      () => 0,
    );
    b.charge('live', 1n, 'live'); // both tables full of a live entry
    const sweep = (i: number) => [
      { key: `dst:${String(i)}`, kind: 'dst' },
      { key: `net:${String(i)}`, group: `net:g${String(i)}`, kind: 'net' },
    ];
    const r = b.reserveAll(sweep(1), 60n);
    expect(r?.overflow).toBe(true); // a shared overflow entry would hold 120 > 100 and refuse it
    expect(b.reserveAll(sweep(2), 50n)).toBeNull(); // each kind's overflow already holds 60
    r?.release();
    expect(b.reserveAll(sweep(3), 100n)).not.toBeNull();
    for (let i = 0; i < 5; i++) b.allowsAll([{ key: `k${String(i)}`, kind: `kind${String(i)}` }]); // 8 kinds with '', dst, net
    expect(() => b.allowsAll([{ key: 'k', kind: 'one-too-many' }])).toThrow(GuardError);
  });

  it('a reservation is admitted against the entries it really gets, and leaves nothing behind when refused', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 10_000n, maxKeys: 2, maxPerGroup: 1 },
      () => clock.t,
    );
    b.charge('old', 1n, 'g-old');
    clock.t += 1000; // 'old' is now the one evictable slot
    b.charge('a1', 1n, 'G');
    b.charge('a2', 95n, 'G'); // G's key quota is full: a2 is charged to the overflow entry
    // Two new keys, one free slot: the second must use the overflow entry, which has only 5 left.
    expect(
      b.reserveAll(
        [
          { key: 'n1', group: 'h1' },
          { key: 'n2', group: 'h2' },
        ],
        10n,
      ),
    ).toBeNull();
    // Nothing was kept: the one slot is still free for a single newcomer.
    const single = b.reserve('n3', 10n, 'h3');
    expect(single?.overflow).toBe(false);
  });

  it('L5-04: a read-only probe does not keep a stale key from being evicted', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 10_000n, maxKeys: 2 },
      () => clock.t,
    );
    b.charge('old', 1n, 'g');
    clock.t += 1000;
    b.charge('live', 1n, 'g2');
    expect(b.allows('old', 'g')).toBe(true); // probing 'old' must not make it the most recent entry
    expect(b.reserve('new', 10n, 'g3')?.overflow).toBe(false); // evicts stale 'old', not live 'live'
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
