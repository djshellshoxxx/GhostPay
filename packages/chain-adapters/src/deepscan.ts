import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import {
  CURVE_ORDER,
  parseCompressedPoint,
  unsafeRevealSecret,
  zeroize,
  type CompressedPoint,
  type PublicAnnouncement,
  type SecretScalar,
} from '@ghostpay/core-crypto';
import { getAddress } from 'viem/utils';
import type { Address } from './types.js';

/** Result of {@link checkAnnouncementDeep}. */
export type DeepAnnouncementCheck =
  | { readonly matches: false }
  | {
      readonly matches: true;
      readonly stealthAddress: Address;
      /** False when the announced view tag differs from the real one: a tag-filtered scan would have MISSED this payment. */
      readonly tagMatches: boolean;
    };

const HEX = /^0x(?:[0-9a-fA-F]{2})+$/;

function bytes(hex: string): Uint8Array | undefined {
  if (!HEX.test(hex)) return undefined;
  return Uint8Array.from(hex.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
}

/**
 * Announcement check that IGNORES the view tag (D4, "deep scan").
 *
 * @remarks Same math as `checkAnnouncement` in `@ghostpay/core-crypto` (ADR-0001: S = p_view * R compressed,
 * s_h = keccak256(S), h = int(s_h) mod n, Q = P_spend + h * G), but the one-byte tag comparison is not an early
 * reject. It costs one ECDH plus one point multiplication for EVERY checked announcement, so use it only for
 * announcements whose `caller` is the verified GhostPay router (a payer may publish a wrong tag, and the router cannot
 * check it). `tagMatches` reports whether the announced tag was right. Malformed announcements never throw.
 * A differential test pins this function to `checkAnnouncement` whenever the tag is right.
 *
 * @param a Announcement.
 * @param viewingSecret Recipient viewing scalar.
 * @param spendingPublicKey Recipient spending public key.
 * @returns Match result.
 */
export function checkAnnouncementDeep(a: PublicAnnouncement, viewingSecret: SecretScalar, spendingPublicKey: CompressedPoint): DeepAnnouncementCheck {
  if (a.schemeId !== undefined && a.schemeId !== 1n) return { matches: false };
  const eph = bytes(a.ephemeralPublicKey);
  const meta = bytes(a.metadata);
  if (eph === undefined || meta === undefined || meta.length === 0 || !/^0x[0-9a-fA-F]{40}$/.test(a.stealthAddress)) return { matches: false };
  let ephemeral: CompressedPoint;
  try {
    ephemeral = parseCompressedPoint(eph);
  } catch {
    return { matches: false };
  }
  const spend = parseCompressedPoint(spendingPublicKey);
  const secret = unsafeRevealSecret(viewingSecret);
  let digest: Uint8Array;
  try {
    const shared = secp256k1.getSharedSecret(secret, ephemeral, true);
    digest = keccak_256(shared);
    zeroize(shared);
  } finally {
    zeroize(secret);
  }
  const h = bytesToNumberBE(digest) % CURVE_ORDER;
  const tag = digest[0] as number;
  zeroize(digest);
  if (h === 0n) return { matches: false };
  const q = secp256k1.Point.fromBytes(spend).add(secp256k1.Point.BASE.multiply(h));
  if (q.is0()) return { matches: false };
  const hash = keccak_256(q.toBytes(false).subarray(1));
  const address = getAddress(`0x${Array.from(hash.subarray(12), (x) => x.toString(16).padStart(2, '0')).join('')}`);
  if (address.toLowerCase() !== a.stealthAddress.toLowerCase()) return { matches: false };
  return { matches: true, stealthAddress: address, tagMatches: tag === meta[0] };
}
