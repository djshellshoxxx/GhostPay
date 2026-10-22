import { fail } from './errors.js';
import { parseBtcAddress, parseSilentPaymentAddress, type BtcNetwork } from './addresses.js';
import { formatAtomic, parseDecimal, toAtomic } from './decimal.js';
import { buildQuery, parseQuery, splitUri } from './query.js';
import { recipientInfo, type RecipientInfo } from './recipient.js';
import { checkText, hasMixedScript, MAX_LABEL_BYTES, MAX_MESSAGE_BYTES } from './text.js';

const MAX_SATS = 2_100_000_000_000_000n;
const KNOWN = new Set(['amount', 'label', 'message', 'sp', 'lightning']);
const BOLT11 = /^ln(bc|tb|bcrt)[0-9]*[a-z0-9]{50,1500}$/;
const ORDER: readonly BtcNetwork[] = ['main', 'test', 'regtest'];

/** Parsed BIP-21 / BIP-321 request (with BIP-352 `sp`). */
export interface BitcoinRequest {
  readonly network: BtcNetwork;
  /** On-chain address, if the URI carried one. */
  readonly address?: RecipientInfo;
  readonly addressType?: string;
  /** BIP-352 silent payment address from `sp=`. */
  readonly silentPayment?: RecipientInfo;
  /** BOLT11 invoice from `lightning=` (lowercase, charset checked, NOT decoded or verified). */
  readonly lightning?: string;
  readonly amountSats?: bigint;
  /** Plain text. Render with textContent only. */
  readonly label?: string;
  readonly message?: string;
  /** Keys of unknown optional parameters that were dropped (keys only, never values). */
  readonly ignored: readonly string[];
  /** True when label or message mixes Latin with Cyrillic/Greek in one word. */
  readonly mixedScriptText: boolean;
}

/** Options for {@link parseBitcoinUri}. */
export interface BitcoinParseOptions {
  /** Reject if the URI cannot be on this network. `tsp` and `lntb` addresses fit `test` (and `tsp` also `regtest`). */
  readonly expectedNetwork?: BtcNetwork;
}

/**
 * Strict BIP-21 / BIP-321 parser. Requires at least one payment instruction (address, `sp`, or `lightning`).
 * Keys are case-insensitive; duplicates of ANY key are rejected (stricter than BIP-321, which allows repeated payment
 * instructions). `req-<known>` is honoured as the known key; unknown `req-*` (including `req-pop`) is rejected; unknown
 * optional keys (including `pop`, `lno`, `pay`) are dropped and reported by key only. Amounts are BTC decimals with at
 * most 8 places, > 0 and <= 21,000,000 BTC. All instructions present must be compatible with one network.
 */
export function parseBitcoinUri(uri: string, opts: BitcoinParseOptions = {}): BitcoinRequest {
  const { scheme, rest, query } = splitUri(uri);
  if (scheme !== 'bitcoin') return fail('INVALID_SCHEME');
  const params = query === undefined ? [] : parseQuery(query, { foldKeys: true });
  const vals = new Map<string, string>();
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const p of params) {
    const req = p.key.startsWith('req-');
    const key = req ? p.key.slice(4) : p.key;
    if (seen.has(key)) return fail('DUPLICATE_PARAM');
    seen.add(key);
    if (KNOWN.has(key)) vals.set(key, p.value);
    else if (req) return fail('UNKNOWN_REQUIRED_PARAM');
    else ignored.push(key);
  }
  const allowed: (readonly BtcNetwork[])[] = [];
  let address: RecipientInfo | undefined;
  let addressType: string | undefined;
  if (rest !== '') {
    const a = parseBtcAddress(rest);
    address = recipientInfo('btc', a.address);
    addressType = a.type;
    allowed.push([a.network]);
  }
  let silentPayment: RecipientInfo | undefined;
  const sp = vals.get('sp');
  if (sp !== undefined) {
    const s = parseSilentPaymentAddress(sp);
    silentPayment = recipientInfo('silent-payment', s.address);
    allowed.push(s.network === 'main' ? ['main'] : ['test', 'regtest']);
  }
  const ln = vals.get('lightning')?.toLowerCase();
  if (ln !== undefined) {
    if (!BOLT11.test(ln)) return fail('INVALID_ADDRESS');
    allowed.push(ln.startsWith('lnbcrt') ? ['regtest'] : ln.startsWith('lnbc') ? ['main'] : ['test']);
  }
  if (allowed.length === 0) return fail('INVALID_QUERY');
  const common = ORDER.filter((n) => allowed.every((a) => a.includes(n)));
  if (common.length === 0) return fail('NETWORK_MISMATCH');
  if (opts.expectedNetwork !== undefined && !common.includes(opts.expectedNetwork))
    return fail('NETWORK_MISMATCH');
  const network = opts.expectedNetwork ?? common[0]!;
  const am = vals.get('amount');
  const amountSats = am === undefined ? undefined : toAtomic(parseDecimal(am, 8, MAX_SATS), 8);
  const label = vals.has('label') ? checkText(vals.get('label'), MAX_LABEL_BYTES) : undefined;
  const message = vals.has('message') ? checkText(vals.get('message'), MAX_MESSAGE_BYTES) : undefined;
  return {
    network,
    ...(address === undefined ? {} : { address, addressType: addressType! }),
    ...(silentPayment === undefined ? {} : { silentPayment }),
    ...(ln === undefined ? {} : { lightning: ln }),
    ...(amountSats === undefined ? {} : { amountSats }),
    ...(label === undefined ? {} : { label }),
    ...(message === undefined ? {} : { message }),
    ignored,
    mixedScriptText: [label, message].some((t) => t !== undefined && hasMixedScript(t)),
  };
}

/** Parameters for {@link buildBitcoinUri}. */
export interface BuildBitcoinParams {
  readonly address?: string;
  readonly silentPayment?: string;
  readonly amountSats?: bigint;
  readonly label?: string;
  readonly message?: string;
}

/**
 * Builds `bitcoin:[address]?[sp=..][&amount=..][&label=..][&message=..]`. At least one of `address` / `silentPayment`
 * is required; they must be on compatible networks. Output re-parses to the same values.
 */
export function buildBitcoinUri(p: BuildBitcoinParams): string {
  if (p.address === undefined && p.silentPayment === undefined) return fail('INVALID_ADDRESS');
  let head = '';
  let net: BtcNetwork | undefined;
  if (p.address !== undefined) {
    const a = parseBtcAddress(p.address);
    head = a.address;
    net = a.network;
  }
  const pairs: [string, string][] = [];
  if (p.silentPayment !== undefined) {
    const s = parseSilentPaymentAddress(p.silentPayment);
    if (net !== undefined && (net === 'main') !== (s.network === 'main')) return fail('NETWORK_MISMATCH');
    pairs.push(['sp', s.address]);
  }
  if (p.amountSats !== undefined) {
    if (typeof p.amountSats !== 'bigint' || p.amountSats <= 0n || p.amountSats > MAX_SATS)
      return fail('INVALID_AMOUNT');
    pairs.push(['amount', formatAtomic(p.amountSats, 8)]);
  }
  if (p.label !== undefined) pairs.push(['label', checkText(p.label, MAX_LABEL_BYTES)]);
  if (p.message !== undefined) pairs.push(['message', checkText(p.message, MAX_MESSAGE_BYTES)]);
  return `bitcoin:${head}${pairs.length === 0 ? '' : `?${buildQuery(pairs)}`}`;
}
