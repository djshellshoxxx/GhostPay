import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { RandomSource } from '@ghostpay/core-crypto';

/** Deterministic test-only RNG (sha256 counter mode) that records every output. */
export function seededRng(seed: string): RandomSource & { readonly outputs: Uint8Array[] } {
  let counter = 0;
  const outputs: Uint8Array[] = [];
  return {
    outputs,
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      let off = 0;
      while (off < view.length) {
        const block = sha256(utf8ToBytes(`${seed}:${counter++}`));
        const n = Math.min(block.length, view.length - off);
        view.set(block.subarray(0, n), off);
        off += n;
      }
      outputs.push(Uint8Array.from(view));
      return array;
    },
  };
}
