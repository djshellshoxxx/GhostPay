import { fail } from './errors.js';

/** Fragment prefix of a GhostPay invoice link (matches `@ghostpay/invoice-schema` `FRAGMENT_PREFIX`). */
export const INVOICE_FRAGMENT_PREFIX = '#gpi=v1.';
/** Upper bound for a whole link: 16384 payload bytes in base64url is 21848 chars, plus origin and path. */
export const MAX_INVOICE_LINK_LENGTH = 22_200;

const LINK =
  /^(https|http):\/\/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::([1-9][0-9]{0,4}))?((?:\/[A-Za-z0-9._~-]+)*\/?)#gpi=v1\.([A-Za-z0-9_-]+)$/i;
/**
 * WHATWG URL "ends in a number": a host whose last label is decimal digits or `0x` plus hex digits is parsed as IPv4
 * (`0x7f000001`, `0x7f.1`, `1.2.3.0x4` are all IP addresses to a browser), never as a domain name.
 */
const IPV4_LAST_LABEL = /(?:^|\.)(?:[0-9]+|0x[0-9a-f]*)$/i;

/** Parsed invoice link. */
export interface InvoiceLink {
  /** `https://host[:port]` lowercase, for display and comparison. */
  readonly origin: string;
  readonly host: string;
  readonly path: string;
  /** Opaque base64url envelope (still unauthenticated; open it with `@ghostpay/invoice-schema`). */
  readonly payload: string;
  /** `#gpi=v1.<payload>`, as `parseFragment` expects. */
  readonly fragment: string;
}

/** Options for {@link parseInvoiceLink}. */
export interface InvoiceLinkOptions {
  /** If set, the host must be one of these (lowercase) names exactly. Strongly recommended. */
  readonly allowedHosts?: readonly string[];
  /** Permit `http://` for `localhost` / `127.0.0.1` (development only). */
  readonly allowLocalDev?: boolean;
}

/**
 * Strict parser for `https://<host>[:port][/path]#gpi=v1.<base64url>`. Rejects userinfo, query strings, non-ASCII hosts
 * (use punycode), IP literals in every form a browser reads as IPv4 (decimal, octal, hex or mixed) other than a literal
 * `127.0.0.1` in dev mode, `http` outside dev mode, and anything over {@link MAX_INVOICE_LINK_LENGTH}. The fragment is
 * NOT decoded or authenticated here.
 *
 * @security The key material lives in the fragment (bearer secret): never log the link.
 */
export function parseInvoiceLink(link: string, opts: InvoiceLinkOptions = {}): InvoiceLink {
  if (typeof link !== 'string') return fail('INVALID_INPUT');
  if (link.length > MAX_INVOICE_LINK_LENGTH) return fail('TOO_LONG');
  const m = LINK.exec(link);
  if (!m) return fail('INVALID_LINK');
  const scheme = m[1]!.toLowerCase();
  const host = m[2]!.toLowerCase();
  const port = m[3];
  const path = m[4] ?? '';
  const payload = m[5]!;
  const dev = opts.allowLocalDev === true;
  const local = host === 'localhost' || host === '127.0.0.1';
  if (IPV4_LAST_LABEL.test(host) && !(dev && host === '127.0.0.1')) return fail('INVALID_LINK');
  if (local && !dev) return fail('INVALID_LINK');
  if (scheme === 'http' && !(dev && local)) return fail('INVALID_LINK');
  if (port !== undefined && Number(port) > 65535) return fail('INVALID_LINK');
  if (path.includes('..')) return fail('INVALID_LINK');
  if (opts.allowedHosts !== undefined && !opts.allowedHosts.includes(host)) return fail('INVALID_LINK');
  if (payload.length % 4 === 1) return fail('INVALID_LINK');
  return {
    origin: `${scheme}://${host}${port === undefined ? '' : `:${port}`}`,
    host,
    path,
    payload,
    fragment: `${INVOICE_FRAGMENT_PREFIX}${payload}`,
  };
}

/** Builds an invoice link from an origin (`https://host[:port]`), optional path and a `#gpi=v1.` fragment. Re-validated by parsing. */
export function buildInvoiceLink(
  origin: string,
  fragment: string,
  path = '/pay',
  opts: InvoiceLinkOptions = {},
): string {
  if (typeof fragment !== 'string' || !fragment.startsWith(INVOICE_FRAGMENT_PREFIX))
    return fail('INVALID_LINK');
  const link = `${origin}${path}${fragment}`;
  const p = parseInvoiceLink(link, opts);
  return `${p.origin}${p.path}${p.fragment}`;
}
