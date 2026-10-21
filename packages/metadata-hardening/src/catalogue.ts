import { MetadataHardeningError } from './guard.js';

/** Every selectable MH-* id. MH-BTC-1..6 are listed individually. */
export const MH_IDS = [
  'MH-FEE-1', 'MH-FEE-2', 'MH-ANN-1', 'MH-ANN-2', 'MH-ANN-3', 'MH-TAG-1', 'MH-TAG-2',
  'MH-AMT-1', 'MH-AMT-2', 'MH-WAL-1', 'MH-WAL-2', 'MH-REL-1', 'MH-REL-2', 'MH-REL-3',
  'MH-REL-4', 'MH-REL-5', 'MH-NET-1', 'MH-NET-2', 'MH-NET-3', 'MH-SCAN-1', 'MH-SCAN-2',
  'MH-SCAN-3', 'MH-INV-1', 'MH-INV-2', 'MH-INV-3', 'MH-WEB-1', 'MH-WEB-2', 'MH-WEB-3',
  'MH-ID-1', 'MH-ID-2', 'MH-BTC-1', 'MH-BTC-2', 'MH-BTC-3', 'MH-BTC-4', 'MH-BTC-5', 'MH-BTC-6',
] as const;
/** A feature id. */
export type MhId = (typeof MH_IDS)[number];

/** Catalogue row. `doesNotProtect` is normative UI copy from the spec. */
export interface MhEntry {
  readonly title: string;
  readonly defaultOn: boolean;
  readonly hides: string;
  readonly doesNotProtect: string;
}

const row = (title: string, defaultOn: boolean, hides: string, doesNotProtect: string): MhEntry => ({ title, defaultOn, hides, doesNotProtect });
const PUB = 'The payer, amount, token and time stay public.';

