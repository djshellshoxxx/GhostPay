import { checkAnnouncement, type CompressedPoint, type PublicAnnouncement, type SecretScalar } from '@ghostpay/core-crypto';
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

/**
 * Announcement check that IGNORES the view tag (D4, "deep scan").
 *
 * @remarks Thin wrapper over `checkAnnouncement(..., { ignoreViewTag: true })` in `@ghostpay/core-crypto`; the derivation
 * lives only there. It costs one ECDH plus one point multiplication for EVERY checked announcement, so use it only for
 * announcements whose `caller` is the verified GhostPay router (a payer may publish a wrong tag, and the router cannot
 * check it). `tagMatches` reports whether the announced tag was right. Malformed announcements never throw.
 *
 * @param a Announcement.
 * @param viewingSecret Recipient viewing scalar.
 * @param spendingPublicKey Recipient spending public key.
 * @returns Match result.
 */
export function checkAnnouncementDeep(a: PublicAnnouncement, viewingSecret: SecretScalar, spendingPublicKey: CompressedPoint): DeepAnnouncementCheck {
  const r = checkAnnouncement(a, viewingSecret, spendingPublicKey, { ignoreViewTag: true });
  if (!r.matches) return { matches: false };
  return { matches: true, stealthAddress: r.stealthAddress, tagMatches: r.tagMatches === true };
}
