import { fail } from './errors.js';
import { isScalarBytes, wrapSecret, zeroize, type SecretScalar } from './secret.js';

/** Minimal random source: `crypto` or a deterministic test double. */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

const MAX_ATTEMPTS = 128;

/** @internal Resolve the injected or global CSPRNG. */
export function resolveRng(rng?: RandomSource): RandomSource {
  const r = rng ?? (globalThis as { crypto?: RandomSource }).crypto;
  if (r === undefined || typeof r.getRandomValues !== 'function') fail('RNG_UNAVAILABLE');
  return r;
}

/**
 * Samples a uniform ed25519 scalar in [1, L-1] by rejection sampling.
 *
 * @remarks Draws 32 bytes, clears the top 3 bits (value < 2^253, about 2L) and
 * rejects 0 and values >= L, so there is no modular bias. Acceptance is ~1/2 per
 * attempt; after 128 failures (~2^-128 for a healthy source) it throws, which
 * detects a stuck RNG.
 *
 * @param rng Optional source; production callers pass nothing (global `crypto`).
 * @returns A redacting secret scalar.
 * @throws {SolanaStealthError} `RNG_UNAVAILABLE` or `RNG_FAILURE`.
 * @security Never substitute a non-cryptographic generator in production.
 */
export function randomScalar(rng?: RandomSource): SecretScalar {
  const source = resolveRng(rng);
  const buf = new Uint8Array(32);
  try {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      source.getRandomValues(buf);
      buf[31] = (buf[31] as number) & 0x1f;
      if (isScalarBytes(buf)) return wrapSecret(buf);
    }
    return fail('RNG_FAILURE');
  } finally {
    zeroize(buf);
  }
}