/** Spec table, honest labels. No entry claims anonymity. */
export const MH_CATALOGUE: Readonly<Record<MhId, MhEntry>> = {
  'MH-FEE-1': row('Direct payment without the router', false, 'The fee transfer and router-topic enumeration.', `${PUB} No router protection; the receiver cannot verify the amount from the announcement.`),
  'MH-FEE-2': row('Router keeps the fee, recipient pulls in batches', false, 'Per-payment link to the fee address.', 'The transfer to the router still states the gross amount; the router holds token balances.'),
  'MH-ANN-1': row('Standard shared announcer (scheme 1)', true, 'Scheme id does not mark GhostPay.', 'The router address as caller and the fixed 57-byte metadata layout still mark router payments.'),
  'MH-ANN-2': row('GhostPay-specific scheme id', false, 'Nothing.', 'Makes your payments easier to find and breaks compatibility with other wallets.'),
  'MH-ANN-3': row('Minimal metadata (view tag only)', false, 'Amount and token from the announcement log.', 'The token transfer itself still shows the amount.'),
  'MH-TAG-1': row('Keep the view tag', true, 'Tag is noise without the viewing key.', 'Reveals one byte of a shared-secret hash (security margin 128 to 124 bits).'),
  'MH-TAG-2': row('Drop or mask the view tag', false, 'Some bits of a shared-secret hash.', 'Benefit is marginal; other wallets may not detect the payment; scanning is slower.'),
  'MH-AMT-1': row('Round quote-derived amounts', true, 'Client and quote-moment fingerprint in the amount.', 'The amount itself stays public; you overpay up to one grid step.'),
  'MH-AMT-2': row('Add random overpayment', false, 'Exact match between invoice amount and chain amount.', 'The amount stays public and in/out amounts still match across a sweep; you lose the extra.'),
  'MH-WAL-1': row('Bucket the payer gas limit', false, 'Wallet-specific gas padding.', 'Wallet type, tip pattern, nonce and payer address stay public.'),
  'MH-WAL-2': row('Bucket the relayer gas limit', false, 'Relayer estimator-specific limit.', 'The single relayer hot key and sweep content stay public.'),
  'MH-REL-1': row('Private submission path', false, 'Pre-inclusion visibility in the public mempool.', 'Post-inclusion chain data; the private endpoint sees everything the relayer RPC sees.'),
  'MH-REL-2': row('Random release delay and order', false, 'Request arrival time and order versus chain order.', 'Content and the payer-knows-S1 link.'),
  'MH-REL-3': row('Pad request and response sizes', false, 'Request length classes.', 'IP address, timing and destination host.'),
  'MH-REL-4': row('Use several relayers', false, 'One relayer seeing all your sweeps over time.', 'Any single sweep from its chosen relayer; operators may collude.'),
  'MH-REL-5': row('Zero-log relayer mode', false, 'Operator-side per-request log lines.', 'Proxy, CDN and RPC logs, chain data, in-memory state during a request.'),
  'MH-NET-1': row('Separate scan and query RPC endpoints', false, 'One provider seeing both scanning and per-address queries.', 'Your IP from either provider; providers that see both can still join them.'),
  'MH-NET-2': row('Run your own node', false, 'RPC-provider visibility.', "The node's own network exposure when it broadcasts."),
  'MH-NET-3': row('Light client (integrity only)', false, 'Nothing about your queries.', 'Does not hide queries: the upstream still sees requested addresses.'),
  'MH-SCAN-1': row('Fetch full log ranges', true, 'Which announcements are yours.', 'The scan range and timing, and address verification reads.'),
  'MH-SCAN-2': row('Aligned scan ranges', false, 'Your exact last-scanned block.', 'That this IP scans GhostPay announcements.'),
  'MH-SCAN-3': row('PIR scanning (research)', false, 'Which record is read, if servers do not collude.', 'IP, existence of a query, or collusion.'),
  'MH-INV-1': row('Pad invoice private part', false, 'Memo and line-item length from people who see the ciphertext.', 'That an invoice exists, its public fields, or content from the link holder.'),
  'MH-INV-2': row('Encrypt invoice details by default', false, 'Line items and memo in partial exposure.', 'The key is in the same link: anyone with the full link can read it. Public fields stay readable.'),
  'MH-INV-3': row('Coarse invoice timestamps', false, 'Exact creation time and fixed-offset expiry pattern.', 'The hour, and the chain payment time.'),
  'MH-WEB-1': row('Strict referrer policy', true, 'The page URL and origin from third parties and RPC hosts.', 'Your IP, the Origin header on cross-origin requests, browser history of the link.'),
  'MH-WEB-2': row('No third parties; tight connect-src', true, 'Limits where leaked data can go.', 'Bugs in the app itself; changing RPC needs a reload.'),
  'MH-WEB-3': row('Subresource integrity', false, 'A host silently swapping a script.', 'A tampered index page.'),
  'MH-ID-1': row('Per-invoice meta-address and signer', false, 'Linking invoices by meta-address or signer.', 'Same payer wallet, router, shared sweep destination, or a channel carrying two invoices.'),
  'MH-ID-2': row('Per-chain keys', false, 'Linking invoices across chains.', 'Same payer wallets across chains, destination reuse, bridging, one RPC provider seeing both chains.'),
  'MH-BTC-1': row('Bitcoin change handling', true, 'Round-number payment inference.', 'Change by value-pattern heuristics, and common-input ownership.'),
  'MH-BTC-2': row('Bitcoin fee-rate normalisation', false, 'Wallet fee estimator fingerprint (magnitude unverified).', 'Everything else about the transaction; you overpay up to one step.'),
  'MH-BTC-3': row('Bitcoin locktime', false, 'A zero locktime that stands out.', 'Nothing else; conflicts with PayJoin unless unchanged.'),
  'MH-BTC-4': row('Bitcoin RBF signalling', true, 'The unusual look of non-RBF transactions.', 'Nothing else.'),
  'MH-BTC-5': row('Bitcoin input/output ordering', true, 'The "payment first, change last" heuristic.', 'Amount and script-type heuristics.'),
  'MH-BTC-6': row('Strip PSBT fingerprints', false, 'Wallet and path hints in shared PSBTs.', 'The transaction itself once broadcast.'),
};

