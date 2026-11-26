import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { bytesToNumberLE } from '@noble/curves/utils.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { L } from './secret.js';

/** Domain prefix of every hash in the scheme (ADR-0017 section 3: `tag = "GhostPay/solana-stealth/v1/" + label`). */
export const DOMAIN = 'GhostPay/solana-stealth/v1/';
/** ADR-0017 tweak tag: `h = SHA-512(dst("shared") || R || Z || S) mod L`. */
export const TAG_SHARED = DOMAIN + 'shared';
/** ADR-0017 view-tag tag: `view_tag = SHA-256(dst("view-tag") || R || Z)[0]`. */
export const TAG_VIEW_TAG = DOMAIN + 'view-tag';
/** ADR-0017 meta-address checksum tag: `SHA-256(dst("checksum") || payload)[0..4]`. */
export const TAG_CHECKSUM = DOMAIN + 'checksum';
/** Domain tag for the deterministic signing nonce prefix (raw-scalar signer; local to this package, not interop). */
export const TAG_NONCE_PREFIX = DOMAIN + 'nonce-prefix';

function dst(tag: string): Uint8Array {
  const t = utf8ToBytes(tag);
  return concatBytes(Uint8Array.of(t.length), t);
}

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
  return sha512(concatBytes(dst(tag), ...parts));
}

/**
 * Domain-separated SHA-256: `SHA-256(u8(len(tag)) || utf8(tag) || parts...)` (ADR-0017 `dst` construction).
 *
 * @param tag ASCII domain tag (< 256 bytes).
 * @param parts Message parts.
 * @returns 32-byte digest.
 */
export function taggedSha256(tag: string, ...parts: readonly Uint8Array[]): Uint8Array {
  return sha256(concatBytes(dst(tag), ...parts));
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
