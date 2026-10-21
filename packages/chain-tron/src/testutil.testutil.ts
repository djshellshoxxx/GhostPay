import type { RandomSource } from '@ghostpay/core-crypto';

/** Deterministic counter-based RNG for tests ONLY. */
export function seededRng(seed: number): RandomSource {
  let n = seed;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const u = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < u.length; i++) {
        n = (Math.imul(n, 1103515245) + 12345 + i) >>> 0;
        u[i] = (n >>> 16) & 0xff;
      }
      return array;
    },
  };
}
