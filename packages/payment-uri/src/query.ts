import { fail } from './errors.js';

/** Hard cap for any URI accepted by this package. */
export const MAX_URI_LENGTH = 2048;

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const KEY = /^[A-Za-z0-9._-]{1,32}$/;
const RAW_OK = /^[\x21-\x7e]*$/;
const dec = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const enc = new TextEncoder();

/** Percent-encodes every byte except RFC 3986 unreserved characters (so `+ ! ' ( ) *` are always encoded). */
export function pctEncode(s: string): string {
  let out = '';
  for (const b of enc.encode(s)) {
    const c = String.fromCharCode(b);
    out += UNRESERVED.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** Strict percent-decoder: only `%XX` escapes, valid UTF-8, `+` is not allowed raw, result must be non-empty. */
export function pctDecode(s: string): string {
  if (!RAW_OK.test(s) || s.includes('+')) return fail('INVALID_ENCODING');
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '%') {
      const hex = s.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return fail('INVALID_ENCODING');
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  let out: string;
  try {
    out = dec.decode(Uint8Array.from(bytes));
  } catch {
    return fail('INVALID_ENCODING');
  }
  return out;
}

/** One decoded query parameter. */
export interface QueryParam {
  /** Key as written (case preserved). */
  readonly key: string;
  readonly value: string;
}

/** Options for {@link parseQuery}. */
export interface QueryOptions {
  /** Fold keys to lowercase (BIP-21/321, Solana Pay) or keep them case-sensitive (EIP-681 ABI types). */
  readonly foldKeys: boolean;
  /** Keys (already folded if `foldKeys`) that may appear more than once. */
  readonly repeatable?: ReadonlySet<string>;
  readonly maxParams?: number;
}

/**
 * Strictly splits and decodes a query string (no leading `?`).
 * Rejects empty query, empty keys/values, missing `=`, stray `&`, bad keys, duplicates (unless repeatable).
 * With `foldKeys` the returned keys are lowercased.
 */
export function parseQuery(q: string, opts: QueryOptions): QueryParam[] {
  const max = opts.maxParams ?? 16;
  const parts = q.split('&');
  if (parts.length > max) return fail('INVALID_QUERY');
  const seen = new Set<string>();
  const out: QueryParam[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0 || eq === part.length - 1) return fail('INVALID_QUERY');
    const rawKey = part.slice(0, eq);
    if (!KEY.test(rawKey)) return fail('INVALID_QUERY');
    const key = opts.foldKeys ? rawKey.toLowerCase() : rawKey;
    const rawVal = part.slice(eq + 1);
    if (rawVal.includes('=')) return fail('INVALID_QUERY');
    const value = pctDecode(rawVal);
    if (value === '') return fail('INVALID_QUERY');
    if (seen.has(key) && !opts.repeatable?.has(key)) return fail('DUPLICATE_PARAM');
    seen.add(key);
    out.push({ key, value });
  }
  return out;
}

/** Result of {@link splitUri}. */
export interface SplitUri {
  readonly scheme: string;
  readonly rest: string;
  readonly query: string | undefined;
}

/** Splits `scheme:rest[?query]`; rejects non-ASCII/whitespace/control characters, fragments, over-length, empty query. */
export function splitUri(uri: unknown): SplitUri {
  if (typeof uri !== 'string') return fail('INVALID_INPUT');
  if (uri.length > MAX_URI_LENGTH) return fail('TOO_LONG');
  if (!RAW_OK.test(uri) || uri.includes('#')) return fail('INVALID_ENCODING');
  const c = uri.indexOf(':');
  if (c <= 0) return fail('INVALID_SCHEME');
  const scheme = uri.slice(0, c).toLowerCase();
  if (!/^[a-z][a-z0-9+.-]{0,31}$/.test(scheme)) return fail('INVALID_SCHEME');
  const after = uri.slice(c + 1);
  const q = after.indexOf('?');
  if (q === -1) return { scheme, rest: after, query: undefined };
  const query = after.slice(q + 1);
  if (query === '') return fail('INVALID_QUERY');
  return { scheme, rest: after.slice(0, q), query };
}

/** Builds `key=value` pairs, percent-encoded, joined by `&`. */
export function buildQuery(pairs: readonly (readonly [string, string])[]): string {
  return pairs.map(([k, v]) => `${k}=${pctEncode(v)}`).join('&');
}
