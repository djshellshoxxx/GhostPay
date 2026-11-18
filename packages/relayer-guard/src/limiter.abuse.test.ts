import { describe, expect, it } from 'vitest';
import type { LimiterStats } from './index.js';
import { LossBudget, TokenBucketLimiter, type TokenBucketOptions } from './limiter.js';

/** Keys look like `<group>:<client>`; time is the limiter's injected clock. */
function limiter(opts: Partial<TokenBucketOptions> = {}): { l: TokenBucketLimiter; clock: { t: number } } {
  const clock = { t: 0 };
  const l = new TokenBucketLimiter(
    {
      ratePerSecond: 1,
      burst: 2,
      maxKeys: 8,
      groupOf: (k: string) => k.split(':')[0] as string,
      ...opts,
    },
    () => clock.t,
  );
  return { l, clock };
}

/** Drains `key` completely (burst tokens at the current instant). */
function drain(l: TokenBucketLimiter, key: string, burst: number): void {
  for (let i = 0; i < burst; i++) l.take(key);
}

describe('T-dd756b08-3 (M-3): per-group overflow while the key table is full', () => {
  it('adversarial: a table filled by several groups at their quota leaves each newcomer group its own bucket', () => {
    // 4 attacker groups x maxPerGroup 2 = all 8 slots, every bucket drained (none idle).
    const { l } = limiter({ maxPerGroup: 2 });
    for (let g = 0; g < 4; g++) for (let k = 0; k < 2; k++) drain(l, `evil${String(g)}:${String(k)}`, 2);
    expect(l.size).toBe(8);
    // The attacker keeps flooding with fresh keys of its own groups: they share their group's overflow.
    for (let g = 0; g < 4; g++) for (let k = 2; k < 10; k++) l.take(`evil${String(g)}:${String(k)}`);
    // Honest newcomers from 5 different groups each get a full overflow bucket of their own.
    for (let g = 0; g < 5; g++) {
      const key = `honest${String(g)}:1`;
      expect(l.take(key)).toEqual({ ok: true, retryAfterMs: 0, overflow: true });
      expect(l.take(key)).toEqual({ ok: true, retryAfterMs: 0, overflow: true });
      expect(l.take(key).ok).toBe(false); // its own overflow bucket is drained, nobody else's
    }
    // A second client of a drained newcomer group shares that group's overflow bucket.
    expect(l.take('honest0:2').ok).toBe(false);
  });

  it('per-group overflow is the default (maxOverflowGroups 1024), not one global bucket', () => {
    const { l } = limiter({ maxKeys: 2, maxPerGroup: 1 });
    drain(l, 'a:1', 2);
    drain(l, 'b:1', 2);
    drain(l, 'c:1', 2); // c's own overflow bucket
    expect(l.take('c:1').ok).toBe(false);
    expect(l.take('d:1')).toEqual({ ok: true, retryAfterMs: 0, overflow: true }); // not charged to c's bucket
  });

  it('explicit maxOverflowGroups 0 keeps the single shared overflow bucket', () => {
    const { l } = limiter({ maxKeys: 2, maxPerGroup: 1, maxOverflowGroups: 0 });
    drain(l, 'a:1', 2);
    drain(l, 'b:1', 2);
    drain(l, 'c:1', 2);
    expect(l.take('d:1')).toEqual({ ok: false, retryAfterMs: 1000, overflow: true });
  });

  it('the overflow table is bounded; when it is full of live buckets the shared bucket is the last resort', () => {
    const { l } = limiter({ maxKeys: 1, maxPerGroup: 1, maxOverflowGroups: 2 });
    drain(l, 'a:1', 2); // table full
    drain(l, 'x:1', 2); // overflow table slot 1, drained
    drain(l, 'y:1', 2); // overflow table slot 2, drained
    expect(l.take('z:1')).toEqual({ ok: true, retryAfterMs: 0, overflow: true }); // shared bucket
    expect(l.take('w:1')).toEqual({ ok: true, retryAfterMs: 0, overflow: true }); // shared bucket
    expect(l.take('v:1')).toEqual({ ok: false, retryAfterMs: 1000, overflow: true }); // shared bucket drained
    expect(l.take('x:1').ok).toBe(false); // x keeps its own (drained) bucket
  });

  it('idle (refilled) overflow buckets are evicted, so the overflow table does not fill up for good', () => {
    // Slow main buckets (burst 4) stay live while the 1-token overflow buckets refill in 1 s.
    const { l, clock } = limiter({
      burst: 4,
      overflowBurst: 1,
      maxKeys: 1,
      maxPerGroup: 1,
      maxOverflowGroups: 1,
    });
    drain(l, 'a:1', 4);
    expect(l.take('x:1').ok).toBe(true); // x holds the only overflow slot, drained
    expect(l.take('y:1').ok).toBe(true); // shared bucket, drained
    expect(l.take('z:1').ok).toBe(false);
    clock.t = 1000; // x's overflow bucket and the shared bucket are full again; a is not (1 of 4)
    expect(l.take('w:1')).toEqual({ ok: true, retryAfterMs: 0, overflow: true }); // evicts idle x
    expect(l.take('v:1')).toEqual({ ok: true, retryAfterMs: 0, overflow: true }); // the shared token is still there
  });

  it('a group cannot refill its drained overflow bucket by switching keys', () => {
    const { l } = limiter({ maxKeys: 1, maxPerGroup: 1 });
    drain(l, 'a:1', 2);
    drain(l, 'evil:1', 2);
    for (let k = 2; k < 50; k++) expect(l.take(`evil:${String(k)}`).ok).toBe(false);
  });

  it('rejects a negative or fractional maxOverflowGroups', () => {
    expect(() => limiter({ maxOverflowGroups: -1 })).toThrow();
    expect(() => limiter({ maxOverflowGroups: 1.5 })).toThrow();
  });
});

