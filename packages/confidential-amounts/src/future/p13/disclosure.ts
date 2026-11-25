/**
 * What each amount route actually hides. Separates cryptographic on-chain confidentiality (CT-1, under Zama's
 * threshold trust) from screen masking and from the cleartext fixture, and lists what stays public (P13-A01/A02).
 */
import { BACKEND_INFOS } from '../../registry.js';
import { NOT_PROTECTED_KEYS, findForbiddenWording } from '../../copy.js';
import { check } from './errors.js';
import { copyText, isKnownCopyKey } from './copy.js';
import { digestOf, type Digest, type P13ProtocolId } from './asset.js';

/** Payment routes the UI may describe. */
export type RouteKind = 'transparent-native' | 'transparent-erc20' | 'ui-mask' | 'ct1-zama' | 'ctm-cleartext' | 'commitment-zk';

/** Where the amount is readable. */
export type AmountVisibility = 'public-onchain' | 'encrypted-onchain-fhe' | 'plaintext-fixture' | 'unavailable';

/** On-chain or network facts a public observer (or the named party) can read. */
export type PublicField =
  | 'amount'
  | 'payer-address'
  | 'stealth-address'
  | 'token-contract'
  | 'router-contract'
  | 'block-time'
  | 'gas-payer'
  | 'eth-gas-buffer'
  | 'view-tag'
  | 'wrap-amount'
  | 'unwrap-amount'
  | 'acl-grants'
  | 'wrapped-total-supply'
  | 'ciphertext-handle'
  | 'decrypt-request-metadata';

/** Honest classification of one route. */
export interface RouteClassification {
  readonly kind: RouteKind;
  readonly visibility: AmountVisibility;
  /** True only where the settlement protocol itself hides the amount from public observers. */
  readonly confidentialClaimAllowed: boolean;
  readonly publicFields: readonly PublicField[];
  readonly copyKeys: readonly string[];
}

const TRANSPARENT: readonly PublicField[] = [
  'amount', 'payer-address', 'stealth-address', 'token-contract', 'router-contract', 'block-time', 'gas-payer',
  'eth-gas-buffer', 'view-tag',
];
const CT1_PUBLIC: readonly PublicField[] = [
  'payer-address', 'stealth-address', 'token-contract', 'router-contract', 'block-time', 'gas-payer', 'eth-gas-buffer',
  'view-tag', 'wrap-amount', 'unwrap-amount', 'acl-grants', 'wrapped-total-supply', 'ciphertext-handle',
  'decrypt-request-metadata',
];

const ROUTES: Readonly<Record<RouteKind, RouteClassification>> = {
  'transparent-native': {
    kind: 'transparent-native',
    visibility: 'public-onchain',
    confidentialClaimAllowed: false,
    publicFields: TRANSPARENT.filter((f) => f !== 'token-contract' && f !== 'eth-gas-buffer'),
    copyKeys: ['P13_TRANSPARENT_PUBLIC'],
  },
  'transparent-erc20': {
    kind: 'transparent-erc20',
    visibility: 'public-onchain',
    confidentialClaimAllowed: false,
    publicFields: TRANSPARENT,
    copyKeys: ['P13_TRANSPARENT_PUBLIC'],
  },
  'ui-mask': {
    kind: 'ui-mask',
    visibility: 'public-onchain',
    confidentialClaimAllowed: false,
    publicFields: TRANSPARENT,
    copyKeys: ['P13_UI_MASK_ONLY', 'P13_TRANSPARENT_PUBLIC'],
  },
  'ct1-zama': {
    kind: 'ct1-zama',
    visibility: 'encrypted-onchain-fhe',
    confidentialClaimAllowed: true,
    publicFields: CT1_PUBLIC,
    copyKeys: ['CT_HIDES_AMOUNT_ONLY', 'CT_TRUST_ZAMA', ...NOT_PROTECTED_KEYS],
  },
  'ctm-cleartext': {
    kind: 'ctm-cleartext',
    visibility: 'plaintext-fixture',
    confidentialClaimAllowed: false,
    publicFields: ['amount', ...CT1_PUBLIC],
    copyKeys: ['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY'],
  },
  'commitment-zk': {
    kind: 'commitment-zk',
    visibility: 'unavailable',
    confidentialClaimAllowed: false,
    publicFields: [],
    copyKeys: ['P13_COMMITMENT_ZK_UNAVAILABLE'],
  },
};

