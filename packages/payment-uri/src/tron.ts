import { fail } from './errors.js';
import { parseTronAddress } from './addresses.js';
import { parseDecimal, type Decimal } from './decimal.js';
import { buildQuery, parseQuery, splitUri } from './query.js';
import { recipientInfo, type RecipientInfo } from './recipient.js';
import { checkText, hasMixedScript, MAX_LABEL_BYTES, MAX_MESSAGE_BYTES } from './text.js';

/** TRON networks the GhostPay form can name. */
export type TronNetwork = 'mainnet' | 'nile' | 'shasta';

const NETWORKS: readonly TronNetwork[] = ['mainnet', 'nile', 'shasta'];
const MAX_SCALE = 18;
const BOUND = 10n ** 30n * 10n ** BigInt(MAX_SCALE);

/**
 * Parsed GhostPay TRON request.
 * NONSTANDARD: TRON has no widely adopted payment URI. `tron:<T-address>?amount=&token=&network=&label=&message=` is a
 * GhostPay-defined form; other wallets will not understand it.
 */
export interface TronRequest {
  readonly recipient: RecipientInfo;
  /** TRC-20 contract; absent means TRX. */
  readonly token?: RecipientInfo;
  /** Whole units (TRX or token). Convert with `toAtomic(amount, decimals)`. */
  readonly amount?: Decimal;
  readonly network: TronNetwork;
  readonly label?: string;
  readonly message?: string;
  readonly mixedScriptText: boolean;
}

/** Strict parser for the nonstandard GhostPay `tron:` form. `network` defaults to `mainnet` only when absent. */
export function parseTronUri(uri: string, expectedNetwork?: TronNetwork): TronRequest {
  const { scheme, rest, query } = splitUri(uri);
  if (scheme !== 'tron') return fail('INVALID_SCHEME');
  const recipient = parseTronAddress(rest);
  const params = query === undefined ? [] : parseQuery(query, { foldKeys: true });
  const v = new Map<string, string>();
  for (const p of params) {
    if (!['amount', 'token', 'network', 'label', 'message'].includes(p.key)) return fail('UNKNOWN_REQUIRED_PARAM');
    v.set(p.key, p.value);
  }
  const net = v.get('network') ?? 'mainnet';
  if (!(NETWORKS as readonly string[]).includes(net)) return fail('INVALID_QUERY');
  const network = net as TronNetwork;
  if (expectedNetwork !== undefined && network !== expectedNetwork) return fail('NETWORK_MISMATCH');
  const amount = v.has('amount') ? parseDecimal(v.get('amount')!, MAX_SCALE, BOUND) : undefined;
  const token = v.has('token') ? recipientInfo('tron', parseTronAddress(v.get('token')!)) : undefined;
  const label = v.has('label') ? checkText(v.get('label'), MAX_LABEL_BYTES) : undefined;
  const message = v.has('message') ? checkText(v.get('message'), MAX_MESSAGE_BYTES) : undefined;
  return {
    recipient: recipientInfo('tron', recipient),
    ...(token === undefined ? {} : { token }),
    ...(amount === undefined ? {} : { amount }),
    network,
    ...(label === undefined ? {} : { label }),
    ...(message === undefined ? {} : { message }),
    mixedScriptText: [label, message].some((t) => t !== undefined && hasMixedScript(t)),
  };
}

/** Parameters for {@link buildTronUri}. */
export interface BuildTronParams {
  readonly recipient: string;
  readonly amount?: string;
  readonly token?: string;
  readonly network?: TronNetwork;
  readonly label?: string;
  readonly message?: string;
}

/** Builds the nonstandard GhostPay `tron:` form. `network` is always written explicitly. */
export function buildTronUri(p: BuildTronParams): string {
  const network = p.network ?? 'mainnet';
  if (!NETWORKS.includes(network)) return fail('INVALID_QUERY');
  const pairs: [string, string][] = [['network', network]];
  if (p.amount !== undefined) pairs.push(['amount', parseDecimal(p.amount, MAX_SCALE, BOUND).canonical]);
  if (p.token !== undefined) pairs.push(['token', parseTronAddress(p.token)]);
  if (p.label !== undefined) pairs.push(['label', checkText(p.label, MAX_LABEL_BYTES)]);
  if (p.message !== undefined) pairs.push(['message', checkText(p.message, MAX_MESSAGE_BYTES)]);
  return `tron:${parseTronAddress(p.recipient)}?${buildQuery(pairs)}`;
}
