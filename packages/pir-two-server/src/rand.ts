import { PirError } from './errors.js';

/** Source of random bytes: must return exactly `n` bytes from a CSPRNG. */
export type RandomBytes = (n: number) => Uint8Array;

const MAX_CHUNK = 65_536; // WebCrypto getRandomValues quota per call.

/**
 * Default randomness: `crypto.getRandomValues` (CSPRNG). Never `Math.random` (banned by lint, ADR-0004).
 *
 * @security Every PIR query bit and every dummy index comes from here. A predictable source would leak the index.
 */
export const csprng: RandomBytes = (n) => {
  const out = new Uint8Array(n);
  for (let off = 0; off < n; off += MAX_CHUNK) {
    crypto.getRandomValues(out.subarray(off, Math.min(n, off + MAX_CHUNK)));
  }
  return out;
};

/** @internal Calls `rand` and checks the contract (exact length, Uint8Array). */
export function drawBytes(rand: RandomBytes, n: number): Uint8Array {
  const r = rand(n);
  if (!(r instanceof Uint8Array) || r.length !== n) throw new PirError('RNG_FAILURE', 'random source returned wrong length');
  return r;
}

/**
 * Uniform integer in `[0, max)` by rejection sampling (no modulo bias).
 *
 * @throws PirError `INVALID_ARGUMENT` unless `1 <= max <= 2^32`.
 */
export function randomBelow(rand: RandomBytes, max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new PirError('INVALID_ARGUMENT', 'max out of range');
  if (max === 1) return 0;
  const limit = 2 ** 32 - (2 ** 32 % max);
  for (;;) {
    const b = drawBytes(rand, 4);
    const v = ((b[0] ?? 0) * 2 ** 24) + ((b[1] ?? 0) << 16) + ((b[2] ?? 0) << 8) + (b[3] ?? 0);
    if (v < limit) return v % max;
  }
}

/** In-place Fisher-Yates shuffle using {@link randomBelow}. */
export function shuffle<T>(arr: T[], rand: RandomBytes): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomBelow(rand, i + 1);
    const a = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = a;
  }
  return arr;
}
