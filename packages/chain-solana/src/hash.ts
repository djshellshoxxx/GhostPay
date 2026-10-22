import { sha512 } from '@noble/hashes/sha2.js';
import { bytesToNumberLE } from '@noble/curves/utils.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { L } from './secret.js';

/** Domain tag for the one-time tweak h = H_s(K || R || S). */
export const TAG_TWEAK = 'GhostPay/solana-stealth/v1/tweak';
/** Domain tag for the view tag. */
export const TAG_VIEW_TAG = 'GhostPay/solana-stealth/v1/view-tag';
/** Domain tag for the deterministic signing nonce prefix (raw-scalar signer). */
export const TAG_NONCE_PREFIX = 'GhostPay/solana-stealth/v1/nonce-prefix';

/**
 * Domain-separated SHA-512: `SHA-512(u8(len(tag)) || utf8(tag) || parts...)`.
 *
 * @remarks The one-byte tag length makes the tag prefix-free; every caller
 * passes fixed-length 32-byte parts, so the concatenation is unambiguous.
 *
 * @param tag ASCII domain tag (< 256 bytes).
 * @param parts Message parts.
 * @returns 64-byte digest.
 */
export function taggedSha512(tag: string, ...parts: readonly Uint8Array[]): Uint8Array {
  const t = utf8ToBytes(tag);
  return sha512(concatBytes(Uint8Array.of(t.length), t, ...parts));
}

/**
 * @internal Reduce a 64-byte digest little-endian mod L; zero is rejected.
 *
 * @throws {SolanaStealthError} `ZERO_HASH`.
 */
export function reduceDigestNonZero(digest: Uint8Array): bigint {
  const v = bytesToNumberLE(digest) % L;
  if (v === 0n) fail('ZERO_HASH');
  return v;
}

/** @internal Reduce a 64-byte digest little-endian mod L (zero allowed; RFC 8032 nonce / challenge). */
export function reduceDigest(digest: Uint8Array): bigint {
  return bytesToNumberLE(digest) % L;
}
