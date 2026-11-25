/**
 * P13 user-facing copy (English, plain language). Keys extend `CT_COPY`; wording obeys `findForbiddenWording`
 * (no "private", "anonymous", "untraceable", "unlinkable", "mix") and never claims an audit or deployment.
 */
import { CT_COPY, NOT_PROTECTED_KEYS } from '../../copy.js';

/** P13 additions to `CT_COPY`. */
export const P13_COPY = {
  P13_TRANSPARENT_PUBLIC:
    'Normal ETH and token payments show the exact amount on-chain to everyone. Nothing in this app changes that.',
  P13_UI_MASK_ONLY:
    'Hiding an amount on screen only covers it on this device. The amount stays public on-chain.',
  P13_FIXTURE_ONLY: 'Test fixture. Amounts are plain numbers in memory. Nothing is hidden.',
  P13_SETTLEMENT_OFF:
    'Confidential payments are turned off in this build. A test plan can be prepared and reviewed, but nothing is signed or sent.',
  P13_COMMITMENT_ZK_UNAVAILABLE:
    'Commitment-based amount hiding is not available. No reviewed protocol has been selected for it.',
  P13_RECORD_KEY:
    'Saved confidential payment records open only with the same local record key. Losing that key loses these records. Funds stay controlled by your stealth keys; finding them again needs a rescan.',
  P13_NO_FEE_ADDON:
    'No extra fee is charged for hiding the amount in this build. The router keeps 0.25% of the gross amount, as for other router payments.',
  P13_NOT_REVIEWED:
    'This code has had no independent security review. Use test networks and test tokens only.',
} as const;

/** P13 copy key. */
export type P13CopyKey = keyof typeof P13_COPY;

/**
 * Copy keys each protocol may show (audit A3). The cleartext fixture hides nothing, so it may not carry FHE wording
 * such as "hides how much" or operator-trust lines; CT-1 may not carry fixture wording.
 */
export const PROTOCOL_COPY: Readonly<Record<'ct1-zama' | 'ctm-cleartext', readonly string[]>> = Object.freeze({
  'ct1-zama': [
    'CT_HIDES_AMOUNT_ONLY',
    'CT_TRUST_ZAMA',
    'CT_TESTNET_ONLY',
    'CT_WRAP_PUBLIC',
    'CT_WRAP_EQUALS_GROSS',
    'CT_WRAP_NOT_ROUND',
    'CT_UNWRAP_PUBLIC',
    ...NOT_PROTECTED_KEYS,
    'P13_SETTLEMENT_OFF',
    'P13_NOT_REVIEWED',
    'P13_RECORD_KEY',
    'P13_NO_FEE_ADDON',
  ],
  'ctm-cleartext': ['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY', 'CT_TESTNET_ONLY', 'P13_SETTLEMENT_OFF', 'P13_NOT_REVIEWED', 'P13_RECORD_KEY'],
});

/** True if `key` names an existing `CT_COPY` or {@link P13_COPY} entry. */
export function isKnownCopyKey(key: string): boolean {
  return Object.hasOwn(CT_COPY, key) || Object.hasOwn(P13_COPY, key);
}

/** Text of a known copy key, or `undefined`. */
export function copyText(key: string): string | undefined {
  if (Object.hasOwn(P13_COPY, key)) return P13_COPY[key as P13CopyKey];
  return Object.hasOwn(CT_COPY, key) ? CT_COPY[key] : undefined;
}