/** Classifies a route. Transparent and masked routes never allow a confidential-amount claim. */
export function classifyRoute(kind: RouteKind): RouteClassification {
  const r = ROUTES[kind];
  check(r !== undefined, 'P13_UNSUPPORTED', 'unknown route');
  return r;
}

/** Consent text shown before any P13 preparation, bound by its digest. */
export interface DisclosureV1 {
  readonly schema: 'ghostpay.p13-disclosure/v1';
  readonly protocolId: P13ProtocolId;
  readonly maturity: 'testnet' | 'test-double';
  readonly trust: string;
  readonly visibility: AmountVisibility;
  readonly hides: readonly string[];
  readonly doesNotHide: readonly string[];
  readonly publicFields: readonly PublicField[];
  readonly relayerOrigin: string | null;
  readonly licence: string;
  readonly settlement: 'disabled';
  readonly review: 'none-independent';
}

const EXTRA_LIMITS = ['P13_SETTLEMENT_OFF', 'P13_NOT_REVIEWED', 'P13_RECORD_KEY', 'P13_NO_FEE_ADDON'] as const;

/**
 * Builds the disclosure for a protocol from the backend's static info plus the P13 limits.
 * @throws {P13Error} `P13_UNSUPPORTED` if any copy key is unknown, worded with a forbidden claim or a required
 * limit is missing, so a copy regression cannot ship a misleading consent screen.
 */
export function buildDisclosure(protocolId: P13ProtocolId): DisclosureV1 {
  const info = BACKEND_INFOS[protocolId];
  const route = classifyRoute(protocolId);
  const maturity = info.maturity;
  check(maturity === 'testnet' || maturity === 'test-double', 'P13_UNSUPPORTED', 'backend not built');
  const d: DisclosureV1 = {
    schema: 'ghostpay.p13-disclosure/v1',
    protocolId,
    maturity,
    trust: info.trust,
    visibility: route.visibility,
    hides: [...info.whatItHides],
    doesNotHide: [...info.whatItDoesNotHide, ...EXTRA_LIMITS.filter((k) => !info.whatItDoesNotHide.includes(k))],
    publicFields: route.publicFields,
    relayerOrigin: info.relayerOrigin,
    licence: info.licence,
    settlement: 'disabled',
    review: 'none-independent',
  };
  for (const key of [...d.hides, ...d.doesNotHide]) {
    check(isKnownCopyKey(key), 'P13_UNSUPPORTED', 'unknown copy key');
    check(findForbiddenWording(copyText(key) ?? '') === null, 'P13_UNSUPPORTED', 'copy makes a forbidden claim');
  }
  check(NOT_PROTECTED_KEYS.every((k) => d.doesNotHide.includes(k)), 'P13_UNSUPPORTED', 'limits incomplete');
  return d;
}

/**
 * Version digest of the disclosure as shown: fields plus the exact text of every line. Any field, key or wording change
 * invalidates a stored consent. It identifies what was shown; it is not a signature and does not prove that a user saw
 * it (a caller can compute it), so it gates the fixture flow only.
 */
export function disclosureDigest(d: DisclosureV1): Digest {
  return digestOf({ disclosure: d, lines: disclosureLines(d) });
}

/** Lines for the consent screen, in display order. */
export function disclosureLines(d: DisclosureV1): readonly { readonly key: string; readonly text: string }[] {
  return [...d.hides, ...d.doesNotHide].map((key) => ({ key, text: copyText(key) ?? '' }));
}
