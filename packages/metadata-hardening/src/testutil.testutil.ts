import type { RandomSource } from './guard.js';

/** Deterministic xorshift test RNG (tests only). */
export function seededRng(seed: number): RandomSource {
  let s = seed >>> 0 || 1;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const v = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < v.length; i++) {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        v[i] = s & 0xff;
      }
      return array;
    },
  };
}

/** Rng returning fixed bytes forever. */
export function constRng(byte: number): RandomSource {
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(byte);
      return array;
    },
  };
}

export const SEED = new Uint8Array(32).map((_, i) => i + 1);
