import { describe, expect, it } from 'vitest';
import { drawDelays, randomDelayMs, randomUint256 } from './rand.js';
import { assignRelayers } from './relayerSelect.js';
import { seededRng } from './stub.testutil.js';

describe('randomDelayMs', () => {
  it('chi-square uniformity at fixed seed (HOP-REQ-4)', () => {
    const rng = seededRng('chi');
    const bins = 10;
    const n = 20_000;
    const counts = new Array<number>(bins).fill(0);
    const min = 600_000;
    const max = 43_200_000;
    for (let i = 0; i < n; i++) {
      const d = randomDelayMs(min, max, rng);
      expect(d).toBeGreaterThanOrEqual(min);
      expect(d).toBeLessThanOrEqual(max);
      const b = Math.min(bins - 1, Math.floor(((d - min) / (max - min + 1)) * bins));
      counts[b] = (counts[b] as number) + 1;
    }
    const e = n / bins;
    const chi = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
    expect(chi).toBeLessThan(27.88); // df=9, p=0.001
  });
  it('no modulo bias on a span that does not divide 2^32', () => {
    const rng = seededRng('bias');
    const span = 3_000_000_000; // limit rejects > 1/3 of draws
    let low = 0;
    for (let i = 0; i < 4000; i++) if (randomDelayMs(0, span - 1, rng) < span / 2) low++;
    expect(low / 4000).toBeGreaterThan(0.45);
    expect(low / 4000).toBeLessThan(0.55);
  });
  it('rejects bad ranges and failing sources', () => {
    expect(() => randomDelayMs(5, 1)).toThrow(RangeError);
    expect(() => randomDelayMs(-1, 1)).toThrow(RangeError);
    expect(() => randomDelayMs(0, 2 ** 33)).toThrow(RangeError);
    expect(() => randomDelayMs(0, 0.5)).toThrow(RangeError);
    const stuck = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { if (a !== null) new Uint8Array(a.buffer).fill(255); return a; } };
    expect(() => randomDelayMs(0, 2_999_999_999, stuck)).toThrow('Random source failed');
    expect(randomDelayMs(7, 7)).toBe(7);
  });
  it('uses global crypto by default', () => {
    const v = randomDelayMs(1, 1000);
    expect(v).toBeGreaterThanOrEqual(1);
  });
});

describe('drawDelays', () => {
  it('respects total cap by shrinking later draws', () => {
    for (let i = 0; i < 50; i++) {
      const d = drawDelays(4, { minMs: 10, maxMs: 1000, maxTotalMs: 1500 }, seededRng(`c${i}`));
      expect(d.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1500);
      expect(d.every((x) => x >= 10)).toBe(true);
    }
    expect(() => drawDelays(4, { minMs: 500, maxMs: 1000, maxTotalMs: 1500 }, seededRng('x'))).toThrow(RangeError);
  });
});

describe('randomUint256', () => {
  it('differs per call and fits 256 bits', () => {
    const rng = seededRng('n');
    const a = randomUint256(rng);
    expect(a).not.toBe(randomUint256(rng));
    expect(a < 1n << 256n).toBe(true);
  });
});

describe('assignRelayers', () => {
  it('edge cases', () => {
    const r = seededRng('rel');
    expect(assignRelayers([{ id: 'a' }], 'rotate', 0, r)).toEqual([]);
    expect(assignRelayers([{ id: 'a' }], 'rotate', 3, r)).toEqual(['a', 'a', 'a']);
    expect(() => assignRelayers([], 'rotate', 1, r)).toThrow();
    expect(() => assignRelayers([{ id: 'a' }], 'direct', 2, r)).toThrow();
    expect(assignRelayers([], 'direct', 1, r)).toEqual(['direct']);
  });
});
