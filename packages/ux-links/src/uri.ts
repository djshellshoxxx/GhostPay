import { fail } from './errors.js';
import { parseAmount, validateAsset } from './amount.js';
import { validateText } from './text.js';
import { validateMetaAddress } from './target.js';
import { isPosInt } from './validate.js';

/** Maximum accepted URI length in UTF-16 units (checked before any parsing). */
export const MAX_URI_LENGTH = 2048;
/** Maximum memo length in code points. */
export const MAX_MEMO = 140;
const SCHEME = 'ghostpay:';
const SECRET = /^[A-Za-z0-9_-]{22,86}$/;
const SECRET_KEY = /(key|secret|seed|priv|token|pass|mnemonic|sig|auth)/i;
const QUERY_ORDER = ['amount', 'asset', 'chain', 'exp', 'memo'] as const;

/** Fields carried by a `ghostpay:` payment URI. */
export interface PaymentUri {
  /** Stealth meta-address (lowercase). */
  readonly target: string;
  /** Canonical decimal amount (<=18 fractional digits). */
  readonly amount?: string;
  /** Asset symbol, e.g. `USDC`. */
  readonly asset?: string;
  /** Chain id (positive integer). */
  readonly chainId?: number;
  /** Expiry, unix seconds. */
  readonly expiresAt?: number;
  /** Payer-visible memo (text only). */
  readonly memo?: string;
  /** Secret (base64url, 22-86 chars). Only ever serialised into the `#k=` fragment. */
  readonly secret?: string;
}

