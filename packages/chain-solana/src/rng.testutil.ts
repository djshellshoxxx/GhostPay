import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { RandomSource } from './rng.js';

/** Deterministic test RNG: SHA-256(seed || counter) stream. TESTS ONLY. */
export function seededRng(seed: string): RandomSource {
  let counter = 0;
  const s = utf8ToBytes(seed);
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      const view = array as unknown as Uint8Array;
      let off = 0;
      while (off < view.length) {
        const block = sha256(
          concatBytes(s, Uint8Array.of(counter >>> 24, counter >>> 16, counter >>> 8, counter)),
        );
        counter++;
        const n = Math.min(32, view.length - off);
        view.set(block.subarray(0, n), off);
        off += n;
      }
      return array;
    },
  };
}

/** RNG that always returns the same bytes. TESTS ONLY. */
export function constantRng(byte: number): RandomSource {
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      (array as unknown as Uint8Array).fill(byte);
      return array;
    },
  };
}
