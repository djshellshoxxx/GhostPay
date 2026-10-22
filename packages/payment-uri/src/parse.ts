import { fail } from './errors.js';
import { parseBitcoinUri, type BitcoinParseOptions, type BitcoinRequest } from './bitcoin.js';
import { parseChainAddress, DEFAULT_CHAIN_SHORT_NAMES, type ChainAddress } from './eip3770.js';
import { parseEip681, type Eip681Options, type Eip681Request } from './eip681.js';
import { parseInvoiceLink, type InvoiceLink, type InvoiceLinkOptions } from './invoice-link.js';
import { MAX_URI_LENGTH } from './query.js';
import { parseSolanaPay, type SolanaTransferRequest } from './solana.js';
import { parseTronUri, type TronNetwork, type TronRequest } from './tron.js';

/** Result of {@link parsePaymentUri}, tagged by `kind`. */
export type ParsedPayload =
  | { readonly kind: 'eip681'; readonly value: Eip681Request }
  | { readonly kind: 'eip3770'; readonly value: ChainAddress }
  | { readonly kind: 'bitcoin'; readonly value: BitcoinRequest }
  | { readonly kind: 'solana-pay'; readonly value: SolanaTransferRequest }
  | { readonly kind: 'tron'; readonly value: TronRequest }
  | { readonly kind: 'invoice-link'; readonly value: InvoiceLink };

/** Options for {@link parsePaymentUri}. */
export interface ParseOptions {
  readonly eip681?: Eip681Options;
  readonly bitcoin?: BitcoinParseOptions;
  readonly tronNetwork?: TronNetwork;
  readonly invoiceLink?: InvoiceLinkOptions;
  readonly chainShortNames?: Readonly<Record<string, number>>;
}

/**
 * Detects the payload type of scanned or pasted text and parses it strictly. Surrounding whitespace is NOT trimmed
 * (reject, do not repair). Unknown schemes are rejected, never passed through.
 */
export function parsePaymentUri(text: string, opts: ParseOptions = {}): ParsedPayload {
  if (typeof text !== 'string') return fail('INVALID_INPUT');
  if (text.length === 0) return fail('INVALID_INPUT');
  if (/^https?:\/\//i.test(text)) return { kind: 'invoice-link', value: parseInvoiceLink(text, opts.invoiceLink) };
  if (text.length > MAX_URI_LENGTH) return fail('TOO_LONG');
  const c = text.indexOf(':');
  if (c <= 0) return fail('INVALID_SCHEME');
  const scheme = text.slice(0, c).toLowerCase();
  switch (scheme) {
    case 'ethereum':
      return { kind: 'eip681', value: parseEip681(text, opts.eip681) };
    case 'bitcoin':
      return { kind: 'bitcoin', value: parseBitcoinUri(text, opts.bitcoin) };
    case 'solana':
      return { kind: 'solana-pay', value: parseSolanaPay(text) };
    case 'tron':
      return { kind: 'tron', value: parseTronUri(text, opts.tronNetwork) };
    default:
      return { kind: 'eip3770', value: parseChainAddress(text, opts.chainShortNames ?? DEFAULT_CHAIN_SHORT_NAMES) };
  }
}
