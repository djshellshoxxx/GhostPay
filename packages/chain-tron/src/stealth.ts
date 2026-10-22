import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  checkAnnouncement,
  deriveStealthPayment,
  deriveStealthSecret,
  unsafeRevealSecret,
  zeroize,
  type CompressedPoint,
  type RandomSource,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { evmToTronAddress, tronAddressFromPublicKey, tronToEvmAddress, type TronAddress } from './address.js';

/** Sender-side result; all fields are public data. */
export interface TronStealthPayment {
  /** One-time Tron address (base58check). */
  readonly stealthAddress: TronAddress;
  /** 33-byte compressed ephemeral public key R. */
  readonly ephemeralPublicKey: CompressedPoint;
  /** One-byte scheme-1 view tag. */
  readonly viewTag: Uint8Array;
  /** Bytes that must begin announcement metadata. */
  readonly metadataPrefix: Uint8Array;
}

/** Announcement fields; address is a Tron address (base58check or `41…` hex). */
export interface TronAnnouncement {
  readonly schemeId?: bigint;
  readonly stealthAddress: string;
  /** 33-byte compressed key, 0x-hex. */
  readonly ephemeralPublicKey: string;
  /** 0x-hex metadata; byte 0 is the view tag. */
  readonly metadata: string;
}

/** Result of {@link checkTronAnnouncement}. */
export type TronAnnouncementCheck =
  { readonly matches: false } | { readonly matches: true; readonly stealthAddress: TronAddress };

/**
 * Derives a one-time Tron address from an ERC-5564 scheme-1 meta-address.
 *
 * @remarks Thin wrapper over core-crypto `deriveStealthPayment`: the stealth
 * public key and its keccak256 address payload are identical for EVM and Tron,
 * only the 0x41 prefix and base58check presentation differ. The meta-address is
 * the same `st:eth:0x…` encoding (see DEVIATIONS).
 *
 * @param metaAddress Scheme-1 meta-address.
 * @param rng Test-only randomness injection.
 * @returns Public derivation result.
 * @throws {GhostPayCryptoError} From core-crypto on invalid input.
 * @security Ephemeral scalar handling is core-crypto's; nothing secret is returned.
 */
export function deriveTronStealthPayment(metaAddress: string, rng?: RandomSource): TronStealthPayment {
  const p = deriveStealthPayment(metaAddress, rng);
  return {
    stealthAddress: evmToTronAddress(p.stealthAddress),
    ephemeralPublicKey: p.ephemeralPublicKey,
    viewTag: p.viewTag,
    metadataPrefix: p.metadataPrefix,
  };
}

/**
 * Checks whether an announcement pays the viewing key holder.
 *
 * @remarks Malformed announcements (including an invalid Tron address) yield
 * `{ matches: false }` and never throw, matching core-crypto semantics.
 *
 * @param announcement Announcement with a Tron stealth address.
 * @param viewingSecret Viewing scalar.
 * @param spendingPublicKey Spending public key.
 * @returns Match result with the canonical Tron address.
 * @throws {GhostPayCryptoError} For invalid key arguments.
 * @security The view tag leaks one byte of the shared-secret hash by design.
 */
export function checkTronAnnouncement(
  announcement: TronAnnouncement,
  viewingSecret: SecretScalar,
  spendingPublicKey: CompressedPoint,
): TronAnnouncementCheck {
  let evm: string;
  try {
    evm = tronToEvmAddress(announcement.stealthAddress);
  } catch {
    return { matches: false };
  }
  const res = checkAnnouncement({ ...announcement, stealthAddress: evm }, viewingSecret, spendingPublicKey);
  if (!res.matches) return { matches: false };
  return { matches: true, stealthAddress: evmToTronAddress(res.stealthAddress) };
}

/**
 * Derives the one-time private key for a matched Tron announcement.
 *
 * @param announcement Announcement (Tron address form).
 * @param keys Viewing and spending secrets.
 * @returns Redacting secret scalar, verified against the announced address.
 * @throws {TronError} `INVALID_*` if the announced address is not a valid Tron address.
 * @throws {GhostPayCryptoError} From core-crypto (tag/address mismatch, etc.).
 * @security Output is a spendable private key: never log or transmit; zeroize after use.
 */
export function deriveTronStealthSecret(
  announcement: TronAnnouncement,
  keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>,
): SecretScalar {
  return deriveStealthSecret({ ...announcement, stealthAddress: tronToEvmAddress(announcement.stealthAddress) }, keys);
}

/**
 * Returns the Tron address controlled by a secret scalar.
 *
 * @param secret Private key.
 * @returns Base58check address.
 * @security Reveals a temporary plain copy of the secret internally and zeroizes it.
 */
export function tronAddressOfSecret(secret: SecretScalar): TronAddress {
  const bytes = unsafeRevealSecret(secret);
  try {
    return tronAddressFromPublicKey(secp256k1.getPublicKey(bytes, false));
  } finally {
    zeroize(bytes);
  }
}
