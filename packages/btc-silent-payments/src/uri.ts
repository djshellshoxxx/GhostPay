import { decodeSilentPaymentAddress, type SilentPaymentNetwork } from './address.js';
import { fail } from './errors.js';
import { btcStringToSats, satsToBtcString } from './units.js';

/** Fields of a silent payment `bitcoin:` URI. */
export interface BitcoinUri {
  /** Silent payment address (`sp1...` or `tsp1...`), lowercase. */
  readonly address: string;
  readonly network: SilentPaymentNetwork;
  /** Requested amount in satoshis, when present. Always > 0. */
  readonly amountSats?: bigint;
  readonly label?: string;
  readonly message?: string;
}

/** Fields accepted by {@link buildBitcoinUri}. */
export interface BuildUriParams {
  readonly address: string;
  readonly amountSats?: bigint;
  readonly label?: string;
  readonly message?: string;
}

const MAX_URI_LENGTH = 2048;

/** `encodeURIComponent` throws a raw `URIError` on lone surrogates: surface a typed error instead. */
function encode(v: string): string {
  try {
    return encodeURIComponent(v);
  } catch {
    return fail('INVALID_URI');
  }
}

/**
 * Builds `bitcoin:?sp=<address>[&amount=<btc decimal>][&label=..][&message=..]`
 * (BIP-21 style with the BIP-321 `sp` parameter and an empty on-chain address part).
 *
 * @remarks The address is fully validated, the amount must be a positive bigint of satoshis and
 * is rendered with {@link satsToBtcString}. `label` and `message` are percent-encoded.
 *
 * @param p URI fields.
 * @returns The URI string.
 * @throws {SilentPaymentError} `INVALID_ADDRESS`, `INVALID_AMOUNT`, `INVALID_URI`.
 * @security Public data only.
 */
export function buildBitcoinUri(p: BuildUriParams): string {
  decodeSilentPaymentAddress(p.address);
  let uri = `bitcoin:?sp=${p.address}`;
  if (p.amountSats !== undefined) {
    if (p.amountSats <= 0n) return fail('INVALID_AMOUNT');
    uri += `&amount=${satsToBtcString(p.amountSats)}`;
  }
  if (p.label !== undefined) uri += `&label=${encode(p.label)}`;
  if (p.message !== undefined) uri += `&message=${encode(p.message)}`;
  if (uri.length > MAX_URI_LENGTH) return fail('INVALID_URI');
  return uri;
}

function decodeValue(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return fail('INVALID_URI');
  }
}

/**
 * Strictly parses a silent payment `bitcoin:` URI.
 *
 * @remarks Rules: scheme `bitcoin:` (case-insensitive); empty address part (on-chain fallback
 * addresses are not supported and rejected); required `sp`; optional `amount` in strict BTC
 * decimal (must be positive); `label`, `message`; duplicate keys rejected; unknown `req-*`
 * parameters rejected as BIP-21 requires; other unknown parameters ignored; no fragment.
 *
 * @param uri URI text.
 * @param expectedNetwork When set, the `sp` address must be for this network (chain-mismatch protection).
 * @returns Parsed fields.
 * @throws {SilentPaymentError} `INVALID_URI`, `INVALID_ADDRESS`, `NETWORK_MISMATCH`, `INVALID_AMOUNT`.
 * @security Treat the input as hostile.
 */
export function parseBitcoinUri(uri: string, expectedNetwork?: SilentPaymentNetwork): BitcoinUri {
  if (typeof uri !== 'string' || uri.length > MAX_URI_LENGTH || uri.includes('#')) return fail('INVALID_URI');
  if (!/^bitcoin:\?/i.test(uri)) return fail('INVALID_URI');
  const seen = new Set<string>();
  let sp: string | undefined;
  let amountSats: bigint | undefined;
  let label: string | undefined;
  let message: string | undefined;
  for (const pair of uri.slice('bitcoin:?'.length).split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) return fail('INVALID_URI');
    const key = pair.slice(0, eq);
    const value = decodeValue(pair.slice(eq + 1));
    if (seen.has(key)) return fail('INVALID_URI');
    seen.add(key);
    if (key === 'sp') sp = value;
    else if (key === 'amount') {
      amountSats = btcStringToSats(value);
      if (amountSats <= 0n) return fail('INVALID_AMOUNT');
    } else if (key === 'label') label = value;
    else if (key === 'message') message = value;
    else if (key.startsWith('req-')) return fail('INVALID_URI');
  }
  if (sp === undefined) return fail('INVALID_URI');
  const decoded = decodeSilentPaymentAddress(sp, expectedNetwork);
  return {
    address: sp,
    network: decoded.network,
    ...(amountSats === undefined ? {} : { amountSats }),
    ...(label === undefined ? {} : { label }),
    ...(message === undefined ? {} : { message }),
  };
}
