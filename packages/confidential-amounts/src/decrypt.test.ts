import { describe, expect, it, vi } from 'vitest';
import { DecryptScheduler, type Transport } from './decrypt.js';
import { OTHER, PAYER, STEALTH } from './fixtures.testutil.js';

function sched(extra = {}) {
  const sleeps: number[] = [];
  const s = new DecryptScheduler({
    minGapMs: 30_000,
    maxGapMs: 300_000,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    ...extra,
  });
  return { s, sleeps };
}

describe('DecryptScheduler (T6)', () => {
  it('runs jobs serially with random gaps inside bounds (CT-DEC-2)', async () => {
    const { s, sleeps } = sched();
    const order: number[] = [];
    const jobs = Array.from({ length: 50 }, (_, i) => s.enqueue({ owner: STEALTH, run: () => { order.push(i); return Promise.resolve(i); } }));
    expect(await Promise.all(jobs)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(order).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(sleeps).toHaveLength(50);
    for (const g of sleeps) {
      expect(g).toBeGreaterThanOrEqual(30_000);
      expect(g).toBeLessThanOrEqual(300_000);
    }
    expect(new Set(sleeps).size).toBeGreaterThan(10);
    expect(s.started).toBe(50);
  });

  it('gap endpoints are reachable and the default RNG is used when none is injected', async () => {
    const lo = sched({ random: () => 0 });
    await lo.s.enqueue({ owner: STEALTH, run: () => Promise.resolve(1) });
    expect(lo.sleeps).toEqual([30_000]);
    const hi = sched({ random: () => 0.9999999999 });
    await hi.s.enqueue({ owner: STEALTH, run: () => Promise.resolve(1) });
    expect(hi.sleeps).toEqual([300_000]);
    const dflt = sched();
    await dflt.s.enqueue({ owner: STEALTH, run: () => Promise.resolve(1) });
    expect(dflt.sleeps[0]).toBeGreaterThanOrEqual(30_000);
  });

  it('can skip the first delay', async () => {
    const { s, sleeps } = sched({ delayFirst: false });
    await s.enqueue({ owner: STEALTH, run: () => Promise.resolve(1) });
    await s.enqueue({ owner: STEALTH, run: () => Promise.resolve(2) });
    expect(sleeps).toHaveLength(1);
  });

  it('each job gets its own transport whose key is not the owner address (CT-DEC-2)', async () => {
    const keys: string[] = [];
    const isolate = (k: string): Transport => {
      keys.push(k);
      return () => Promise.resolve(k);
    };
    const { s } = sched({ isolate });
    const seen: (Transport | undefined)[] = [];
    await Promise.all(
      [STEALTH, OTHER, PAYER].map((owner) => s.enqueue({ owner, run: (t) => { seen.push(t); return Promise.resolve(0); } })),
    );
    expect(new Set(keys).size).toBe(3);
    expect(new Set(seen).size).toBe(3);
    for (const k of keys) {
      expect(k).toMatch(/^[0-9a-f]{32}$/);
      for (const o of [STEALTH, OTHER, PAYER]) expect(k.includes(o.slice(2).toLowerCase())).toBe(false);
    }
  });

  it('without isolate jobs get no transport', async () => {
    const { s } = sched();
    expect(await s.enqueue({ owner: STEALTH, run: (t) => Promise.resolve(t) })).toBeUndefined();
  });

  it('every job is bound to exactly one owner (CT-DEC-1)', async () => {
    const { s } = sched();
    const owners: string[] = [];
    await Promise.all(
      [STEALTH, OTHER].map((o) => s.enqueue({ owner: o, run: () => { owners.push(o); return Promise.resolve(); } })),
    );
    expect(owners).toEqual([STEALTH, OTHER]);
    expect(() => s.enqueue({ owner: '0xnot-an-address', run: () => Promise.resolve() })).toThrow(/owner must be an address/);
  });

  it('propagates job failures and keeps draining', async () => {
    const { s } = sched();
    const a = s.enqueue({ owner: STEALTH, run: () => Promise.reject(new Error('x')) });
    const b = s.enqueue({ owner: STEALTH, run: () => Promise.resolve('ok') });
    await expect(a).rejects.toThrow('x');
    await expect(b).resolves.toBe('ok');
  });

  it('bounds the queue', async () => {
    const { s } = sched({ maxQueue: 2, sleep: () => new Promise<void>(() => undefined) });
    void s.enqueue({ owner: STEALTH, run: () => Promise.resolve(1) }); // starts draining (taken off the queue)
    void s.enqueue({ owner: STEALTH, run: () => Promise.resolve(2) });
    void s.enqueue({ owner: STEALTH, run: () => Promise.resolve(3) });
    await expect(s.enqueue({ owner: STEALTH, run: () => Promise.resolve(4) })).rejects.toMatchObject({ code: 'QUEUE_FULL' });
    expect(s.pending).toBe(2);
  });

  it('cancelPending rejects queued and gap-waiting jobs but not running ones', async () => {
    let release: () => void = () => undefined;
    const { s } = sched({ sleep: () => new Promise<void>((r) => { release = r; }) });
    const first = s.enqueue({ owner: STEALTH, run: () => Promise.resolve(1) });
    const second = s.enqueue({ owner: STEALTH, run: () => Promise.resolve(2) });
    const f1 = expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
    const f2 = expect(second).rejects.toMatchObject({ code: 'CANCELLED' });
    s.cancelPending();
    release();
    await f1;
    await f2;
    expect(s.started).toBe(0);
    // scheduler remains usable
    const { s: s2 } = sched();
    expect(await s2.enqueue({ owner: STEALTH, run: () => Promise.resolve(3) })).toBe(3);
  });

  it('validates options', () => {
    expect(() => new DecryptScheduler({ minGapMs: -1 })).toThrow(/minGapMs/);
    expect(() => new DecryptScheduler({ minGapMs: 10, maxGapMs: 5 })).toThrow(/maxGapMs/);
    expect(() => new DecryptScheduler({ maxQueue: 0 })).toThrow(/maxQueue/);
    expect(() => new DecryptScheduler({ minGapMs: Number.NaN })).toThrow(/minGapMs/);
  });

  it('works with real timers and the default sleep', async () => {
    vi.useFakeTimers();
    try {
      const s = new DecryptScheduler({ minGapMs: 5, maxGapMs: 5 });
      const p = s.enqueue({ owner: STEALTH, run: () => Promise.resolve('done') });
      await vi.advanceTimersByTimeAsync(10);
      await expect(p).resolves.toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });
});
