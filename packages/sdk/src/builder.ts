import {
  createInvoice,
  encodeFragment,
  parseFragment,
  signInvoice,
  FRAGMENT_PREFIX,
  type EncodeOptions,
  type Invoice,
  type NewInvoice,
  type ParsedInvoice,
  type ParseOptions,
  type RandomSource,
  type SignedInvoice,
} from '@ghostpay/invoice-schema';
import { SdkInputError, wrapInvoice, wrapInvoiceAsync } from './errors.js';

/**
 * Builds a validated, unsigned invoice.
 *
 * @param input Invoice fields (money as decimal strings).
 * @param rng Injectable random source for tests.
 * @throws {SdkInvoiceError} On any schema violation (carries the schema path).
 */
export function buildInvoice(input: NewInvoice, rng?: RandomSource): Invoice {
  return wrapInvoice(() => createInvoice(input, rng));
}

/**
 * Signs an invoice with a 32-byte secp256k1 key.
 *
 * @param invoice Validated invoice whose `signer` matches the key.
 * @param signingKey Raw 32-byte private key; the caller owns it and should zeroize it.
 * @security The SDK never stores, logs or transmits the key.
 * @throws {SdkInvoiceError} On a bad key or a signer mismatch.
 */
export function signInvoiceWith(invoice: Invoice, signingKey: Uint8Array): SignedInvoice {
  return wrapInvoice(() => signInvoice(invoice, signingKey));
}

function checkBase(baseUrl: string): string {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new SdkInputError('baseUrl');
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '')
    throw new SdkInputError('baseUrl');
  return u.href;
}

export interface LinkOptions extends EncodeOptions {
  /** Pay-page URL (http/https, no credentials, query or hash). Omit to get the bare fragment. */
  readonly baseUrl?: string;
}

/**
 * Encodes a signed invoice as a shareable link (or bare `#gpi=v1.` fragment).
 *
 * @security The fragment is a bearer secret (it contains the decryption key when `encrypt` is set).
 * It lives after `#`, which browsers never send to servers; do not move it into a query string or log it.
 * @throws {SdkInputError} If `baseUrl` is not a clean http(s) URL.
 * @throws {SdkInvoiceError} Invalid signature, oversize, or crypto unavailable.
 */
export async function encodeInvoiceLink(signed: SignedInvoice, options: LinkOptions = {}): Promise<string> {
  const base = options.baseUrl === undefined ? undefined : checkBase(options.baseUrl);
  const { baseUrl: _unused, ...encodeOptions } = options;
  void _unused;
  const fragment = await wrapInvoiceAsync(() => encodeFragment(signed, encodeOptions));
  return base === undefined ? fragment : base + fragment;
}

/**
 * Extracts the fragment from a link (or accepts a bare fragment) and parses + authenticates it.
 *
 * @throws {SdkInputError} If no `#gpi=v1.` fragment is present.
 * @throws {SdkInvoiceError} On any parse failure; an invalid signature does not throw (see `trust`).
 * @security Treat a result with `trust: 'invalid-signature'` as a hard stop. Prefer `verifyFragment` for a full verdict.
 */
export async function parseInvoiceLink(link: string, options: ParseOptions = {}): Promise<ParsedInvoice> {
  if (typeof link !== 'string') throw new SdkInputError('link');
  const at = link.indexOf('#');
  const fragment = at === -1 ? '' : link.slice(at);
  if (!fragment.startsWith(FRAGMENT_PREFIX)) throw new SdkInputError('link');
  return wrapInvoiceAsync(() => parseFragment(fragment, options));
}

/** Immutable invoice builder with defaults, convenient for merchants creating many similar invoices. */
export interface InvoiceBuilder {
  /** Returns a new builder with `patch` merged over the defaults. */
  readonly with: (patch: Partial<NewInvoice>) => InvoiceBuilder;
  /** Builds a validated unsigned invoice. */
  readonly build: (rng?: RandomSource) => Invoice;
}

/**
 * Creates an {@link InvoiceBuilder}. Missing required fields surface as `SdkInvoiceError` at `build()`.
 */
export function invoiceBuilder(defaults: Partial<NewInvoice> = {}): InvoiceBuilder {
  return {
    with: (patch) => invoiceBuilder({ ...defaults, ...patch }),
    build: (rng) => buildInvoice(defaults as NewInvoice, rng),
  };
}
