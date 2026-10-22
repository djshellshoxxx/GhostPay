import { describe, expect, it, vi } from 'vitest';
import { DelayScheduler, randomDelayMs, type CryptoLike, type SchedulerDeps } from './jitter';

function seqCrypto(values: number[]): CryptoLike {
  let i = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(a: T): T {
      (a as unknown as Uint32Array)[0] = values[i++ % values.length] as number;
      return a;
    },
  };
}

describe('randomDelayMs', () => {
  it('maps samples into range', () => {
    expect(randomDelayMs(1000, 1999, seqCrypto([0]))).toBe(1000);
    expect(randomDelayMs(1000, 1999, seqCrypto([999]))).toBe(1999);
    expect(randomDelayMs(0, 0, seqCrypto([123456]))).toBe(0);
    expect(randomDelayMs(5, 5)).toBe(5);
  });
  it('rejects biased samples (rejection sampling) and retries', () => {
    // span 3: limit = 2^32 - (2^32 mod 3) = 4294967295; 4294967295 itself is rejected, the next value is used.
    expect(randomDelayMs(0, 2, seqCrypto([0xffffffff, 4]))).toBe(1);
  });
  it('is uniform within tolerance over many draws (real CSPRNG)', () => {
    const draws = new Array<number>(7).fill(0);
    for (let i = 0; i < 14_000; i++) draws[randomDelayMs(0, 6)]!++;
    for (const c of draws) expect(c).toBeGreaterThan(1700);
    for (const c of draws) expect(c).toBeLessThan(2300);
  });
  it('validates the range', () => {
    expect(() => randomDelayMs(-1, 5)).toThrow(RangeError);
    expect(() => randomDelayMs(5, 4)).toThrow(RangeError);
    expect(() => randomDelayMs(0.5, 4)).toThrow(RangeError);
    expect(() => randomDelayMs(0, 2 ** 33)).toThrow(RangeError);
  });
  it('gives up if the source is stuck above the limit', () => {
    expect(() => randomDelayMs(0, 2, seqCrypto([0xffffffff]))).toThrow(/Random source failed/);
  });
});

function fakeDeps(): { deps: SchedulerDeps; advance: (ms: number) => void; setWall: (s: number) => void; tickers: (() => void)[]; cleared: unknown[] } {
  let mono = 0;
  let wall = 1000;
  const tickers: (() => void)[] = [];
  const cleared: unknown[] = [];
  return {
    deps: {
      monotonicNow: () => mono,
      wallNowSeconds: () => wall,
      setInterval: (fn) => {
        tickers.push(fn);
        return tickers.length;
      },
      clearInterval: (h) => void cleared.push(h),
    },
    advance: (ms) => {
      mono += ms;
      tickers.forEach((t) => t());
    },
    setWall: (s) => {
      wall = s;
    },
    tickers,
    cleared,
  };
}

describe('DelayScheduler', () => {
  it('waits, then becomes ready, using the monotonic clock', () => {
    const f = fakeDeps();
    const s = new DelayScheduler(5000, 5000, f.deps);
    const seen: string[] = [];
    s.subscribe((x) => seen.push(x.status));
    expect(s.snapshot()).toEqual({ status: 'waiting', remainingMs: 5000 });
    f.advance(4999);
    expect(s.snapshot().status).toBe('waiting');
    f.advance(1);
    expect(s.snapshot()).toEqual({ status: 'ready', remainingMs: 0 });
    expect(seen.at(-1)).toBe('ready');
    expect(f.cleared).toHaveLength(1);
  });
  it('is not shortened by a wall-clock jump forward within the invoice validity', () => {
    const f = fakeDeps();
    const s = new DelayScheduler(5000, 100_000, f.deps);
    f.setWall(5000);
    s.check();
    expect(s.snapshot().status).toBe('waiting');
  });
  it('expires when the invoice expires before the delay ends', () => {
    const f = fakeDeps();
    const s = new DelayScheduler(5000, 1002, f.deps);
    f.setWall(1002);
    s.check();
    expect(s.snapshot().status).toBe('expired');
  });
  it('can be cancelled, which is final', () => {
    const f = fakeDeps();
    const s = new DelayScheduler(5000, 99_999, f.deps);
    s.cancel();
    expect(s.snapshot().status).toBe('cancelled');
    f.advance(10_000);
    expect(s.snapshot().status).toBe('cancelled');
    s.cancel();
    s.sendNow();
    expect(s.snapshot().status).toBe('cancelled');
  });
  it('"send now" skips the wait but still respects expiry', () => {
    const a = fakeDeps();
    const s1 = new DelayScheduler(5000, 99_999, a.deps);
    s1.sendNow();
    expect(s1.snapshot().status).toBe('ready');
    const b = fakeDeps();
    const s2 = new DelayScheduler(5000, 1000, b.deps);
    s2.sendNow();
    expect(s2.snapshot().status).toBe('expired');
  });
  it('unsubscribes listeners and uses real timers by default', () => {
    vi.useFakeTimers();
    try {
      const s = new DelayScheduler(1000, Math.floor(Date.now() / 1000) + 10_000);
      const fn = vi.fn();
      const off = s.subscribe(fn);
      off();
      vi.advanceTimersByTime(2000);
      expect(fn).not.toHaveBeenCalled();
      expect(s.snapshot().status).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });
});