/** Settings object: one boolean per id plus the tag mode string (spec section 7 item 1). */
export interface HardeningSettings {
  readonly enabled: Readonly<Record<MhId, boolean>>;
  /** `'full' | 'ignore' | 'mask:k'`, meaningful when MH-TAG-2 is on. */
  readonly tagMode: string;
}

/** Spec defaults. */
export function defaultHardening(): HardeningSettings {
  const enabled = {} as Record<MhId, boolean>;
  for (const id of MH_IDS) enabled[id] = MH_CATALOGUE[id].defaultOn;
  return { enabled, tagMode: 'full' };
}

/** The spec's recommended "hardened" PoC preset. */
export const HARDENED_PRESET: readonly MhId[] = [
  'MH-ANN-1', 'MH-TAG-1', 'MH-AMT-1', 'MH-INV-2', 'MH-INV-3', 'MH-WEB-1', 'MH-WEB-2', 'MH-SCAN-1', 'MH-SCAN-2',
  'MH-NET-1', 'MH-REL-2', 'MH-REL-5', 'MH-BTC-1', 'MH-BTC-2', 'MH-BTC-3', 'MH-BTC-4', 'MH-BTC-5',
];

/** Builds the hardened preset (only these ids on). */
export function hardenedSettings(): HardeningSettings {
  const enabled = {} as Record<MhId, boolean>;
  for (const id of MH_IDS) enabled[id] = HARDENED_PRESET.includes(id);
  return { enabled, tagMode: 'full' };
}

/** Result of {@link validateHardening}. */
export interface HardeningReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Spec section 6 conflict and dependency rules.
 *
 * @remarks Errors block (mutually exclusive or invalid pair); warnings are dependency notes.
 */
export function validateHardening(s: HardeningSettings): HardeningReport {
  const on = (id: MhId): boolean => s.enabled[id];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (on('MH-AMT-1') && on('MH-AMT-2')) errors.push('MH-AMT-1 and MH-AMT-2: pick one.');
  if (on('MH-FEE-1') && on('MH-FEE-2')) errors.push('MH-FEE-1 and MH-FEE-2 are mutually exclusive.');
  if (on('MH-TAG-1') && on('MH-TAG-2')) errors.push('MH-TAG-1 (keep tag) and MH-TAG-2 (drop/mask tag) conflict.');
  if (on('MH-TAG-2') && s.tagMode === 'full') errors.push('MH-TAG-2 needs tagMode ignore or mask:k.');
  if (!on('MH-TAG-2') && s.tagMode !== 'full') errors.push('tagMode other than full needs MH-TAG-2.');
  if (on('MH-INV-1') && !on('MH-INV-2')) warnings.push('MH-INV-1 padding is moot without MH-INV-2 encryption.');
  if (on('MH-ANN-3') && !on('MH-FEE-1')) warnings.push('MH-ANN-3 only works with MH-FEE-1: the router forces 57-byte metadata.');
  if (on('MH-FEE-1') && on('MH-ANN-3')) warnings.push('Scanner must read the amount from the token transfer (unverified until read).');
  if (on('MH-ANN-2')) warnings.push('MH-ANN-2 makes your payments easier to find.');
  if (on('MH-TAG-2')) warnings.push('MH-TAG-2: other wallets may not detect the payment.');
  if (on('MH-ID-1') && !on('MH-ID-2')) warnings.push('MH-ID-1 and MH-ID-2 share one seed derivation module.');
  if (on('MH-BTC-3')) warnings.push('MH-BTC-3 conflicts with PayJoin unless locktime stays unchanged.');
  if (on('MH-REL-2') && on('MH-REL-1') === false) warnings.push('MH-REL-2 is timing only: still one tx per sweep.');
  return { errors, warnings };
}

/**
 * Throws if the settings have blocking conflicts.
 *
 * @throws {MetadataHardeningError} `CONFLICT` with the first error.
 */
export function assertHardening(s: HardeningSettings): void {
  const r = validateHardening(s);
  if (r.errors.length > 0) throw new MetadataHardeningError('CONFLICT', r.errors[0] as string);
}
