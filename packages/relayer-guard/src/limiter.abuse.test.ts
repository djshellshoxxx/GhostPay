import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter, type TokenBucketOptions } from './limiter.js';

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
    const { l, clock } = limiter({ burst: 4, overflowBurst: 1, maxKeys: 1, maxPerGroup: 1, maxOverflowGroups: 1 });
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
