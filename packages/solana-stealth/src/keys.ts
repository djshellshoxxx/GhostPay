import { fail } from './errors.js';
import {
  hashToScalar,
  publicFromSecret,
  randomScalar,
  type PublicPoint,
  type RandomSource,
} from './ed25519.js';
import { wrapScalar, type SecretScalar } from './secret.js';

/** Recipient key set: spend `(s, S)` and view `(v, V)`. */
export interface StealthKeys {
  readonly spendSecret: SecretScalar;
  readonly viewSecret: SecretScalar;
  readonly spendPublicKey: PublicPoint;
  readonly viewPublicKey: PublicPoint;
}

function fromSecrets(spendSecret: SecretScalar, viewSecret: SecretScalar): StealthKeys {
  return {
    spendSecret,
    viewSecret,
    spendPublicKey: publicFromSecret(spendSecret),
    viewPublicKey: publicFromSecret(viewSecret),
  };
}

/**
 * Generates independent random spend and view scalars.
 *
 * @param rng Optional source (tests only).
 * @returns Fresh key set.
 * @security Back up both secrets; losing `s` loses funds, leaking `v` loses privacy only.
 */
export function generateStealthKeys(rng?: RandomSource): StealthKeys {
  return fromSecrets(randomScalar(rng), randomScalar(rng));
}

/**
 * Deterministically derives spend and view scalars from a 32-64 byte seed.
 *
 * @remarks `s = SHA-512(dst('spend-key') || seed) mod L`, `v = SHA-512(dst('view-key') || seed) mod L`.
 * Not BIP-44 / SLIP-10 compatible on purpose: these are stealth roots, not wallet accounts.
 * @param seed High-entropy seed bytes.
 * @returns Key set.
 * @throws {SolanaStealthError} `INVALID_SEED`, `DERIVED_KEY_INVALID` (probability ~2^-252).
 */
export function deriveStealthKeysFromSeed(seed: Uint8Array): StealthKeys {
  if (!(seed instanceof Uint8Array) || seed.length < 32 || seed.length > 64) {
    return fail('INVALID_SEED');
  }
  const s = hashToScalar('spend-key', seed);
  const v = hashToScalar('view-key', seed);
  if (s === 0n || v === 0n) return fail('DERIVED_KEY_INVALID');
  return fromSecrets(wrapScalar(s), wrapScalar(v));
}
