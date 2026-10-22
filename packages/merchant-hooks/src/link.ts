import { FRAGMENT_PREFIX } from '@ghostpay/invoice-schema';
import { HooksError } from './errors.js';

const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export interface LinkOptions {
  /** Permit `http://localhost` / `127.0.0.1` (development only). */
  readonly allowInsecureLocalhost?: boolean;
}

/**
 * Validate a GhostPay payment link: https, no userinfo, no query, fragment `#gpi=v1.<base64url>`.
 *
 * @param link Candidate URL string.
 * @returns The URL base (origin + path) and the fragment.
 * @throws {HooksError} `bad-link` on any violation.
 * @security The fragment is a bearer secret (ADR-0005). Query strings are refused because they reach servers and logs.
 */
export function assertPaymentLink(link: string, options: LinkOptions = {}): { base: string; fragment: string } {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    throw new HooksError('bad-link');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  const schemeOk = u.protocol === 'https:' || (options.allowInsecureLocalhost === true && local && u.protocol === 'http:');
  if (!schemeOk || u.username !== '' || u.password !== '' || u.search !== '' || link.includes('?'))
    throw new HooksError('bad-link');
  if (!u.hash.startsWith(FRAGMENT_PREFIX) || !B64URL_RE.test(u.hash.slice(FRAGMENT_PREFIX.length)))
    throw new HooksError('bad-link');
  return { base: u.origin + u.pathname, fragment: u.hash };
}

/**
 * Validate a base URL for building links.
 *
 * @throws {HooksError} `bad-base` if not https (or allowed localhost), or has userinfo/query/fragment.
 */
export function assertBaseUrl(baseUrl: string, options: LinkOptions = {}): URL {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new HooksError('bad-base');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  const schemeOk = u.protocol === 'https:' || (options.allowInsecureLocalhost === true && local && u.protocol === 'http:');
  if (!schemeOk || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '' || baseUrl.includes('#') || baseUrl.includes('?'))
    throw new HooksError('bad-base');
  return u;
}
