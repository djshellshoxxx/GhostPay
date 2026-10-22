import { validateAddress, type AddressInfo } from './address.js';
import { err, ok, type Result } from './result.js';
import { hasControlOrInvisible, isMixedScript } from './text.js';

/** Mirrors invoice-schema `FRAGMENT_PREFIX` (`#gpi=v1.`); pinned by a test against the documented format. */
export const INVOICE_FRAGMENT_PREFIX = '#gpi=v1.';
/** Mirrors invoice-schema `MAX_DECODED_BYTES` (16 KiB). */
export const INVOICE_MAX_DECODED_BYTES = 16_384;
/** Longest encoded invoice payload: ceil(16384 * 4 / 3) unpadded base64url chars. */
export const INVOICE_MAX_ENCODED_CHARS = Math.ceil((INVOICE_MAX_DECODED_BYTES * 4) / 3);
/** Default cap on one raw scan (a QR symbol holds at most ~4.3k chars). */
export const MAX_SCAN_CHARS = 4096;
/** Cap on any reassembled or shared payload: fragment + generous URL head. */
export const MAX_PAYLOAD_CHARS = INVOICE_MAX_ENCODED_CHARS + 512;
/** Max chars of a `ghostpay:` URI label. */
export const MAX_LABEL_CHARS = 64;

export type PayloadErrorCode =
  | 'not-string'
  | 'empty'
  | 'too-large'
  | 'control-char'
  | 'non-ascii'
  | 'whitespace'
  | 'scheme-not-allowed'
  | 'insecure-scheme'
  | 'malformed-url'
  | 'host-not-allowed'
  | 'credentials-not-allowed'
  | 'port-not-allowed'
  | 'query-not-allowed'
  | 'bad-path'
  | 'bad-fragment'
  | 'fragment-not-allowed'
  | 'bad-address'
  | 'bad-param'
  | 'duplicate-param'
  | 'unknown-param'
  | 'bad-amount'
  | 'bad-asset'
  | 'asset-not-allowed'
  | 'bad-chain'
  | 'bad-label'
  | 'unrecognized';

/** Policy for classifying untrusted payloads. */
export interface PayloadPolicy {
  /** Exact lowercase ASCII hostnames whose https links are accepted (no wildcards, no suffix matching). */
  readonly allowedHosts: readonly string[];
  /** Optional allowlist of asset symbols for `ghostpay:` URIs. Omit to accept any well-formed symbol. */
  readonly assetAllowlist?: readonly string[];
  /** Max chars of the raw input. Default {@link MAX_SCAN_CHARS}. */
  readonly maxChars?: number;
}

/** Invoice fragment link (`https://host/path#gpi=v1.…` or a bare `#gpi=v1.…`). */
export interface InvoiceLinkPayload {
  readonly kind: 'invoice-link';
  /** The `#gpi=v1.<b64url>` fragment, bearer secret. Pass to `parseFragment`; never log or send. */
  readonly fragment: string;
  /** `https://host` or null for a bare fragment. */
  readonly origin: string | null;
  readonly path: string;
  /** Fragment-free, log-safe form. */
  readonly safeDisplay: string;
}
/** Parsed `ghostpay:` payment URI. */
export interface PaymentUriPayload {
  readonly kind: 'payment-uri';
  readonly address: AddressInfo;
  /** Canonical decimal string (not yet bound to asset decimals). */
  readonly amount?: string;
  readonly asset?: string;
  readonly chainId?: number;
  readonly label?: string;
  readonly safeDisplay: string;
}
/** A raw address. */
export interface AddressPayload {
  readonly kind: 'address';
  readonly address: AddressInfo;
  readonly safeDisplay: string;
}
export type Payload = InvoiceLinkPayload | PaymentUriPayload | AddressPayload;

const ASSET_RE = /^[A-Z][A-Z0-9]{1,11}$/;
const AMOUNT_RE = /^(0|[1-9][0-9]{0,38})(?:\.[0-9]{1,18})?$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const PATH_RE = /^\/[A-Za-z0-9/_-]{0,63}$/;
const PARAM_KEYS = ['amount', 'asset', 'chain', 'label'] as const;

/**
 * Shared hygiene for every untrusted string: type, trim ASCII whitespace, length cap,
 * control/invisible/non-ASCII rejection, no inner whitespace.
 *
 * @param raw Untrusted input.
 * @param maxChars Cap applied to the trimmed value.
 * @security Rejecting non-ASCII outright removes IDN/homoglyph host tricks and bidi spoofing from URLs.
 */
export function sanitizeInput(raw: unknown, maxChars: number): Result<string, PayloadErrorCode> {
  if (typeof raw !== 'string') return err('not-string');
  if (raw.length > maxChars + 64) return err('too-large'); // cheap pre-check before trimming
  const s = raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (s === '') return err('empty');
  if (s.length > maxChars) return err('too-large');
  if (hasControlOrInvisible(s)) return err('control-char');
  if (/[^\x20-\x7e]/.test(s)) return err('non-ascii');
  if (s.includes(' ')) return err('whitespace');
  return ok(s);
}

function hostFromPolicy(host: string, policy: PayloadPolicy): boolean {
  return policy.allowedHosts.some((h) => h === host);
}

function fragmentOk(hash: string): boolean {
  if (!hash.startsWith(INVOICE_FRAGMENT_PREFIX)) return false;
  const enc = hash.slice(INVOICE_FRAGMENT_PREFIX.length);
  return enc.length > 0 && enc.length <= INVOICE_MAX_ENCODED_CHARS && B64URL_RE.test(enc);
}

