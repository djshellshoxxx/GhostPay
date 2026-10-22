import type { AssetId, ExitRouteId, ExitRouteInfo } from './types.js';

/**
 * Limits that apply to every pool route (spec section 2, N1-N6). Texts avoid claims of anonymity:
 * a pool exit only enlarges the crowd an observer must pick from (spec EP-UX-3).
 */
export const LIMIT_TEXT = Object.freeze({
  N1: 'N1: The deposit from your one-time address into the pool is public. Anyone, including the payer, can see that this payment went into the pool.',
  N2: 'N2: The crowd you blend into is the pool\'s, not GhostPay\'s. A small crowd, an exit amount equal to the deposit, or an exit soon after the deposit can still be linked by timing and amount.',
  N3: 'N3: Funding gas for the one-time address links it to whoever funded it, unless the gas is sponsored.',
  N4: 'N4: The pool relayer or broadcaster you use sees the destination address, the amount and your network address.',
  N5: 'N5: Operators of inclusion or screening lists see deposits and decide on them. A deposit that is not approved can only be returned to the original depositor address, which is a public exit.',
  N6: 'N6: The pool contracts, circuits and trusted setup are third-party code that GhostPay has not audited.',
} as const);

/** Keys of {@link LIMIT_TEXT}. */
export type LimitKey = keyof typeof LIMIT_TEXT;

/**
 * @param keys Limit keys that apply to a route.
 * @returns The corresponding texts, in key order.
 */
export function limitTexts(keys: readonly LimitKey[]): readonly string[] {
  return Object.freeze(keys.map((k) => LIMIT_TEXT[k]));
}

const SINGLE: readonly AssetId[] = Object.freeze([]);
const ALL_LIMITS: readonly LimitKey[] = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'];

/**
 * Static route descriptions. Dynamic fields (`chains`, `assets`, `lifecycle`, `feeDisclosure`) are
 * defaults here and are overwritten by each adapter's `info()` from the pinned manifest and chain reads.
 *
 * @security Nothing here is an address or a fee: those come from the manifest and the chain only (EP-GEN-3).
 */
export const EXIT_ROUTE_INFO: Readonly<Record<ExitRouteId, ExitRouteInfo>> = Object.freeze({
  'privacy-pools': {
    id: 'privacy-pools',
    name: 'Privacy Pools',
    chains: [],
    assets: SINGLE,
    lifecycle: 'unknown',
    maturity: 'young',
    feeDisclosure: 'unknown',
    whatItHides: ['Which deposit funded the destination address, within the pool crowd.'],
    whatItDoesNotHide: limitTexts(ALL_LIMITS),
    independentExit: 'ragequit',
    needsLiveThirdParty: ['relayer', 'asp', 'indexer'],
    auditStatus: 'unknown',
    available: true,
  },
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    chains: [],
    assets: SINGLE,
    lifecycle: 'unknown',
    maturity: 'young',
    feeDisclosure: 'unknown',
    whatItHides: ['Which shielded note funded the destination address, within the pool crowd.'],
    whatItDoesNotHide: limitTexts(ALL_LIMITS),
    independentExit: 'self-broadcast',
    needsLiveThirdParty: ['broadcaster', 'indexer', 'ppoi'],
    auditStatus: 'unknown',
    available: true,
  },
  'tornado-fixed': {
    id: 'tornado-fixed',
    name: 'Fixed-denomination pool',
    chains: [],
    assets: SINGLE,
    lifecycle: 'unknown',
    maturity: 'testnet-only',
    feeDisclosure: 'unknown',
    whatItHides: [],
    whatItDoesNotHide: limitTexts(ALL_LIMITS),
    independentExit: 'none',
    needsLiveThirdParty: [],
    auditStatus: 'unknown',
    available: false,
    unavailableReason: 'not available: decision record only (spec 12.3); would make GhostPay a pool operator',
  },
  aztec: {
    id: 'aztec',
    name: 'Aztec',
    chains: [],
    assets: SINGLE,
    lifecycle: 'unknown',
    maturity: 'alpha',
    feeDisclosure: 'unknown',
    whatItHides: [],
    whatItDoesNotHide: limitTexts(ALL_LIMITS),
    independentExit: 'none',
    needsLiveThirdParty: [],
    auditStatus: 'unknown',
    available: false,
    unavailableReason: 'not available: watch only; different chain and wallet model',
  },
  'mock-pool': {
    id: 'mock-pool',
    name: 'Mock pool (test)',
    chains: [31337],
    assets: SINGLE,
    lifecycle: 'active',
    maturity: 'test-double',
    feeDisclosure: 'unknown',
    whatItHides: [],
    whatItDoesNotHide: ['Test double: no cryptographic privacy at all. Every link is visible.', ...limitTexts(ALL_LIMITS)],
    independentExit: 'ragequit',
    needsLiveThirdParty: ['relayer', 'indexer', 'asp'],
    auditStatus: 'none-found',
    available: true,
  },
});
