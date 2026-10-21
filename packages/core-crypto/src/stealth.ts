import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getAddress } from 'viem/utils';
import { GhostPayCryptoError, fail } from './errors.js';
import { assertAddress, strictHexToBytes, type Address } from './hex.js';
import { decodeMetaAddress, publicKeyOf, type StealthKeySet } from './keys.js';
import { randomScalar, type RandomSource } from './rng.js';
import {
  CURVE_ORDER,
  parseCompressedPoint,
  unsafeRevealSecret,
  wrapSecret,
  zeroize,
  type CompressedPoint,
  type SecretScalar,
} from './secret.js';

const Point = secp256k1.Point;

/** Result of a sender-side derivation. All fields are public data. */
export interface DerivedStealthPayment {
  /** EIP-55 checksummed one-time address. */
  readonly stealthAddress: Address;
  /** 33-byte compressed ephemeral public key R. */
  readonly ephemeralPublicKey: CompressedPoint;
  /** Exactly one byte: the scheme-1 view tag `keccak256(S)[0]`. */
  readonly viewTag: Uint8Array;
  /** Bytes that must begin the announcement metadata (equal to the view tag byte). */
  readonly metadataPrefix: Uint8Array;
}

/** Announcement fields as emitted by the ERC-5564 `Announcement` event (hex form). */
export interface PublicAnnouncement {
  /** If present it must equal 1n (scheme 1). */
  readonly schemeId?: bigint;
  readonly stealthAddress: string;
  /** 33-byte compressed key, 0x-hex. */
  readonly ephemeralPublicKey: string;
  /** Metadata, 0x-hex; `metadata[0]` is the view tag. */
  readonly metadata: string;
}

export type AnnouncementCheck =
  { readonly matches: false } | { readonly matches: true; readonly stealthAddress: Address };

interface ParsedAnnouncement {
  readonly address: Address;
  readonly ephemeral: CompressedPoint;
  readonly viewTag: number;
}

/** @internal Strict announcement parse; throws INVALID_ANNOUNCEMENT-class errors. */
function parseAnnouncement(a: PublicAnnouncement): ParsedAnnouncement {
  if (a.schemeId !== undefined && a.schemeId !== 1n) fail('INVALID_ANNOUNCEMENT');
  const address = assertAddress(a.stealthAddress, 'INVALID_ANNOUNCEMENT');
  const ephemeral = parseCompressedPoint(strictHexToBytes(a.ephemeralPublicKey, 'INVALID_ANNOUNCEMENT'));
  const metadata = strictHexToBytes(a.metadata, 'INVALID_ANNOUNCEMENT');
  const tag = metadata[0];
  if (tag === undefined) return fail('INVALID_ANNOUNCEMENT');
  return { address, ephemeral, viewTag: tag };
}

/**
 * @internal ADR-0001: S = secret*point (33-byte compressed), s_h = keccak256(S),
 * tag = s_h[0], h = int(s_h) mod n (must be non-zero).
 */
function sharedHash(secret: Uint8Array, point: Uint8Array): { tag: number; h: bigint } {
  const shared = secp256k1.getSharedSecret(secret, point, true);
  const digest = keccak_256(shared);
  const tag = digest[0] as number;
  const h = bytesToNumberBE(digest) % CURVE_ORDER;
  zeroize(shared, digest);
  if (h === 0n) fail('ZERO_HASH');
  return { tag, h };
}

/** @internal EIP-55 address of a (non-infinity) point. */
function addressOfPoint(p: { toBytes(c?: boolean): Uint8Array; is0(): boolean }): Address {
  if (p.is0()) fail('INFINITY_POINT');
  const uncompressed = p.toBytes(false);
  const hash = keccak_256(uncompressed.subarray(1));
  return getAddress(`0x${bytesToHex(hash.subarray(12))}`);
}

/** @internal Q = P_spend + h*G. */
function stealthAddressFor(spendingPublicKey: Uint8Array, h: bigint): Address {
  const q = Point.fromBytes(spendingPublicKey).add(Point.BASE.multiply(h));
  return addressOfPoint(q);
}

/**
 * Derives a scheme-1 stealth payment from a recipient meta-address.
 *
 * @remarks secp256k1, ERC-5564 scheme 1 with the ADR-0001 pinned hash: ephemeral
 * scalar r is sampled by rejection sampling; S = r*P_view serialised as a
 * 33-byte compressed point; s_h = keccak256(S); view tag = s_h[0];
 * Q = P_spend + (int(s_h) mod n)*G; address = last 20 bytes of keccak256(Q.x||Q.y),
 * EIP-55 checksummed. A hash reducing to zero is rejected. The result is a
 * public destination; it does not conceal payer, amount, time or later graph.
 *
 * @param metaAddress `st:eth:0x<spendPub><viewPub>` scheme-1 meta-address.
 * @param rng Production callers omit this (global `crypto.getRandomValues`).
 * @returns One-time address, ephemeral public key, one-byte view tag, metadata prefix.
 * @throws {GhostPayCryptoError} On invalid meta-address, point, RNG, zero hash or infinity.
 * @security The ephemeral scalar is zeroized best-effort and never returned or logged.
 * @see https://eips.ethereum.org/EIPS/eip-5564
 * @testVector scheme1-001
 */