/** `#gpi=v1.…` with the secret replaced by its length. */
function hiddenFragment(fragment: string): string {
  return `${INVOICE_FRAGMENT_PREFIX}[${String(fragment.length - INVOICE_FRAGMENT_PREFIX.length)} chars hidden]`;
}

function parseInvoiceLink(s: string, policy: PayloadPolicy): Result<InvoiceLinkPayload, PayloadErrorCode> {
  if (s.startsWith('#')) {
    if (!fragmentOk(s)) return err('bad-fragment');
    return ok({ kind: 'invoice-link', fragment: s, origin: null, path: '', safeDisplay: hiddenFragment(s) });
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return err('malformed-url');
  }
  if (url.protocol !== 'https:') return err('insecure-scheme');
  if (url.username !== '' || url.password !== '') return err('credentials-not-allowed');
  if (url.port !== '') return err('port-not-allowed');
  if (!hostFromPolicy(url.hostname, policy)) return err('host-not-allowed');
  if (url.search !== '') return err('query-not-allowed');
  if (!PATH_RE.test(url.pathname)) return err('bad-path');
  if (!fragmentOk(url.hash)) return err('bad-fragment');
  const origin = `https://${url.hostname}`;
  return ok({
    kind: 'invoice-link',
    fragment: url.hash,
    origin,
    path: url.pathname,
    safeDisplay: `${origin}${url.pathname}${hiddenFragment(url.hash)}`,
  });
}

function decodeParam(v: string): string | null {
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}

function parsePaymentUri(s: string, policy: PayloadPolicy): Result<PaymentUriPayload, PayloadErrorCode> {
  const body = s.slice(s.indexOf(':') + 1);
  if (body.includes('#')) return err('fragment-not-allowed');
  if (body.startsWith('/')) return err('bad-address');
  const q = body.indexOf('?');
  const addrRaw = q < 0 ? body : body.slice(0, q);
  const addr = validateAddress(addrRaw);
  if (!addr.ok) return err('bad-address');
  const params = new Map<string, string>();
  if (q >= 0) {
    const query = body.slice(q + 1);
    if (query === '') return err('bad-param');
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq < 1) return err('bad-param');
      const k = pair.slice(0, eq);
      const v = decodeParam(pair.slice(eq + 1));
      if (v === null) return err('bad-param');
      if (!(PARAM_KEYS as readonly string[]).includes(k)) return err('unknown-param');
      if (params.has(k)) return err('duplicate-param');
      params.set(k, v);
    }
  }
  const amount = params.get('amount');
  const asset = params.get('asset');
  const chain = params.get('chain');
  const label = params.get('label');
  if (amount !== undefined && !AMOUNT_RE.test(amount)) return err('bad-amount');
  if (asset !== undefined) {
    if (!ASSET_RE.test(asset)) return err('bad-asset');
    if (policy.assetAllowlist !== undefined && !policy.assetAllowlist.includes(asset))
      return err('asset-not-allowed');
  }
  let chainId: number | undefined;
  if (chain !== undefined) {
    if (!/^[1-9][0-9]{0,14}$/.test(chain)) return err('bad-chain');
    chainId = Number(chain);
  }
  if (label !== undefined) {
    if (label === '' || [...label].length > MAX_LABEL_CHARS) return err('bad-label');
    if (hasControlOrInvisible(label) || isMixedScript(label)) return err('bad-label');
  }
  const parts = [`ghostpay:${addr.value.canonical}`];
  if (amount !== undefined) parts.push(amount);
  if (asset !== undefined) parts.push(asset);
  if (chainId !== undefined) parts.push(`chain ${String(chainId)}`);
  return ok({
    kind: 'payment-uri',
    address: addr.value,
    ...(amount === undefined ? {} : { amount }),
    ...(asset === undefined ? {} : { asset }),
    ...(chainId === undefined ? {} : { chainId }),
    ...(label === undefined ? {} : { label }),
    safeDisplay: parts.join(' '),
  });
}

/**
 * Classifies one untrusted string as an invoice fragment link, a `ghostpay:` URI, or a raw address.
 *
 * @remarks Strict allowlist: https only, exact-host match, no credentials/port/query on invoice
 * links, canonical amounts, unknown or repeated URI params rejected. Non-ASCII input is rejected.
 * The returned `safeDisplay` never contains the invoice fragment.
 * @param raw Untrusted scanned/shared/pasted string.
 * @param policy Host allowlist and caps.
 * @security The fragment is a bearer secret (ADR-0005): it is returned only in `fragment` for the
 * caller to hand to `parseFragment`; it is absent from `safeDisplay`. No signature or trust is checked here.
 */
export function classifyPayload(raw: unknown, policy: PayloadPolicy): Result<Payload, PayloadErrorCode> {
  const clean = sanitizeInput(raw, policy.maxChars ?? MAX_SCAN_CHARS);
  if (!clean.ok) return clean;
  const s = clean.value;
  if (s.startsWith('#')) return parseInvoiceLink(s, policy);
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(s);
  if (scheme !== null) {
    const name = (scheme[1] as string).toLowerCase();
    if (name === 'ghostpay') return parsePaymentUri(s, policy);
    if (name === 'https' || name === 'http') return parseInvoiceLink(s, policy);
    return err('scheme-not-allowed');
  }
  const addr = validateAddress(s);
  if (addr.ok) return ok({ kind: 'address', address: addr.value, safeDisplay: addr.value.canonical });
  return err('unrecognized');
}
