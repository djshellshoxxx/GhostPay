import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { RandomSource } from './rng.js';

/** Deterministic test-only RNG (sha256 counter mode) that records every output. */
export interface RecordingRng extends RandomSource {
  readonly outputs: Uint8Array[];
}

export function seededRng(seed: string): RecordingRng {
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

/** RNG that returns fixed bytes forever (for rejection-sampling tests). */
export function constantRng(byte: number): RandomSource {
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(byte);
      return array;
    },
  };
}

/** RNG that plays back queued chunks, then repeats the last. */
export function scriptedRng(chunks: Uint8Array[]): RandomSource {
  let i = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const chunk = chunks[Math.min(i++, chunks.length - 1)] as Uint8Array;
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(chunk);
      return array;
    },
  };
}
