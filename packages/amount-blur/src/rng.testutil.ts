import type { RandomSource } from './random.js';

/** Deterministic splitmix32-based byte stream standing in for a CSPRNG in tests (fake data only). */
export function seeded(seed: number): RandomSource {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  return {
    getRandomValues<T extends ArrayBufferView | null>(a: T): T {
      const u = a as unknown as Uint8Array;
      for (let i = 0; i < u.length; i += 1) u[i] = next() & 0xff;
      return a;
    },
  };
}

/** Source that always throws. */
export const failing: RandomSource = {
  getRandomValues() {
    throw new Error('no entropy');
  },
};

/** Source stuck at 0xff (every rejection-sampled draw above a small bound is rejected). */
export const stuck: RandomSource = {
  getRandomValues<T extends ArrayBufferView | null>(a: T): T {
    (a as unknown as Uint8Array).fill(0xff);
    return a;
  },
};

/** Chi-square statistic for observed counts against a uniform expectation. */
export function chiSquare(counts: readonly number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  const e = n / counts.length;
  return counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
}
