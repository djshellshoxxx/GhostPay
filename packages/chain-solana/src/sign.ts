import { equalBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { reduceDigest, taggedSha512, TAG_NONCE_PREFIX } from './hash.js';
import { Point } from './point.js';
import { L, scalarValue, zeroize, type SecretScalar } from './secret.js';

/**
 * @internal RFC 8032 section 5.1.6 signing, steps 2-6, given the expanded key
 * (scalar `a mod L` and 32-byte `prefix`) instead of a seed.
 *
 * r = SHA-512(prefix || M) mod L; R = r*B; k = SHA-512(R || A || M) mod L;
 * S = (r + k*a) mod L; signature = R || LE32(S).
 *
 * @param a Secret scalar value in [1, L-1].
 * @param prefix 32 bytes.
 * @param message Message bytes.
 * @returns 64-byte signature.
 */
export function signExpanded(a: bigint, prefix: Uint8Array, message: Uint8Array): Uint8Array {
  if (prefix.length !== 32) fail('INVALID_SCALAR');
  const A = Point.BASE.multiply(a).toBytes();
  const r = reduceDigest(sha512(concatBytes(prefix, message)));
  // r = 0 happens with probability 2^-252; RFC 8032 then gives R = identity.
  const R = (r === 0n ? Point.ZERO : Point.BASE.multiply(r)).toBytes();
  const k = reduceDigest(sha512(concatBytes(R, A, message)));
  const S = (r + k * a) % L;
  return concatBytes(R, numberToBytesLE(S, 32));
}

/**
 * Signs `message` with a RAW ed25519 scalar x so that the signature verifies
 * under P = x*B with any RFC 8032 / Solana ed25519 verifier.
 *
 * @remarks A stealth spend key x = s + h has no RFC 8032 seed, so the standard
 * nonce prefix (second half of SHA-512(seed)) does not exist. It is replaced by
 * prefix = SHA-512(u8(len) || "GhostPay/solana-stealth/v1/nonce-prefix" || LE32(x) || P)[0..32],
 * which is deterministic and secret (depends on x). Everything after the
 * prefix is RFC 8032 verbatim. Verification is unchanged, so the chain cannot
 * distinguish these signatures from seed-derived ones.
 *
 * @param secret x in [1, L-1] (e.g. from `deriveStealthSpendScalar`).
 * @param message Bytes to sign (for Solana: the serialized transaction message).
 * @param expectedPublicKey Optional P; when given, x*B must equal it.
 * @returns 64-byte signature R || S.
 * @throws {SolanaStealthError} `INVALID_SCALAR` or `KEY_MISMATCH`.
 * @security Deterministic: the same (x, message) always yields the same signature,
 * so no RNG failure can leak x through nonce reuse.
 */
export function signWithScalar(
  secret: SecretScalar,
  message: Uint8Array,
  expectedPublicKey?: Uint8Array,
): Uint8Array {
  const x = scalarValue(secret);
  const A = Point.BASE.multiply(x).toBytes();
  if (expectedPublicKey !== undefined && !equalBytes(A, expectedPublicKey)) fail('KEY_MISMATCH');
  const xBytes = numberToBytesLE(x, 32);
  const digest = taggedSha512(TAG_NONCE_PREFIX, xBytes, A);
  const prefix = digest.slice(0, 32);
  try {
    return signExpanded(x, prefix, message);
  } finally {
    zeroize(xBytes, digest, prefix);
  }
}
