import { fail } from './errors.js';

/** Injected CSPRNG. Same shape as `RandomSource` in invoice-schema. */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

const MAX_ATTEMPTS = 256;

/**
 * Uniform integer in `[0, n)` by rejection sampling (no modulo bias).
 *
 * @security Only the injected source is used; a failing or stuck source throws instead of degrading.
 * @param random CSPRNG.
 * @param n Exclusive upper bound, `1 <= n <= 2^256`.
 * @returns Uniform value below `n`.
 * @throws {AmountBlurError} `INVALID_INPUT` for a bad bound, `RANDOM_FAILED` when the source throws or never yields an acceptable value.
 */
export function randomBelow(random: RandomSource, n: bigint): bigint {
  if (typeof n !== 'bigint' || n < 1n || n > 1n << 256n) fail('INVALID_INPUT', 'random bound out of range');
  if (n === 1n) return 0n;
  const bits = (n - 1n).toString(2).length;
  const bytes = Math.ceil(bits / 8);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const buf = new Uint8Array(bytes);
    try {
      random.getRandomValues(buf);
    } catch {
      return fail('RANDOM_FAILED', 'random source failed');
    }
    let v = 0n;
    for (const b of buf) v = (v << 8n) | BigInt(b);
    v &= (1n << BigInt(bits)) - 1n;
    if (v < n) return v;
  }
  return fail('RANDOM_FAILED', 'random source produced no usable value');
}

/**
 * Uniform integer in `[lo, hi]` (both safe integers).
 *
 * @param random CSPRNG.
 * @param lo Inclusive lower bound.
 * @param hi Inclusive upper bound, `>= lo`.
 * @returns Uniform value.
 */
export function randomInt(random: RandomSource, lo: number, hi: number): number {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi < lo) fail('INVALID_INPUT', 'random range invalid');
  return lo + Number(randomBelow(random, BigInt(hi - lo) + 1n));
}

/**
 * Fisher-Yates shuffle with rejection-sampled indices. Returns a new array.
 *
 * @param random CSPRNG.
 * @param items Input items (not modified).
 * @returns Uniformly shuffled copy.
 */
export function shuffle<T>(random: RandomSource, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Number(randomBelow(random, BigInt(i + 1)));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