function enc(v: string): string {
  // encodeURIComponent throws URIError on lone surrogates; text.ts rejects them earlier.
  return encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function validateSecret(v: unknown): string {
  if (typeof v !== 'string' || !SECRET.test(v)) return fail('FRAGMENT', 'secret');
  return v;
}

/**
 * Builds a canonical `ghostpay:` URI.
 *
 * @remarks Format: `ghostpay:<meta-address>[?amount=..&asset=..&chain=..&exp=..&memo=..][#k=<secret>]`.
 * Parameter order is fixed so equal inputs give byte-identical URIs. Secrets
 * are written to the fragment only, which browsers never send to servers.
 * @throws {LinkError} For any invalid field. Output length is always below {@link MAX_URI_LENGTH}.
 * @security Never place secrets in the query. Do not log the full URI; use {@link redactUri}.
 * @testVector uri-canonical
 */
export function buildPaymentUri(p: PaymentUri): string {
  const target = validateMetaAddress(p.target);
  const q: Record<(typeof QUERY_ORDER)[number], string | undefined> = {
    amount: p.amount === undefined ? undefined : (parseAmount(p.amount, 18), p.amount),
    asset: p.asset === undefined ? undefined : validateAsset(p.asset),
    chain:
      p.chainId === undefined ? undefined : isPosInt(p.chainId) ? String(p.chainId) : fail('PARAM', 'chain'),
    exp:
      p.expiresAt === undefined
        ? undefined
        : isPosInt(p.expiresAt)
          ? String(p.expiresAt)
          : fail('PARAM', 'exp'),
    memo: p.memo === undefined ? undefined : validateText(p.memo, MAX_MEMO, 'TEXT', 'memo'),
  };
  const parts: string[] = [];
  for (const k of QUERY_ORDER) {
    const v = q[k];
    if (v !== undefined) parts.push(`${k}=${enc(v)}`);
  }
  let out = SCHEME + target;
  if (parts.length > 0) out += `?${parts.join('&')}`;
  if (p.secret !== undefined) out += `#k=${validateSecret(p.secret)}`;
  // Worst case (140 four-byte code points + all params + secret) is < 2048 by construction; see tests.
  return out;
}

function decodeParam(raw: string, path: string): string {
  if (raw.length === 0 || !/^(?:[A-Za-z0-9\-._~]|%[0-9A-F]{2})+$/.test(raw)) return fail('PARAM', path);
  let dec: string;
  try {
    dec = decodeURIComponent(raw);
  } catch {
    return fail('PARAM', path);
  }
  if (enc(dec) !== raw) return fail('PARAM', path); // non-canonical escaping
  return dec;
}

function parseUint(s: string, path: string): number {
  if (!/^[1-9][0-9]{0,15}$/.test(s)) return fail('PARAM', path);
  const n = Number(s);
  return isPosInt(n) ? n : fail('PARAM', path);
}

/**
 * Strictly parses a `ghostpay:` URI.
 *
 * @remarks Rejects: non-strings, over-length input (before parsing), anything
 * outside printable ASCII, unknown/duplicate/empty parameters, non-canonical
 * percent-encoding, raw `+`, secret-looking parameter names in the query
 * (`SECRET_IN_QUERY`), and any fragment other than `k=<secret>`. Scheme match
 * is case-insensitive; everything else is exact. Errors never echo input.
 * @param uri Untrusted link or QR payload.
 * @throws {LinkError}
 * @security Untrusted input. Secrets are accepted only from the fragment.
 * @testVector uri-reject
 */
export function parsePaymentUri(uri: unknown): PaymentUri {
  if (typeof uri !== 'string') return fail('URI_FORMAT');
  if (uri.length > MAX_URI_LENGTH) return fail('URI_TOO_LARGE');
  if (!/^[\x21-\x7e]+$/.test(uri)) return fail('URI_FORMAT');
  if (uri.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return fail('URI_FORMAT');
  let rest = uri.slice(SCHEME.length);

  let fragment: string | undefined;
  const h = rest.indexOf('#');
  if (h >= 0) {
    fragment = rest.slice(h + 1);
    rest = rest.slice(0, h);
  }
  let query: string | undefined;
  const qi = rest.indexOf('?');
  if (qi >= 0) {
    query = rest.slice(qi + 1);
    rest = rest.slice(0, qi);
  }

  const target = validateMetaAddress(rest);
  const seen = new Map<string, string>();
  if (query !== undefined) {
    if (query.length === 0) return fail('URI_FORMAT');
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) return fail('PARAM');
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (SECRET_KEY.test(key) || key === 'k' || key === 'gpi') return fail('SECRET_IN_QUERY');
      if (!(QUERY_ORDER as readonly string[]).includes(key)) return fail('PARAM');
      if (seen.has(key)) return fail('PARAM', key);
      seen.set(key, value);
    }
  }

  const out: { -readonly [K in keyof PaymentUri]: PaymentUri[K] } = { target };
  const amount = seen.get('amount');
  if (amount !== undefined) {
    const v = decodeParam(amount, 'amount');
    parseAmount(v, 18);
    out.amount = v;
  }
  const asset = seen.get('asset');
  if (asset !== undefined) out.asset = validateAsset(decodeParam(asset, 'asset'));
  const chain = seen.get('chain');
  if (chain !== undefined) out.chainId = parseUint(decodeParam(chain, 'chain'), 'chain');
  const exp = seen.get('exp');
  if (exp !== undefined) out.expiresAt = parseUint(decodeParam(exp, 'exp'), 'exp');
  const memo = seen.get('memo');
  if (memo !== undefined) out.memo = validateText(decodeParam(memo, 'memo'), MAX_MEMO, 'TEXT', 'memo');

  if (fragment !== undefined) {
    if (!fragment.startsWith('k=')) return fail('FRAGMENT');
    out.secret = validateSecret(fragment.slice(2));
  }
  return out;
}

/**
 * Returns the URI with its fragment (secret) removed, safe for logs and analytics-free
 * diagnostics. Does not validate.
 * @security Use before displaying or storing a link anywhere that is not the payer's own device.
 */
export function redactUri(uri: string): string {
  const i = uri.indexOf('#');
  return i < 0 ? uri : `${uri.slice(0, i)}#[redacted]`;
}