describe('T-dd756b08-4 (L-8): bounded idle scan on eviction, and stats()', () => {
  it('an idle (refilled) entry behind a drained least-recently-used entry is evicted instead of overflowing', () => {
    const { l, clock } = limiter({ maxKeys: 2 });
    drain(l, 'A', 2); // A drained, least recently used
    l.take('B'); // B holds 1 token
    clock.t = 1000; // B refilled (idle); A holds 1 token (live) and is still the oldest entry
    expect(l.take('D')).toEqual({ ok: true, retryAfterMs: 0, overflow: false });
    expect(l.size).toBe(2);
    expect(l.take('A').ok).toBe(true); // A kept its bucket (1 token), it was not evicted
    expect(l.take('A').ok).toBe(false);
  });

  /** 9 live entries except the one at `idleAt` (0 = oldest), which is idle at t = 1000. */
  function nineWithIdleAt(idleAt: number): TokenBucketLimiter {
    const { l, clock } = limiter({ maxKeys: 9 });
    for (let i = 0; i < 9; i++) drain(l, `k${String(i)}`, i === idleAt ? 1 : 2);
    clock.t = 1000;
    return l;
  }

  it('scans the 8 oldest entries for an idle one, and no further (constant work per insert)', () => {
    expect(nineWithIdleAt(7).take('new').overflow).toBe(false); // 8th oldest: found
    expect(nineWithIdleAt(8).take('new').overflow).toBe(true); // 9th oldest: beyond the scan
  });

  it('the overflow table shares the scan: an idle group bucket behind a live one is evicted', () => {
    const { l, clock } = limiter({
      burst: 4,
      overflowBurst: 2,
      maxKeys: 1,
      maxPerGroup: 1,
      maxOverflowGroups: 2,
    });
    drain(l, 'a:1', 4);
    drain(l, 'x:1', 2); // x: own overflow bucket, drained, oldest
    l.take('y:1'); // y: own overflow bucket, 1 of 2
    clock.t = 1000; // y refilled (idle), x 1 of 2 (live), a 1 of 4 (live)
    expect(l.take('z:1')).toEqual({ ok: true, retryAfterMs: 0, overflow: true });
    expect(l.take('z:1').ok).toBe(true); // z got its own bucket (y evicted) ...
    expect(l.take('v:1').ok).toBe(true); // ... so the shared bucket still holds tokens for v
    expect(l.stats().overflowGroups).toBe(2);
  });

  it('LossBudget tables share the scan and still evict only stale entries', () => {
    const clock = { t: 0 };
    const b = new LossBudget(
      { windowMs: 1000, perKeyLimit: 100n, globalLimit: 10_000n, maxKeys: 2 },
      () => clock.t,
    );
    b.charge('old', 1n, 'g-old');
    clock.t = 1000;
    b.charge('live', 1n, 'g-live');
    expect(b.reserve('new', 10n, 'g-new')?.overflow).toBe(false); // evicts stale 'old'
    expect(b.reserve('newer', 10n, 'g-newer')?.overflow).toBe(true); // 'live' and 'new' are live
  });

  it('stats() returns counters only, never a key, group or address', () => {
    const { l } = limiter({ maxKeys: 1, maxPerGroup: 1, maxOverflowGroups: 1 });
    const empty: LimiterStats = l.stats();
    expect(empty).toEqual({ overflowHits: 0, sharedOverflowHits: 0, tableSize: 0, overflowGroups: 0 });
    l.take('203.0.113.7:a');
    l.take('198.51.100.9:b'); // its group's own overflow bucket
    l.take('192.0.2.1:c'); // overflow table full: the shared bucket
    l.take('192.0.2.1:c');
    const s = l.stats();
    expect(s).toEqual({ overflowHits: 3, sharedOverflowHits: 2, tableSize: 1, overflowGroups: 1 });
    expect(Object.values(s).every((v) => typeof v === 'number')).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/203|198|192|:a|:b|:c/);
  });
});