export function deriveStealthPayment(metaAddress: string, rng?: RandomSource): DerivedStealthPayment {
  const { spendingPublicKey, viewingPublicKey } = decodeMetaAddress(metaAddress);
  const r = randomScalar(rng);
  try {
    const ephemeralPublicKey = publicKeyOf(r);
    const { tag, h } = sharedHash(r, viewingPublicKey);
    const stealthAddress = stealthAddressFor(spendingPublicKey, h);
    return {
      stealthAddress,
      ephemeralPublicKey,
      viewTag: Uint8Array.of(tag),
      metadataPrefix: Uint8Array.of(tag),
    };
  } finally {
    zeroize(r);
  }
}

/**
 * Checks whether an announcement pays the holder of the viewing key.
 *
 * @remarks Computes S = p_view*R, s_h = keccak256(S) and rejects immediately
 * when `metadata[0] != s_h[0]` (view-tag early reject, ~255/256 of unrelated
 * events); only then derives Q = P_spend + h*G and compares addresses
 * case-insensitively. Malformed on-chain data (bad point, bad hex, empty
 * metadata, scheme != 1) yields `{ matches: false }` and never throws, so one
 * hostile log cannot halt a scanner. Invalid *keys* still throw.
 *
 * @param announcement Public announcement fields.
 * @param viewingSecret Recipient viewing scalar.
 * @param spendingPublicKey Recipient spending public key.
 * @returns `{ matches: false }` or the checksummed matching address.
 * @throws {GhostPayCryptoError} `INVALID_SCALAR` / `INVALID_POINT` for bad key arguments.
 * @security Does not reveal or log the viewing secret; the view tag leaks one byte of shared-secret hash by design.
 * @see https://eips.ethereum.org/EIPS/eip-5564
 * @testVector scheme1-001
 */
export function checkAnnouncement(
  announcement: PublicAnnouncement,
  viewingSecret: SecretScalar,
  spendingPublicKey: CompressedPoint,
): AnnouncementCheck {
  const spend = parseCompressedPoint(spendingPublicKey);
  let parsed: ParsedAnnouncement;
  try {
    parsed = parseAnnouncement(announcement);
  } catch (e) {
    if (e instanceof GhostPayCryptoError) return { matches: false };
    throw e;
  }
  let derived: { tag: number; h: bigint };
  try {
    derived = sharedHash(viewingSecret, parsed.ephemeral);
  } catch (e) {
    if (e instanceof GhostPayCryptoError && e.code === 'ZERO_HASH') return { matches: false };
    throw e;
  }
  if (derived.tag !== parsed.viewTag) return { matches: false };
  let address: Address;
  try {
    address = stealthAddressFor(spend, derived.h);
  } catch (e) {
    if (e instanceof GhostPayCryptoError && e.code === 'INFINITY_POINT') return { matches: false };
    throw e;
  }
  if (address.toLowerCase() !== parsed.address.toLowerCase()) return { matches: false };
  return { matches: true, stealthAddress: address };
}

/**
 * Derives the one-time private key controlling a matched announcement.
 *
 * @remarks p_stealth = (p_spend + int(s_h)) mod n using ADR-0001 hashing. Zero
 * results are rejected. Before returning, the key is mapped back to its public
 * key and address and compared with the announced address; any mismatch,
 * including a wrong view tag, throws. Never sign with a key that was not verified.
 *
 * @param announcement Public announcement; must be well-formed.
 * @param keys Recipient viewing and spending secrets.
 * @returns Redacting secret scalar for the stealth address.
 * @throws {GhostPayCryptoError} `INVALID_ANNOUNCEMENT`, `VIEW_TAG_MISMATCH`, `ZERO_STEALTH_KEY`, `ADDRESS_MISMATCH`, scalar/point errors.
 * @security Output is a spendable private key: never log, serialize or transmit it; zeroize after use (best effort).
 * @see https://eips.ethereum.org/EIPS/eip-5564
 * @testVector scheme1-001
 */
export function deriveStealthSecret(
  announcement: PublicAnnouncement,
  keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>,
): SecretScalar {
  const parsed = parseAnnouncement(announcement);
  const { tag, h } = sharedHash(keys.viewingSecret, parsed.ephemeral);
  if (tag !== parsed.viewTag) fail('VIEW_TAG_MISMATCH');
  const spendBytes = unsafeRevealSecret(keys.spendingSecret);
  const sum = (bytesToNumberBE(spendBytes) + h) % CURVE_ORDER;
  zeroize(spendBytes);
  if (sum === 0n) fail('ZERO_STEALTH_KEY');
  const keyBytes = numberToBytesBE(sum, 32);
  try {
    const address = addressOfPoint(Point.fromBytes(secp256k1.getPublicKey(keyBytes, true)));
    if (address.toLowerCase() !== parsed.address.toLowerCase()) fail('ADDRESS_MISMATCH');
    return wrapSecret(keyBytes);
  } finally {
    zeroize(keyBytes);
  }
}
