import { bytesToNumberBE } from '@noble/curves/utils.js';
import { fail } from './errors.js';
import { CURVE_ORDER, wrapSecret, zeroize, type SecretScalar } from './secret.js';

/** Minimal random source: `crypto` or a deterministic test double. */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

const MAX_ATTEMPTS = 64;

/** @internal Resolve the injected or global CSPRNG. */
export function resolveRng(rng?: RandomSource): RandomSource {
  const r = rng ?? (globalThis as { crypto?: RandomSource }).crypto;
  if (r === undefined || typeof r.getRandomValues !== 'function') fail('RNG_UNAVAILABLE');
  return r;
}

/**
 * Samples a uniform scalar in [1, n-1] by rejection sampling.
 *
 * @remarks Draws 32 bytes per attempt from `crypto.getRandomValues` (or the
 * injected source) and rejects 0 and values >= n, so there is no modular bias.
 * Gives up after 64 attempts and throws, which detects a stuck RNG.
 *
 * @param rng Optional source; production callers pass nothing (global `crypto`).
 * @returns A redacting secret scalar.
 * @throws {BtcFamilyError} `RNG_UNAVAILABLE` or `RNG_FAILURE`.
 * @security Never substitute a non-cryptographic generator in production.
 */
export function randomScalar(rng?: RandomSource): SecretScalar {
  const source = resolveRng(rng);
  const buf = new Uint8Array(32);
  try {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      source.getRandomValues(buf);
      const v = bytesToNumberBE(buf);
      if (v >= 1n && v < CURVE_ORDER) return wrapSecret(buf);
    }
    return fail('RNG_FAILURE');
  } finally {
    zeroize(buf);
  }
}
