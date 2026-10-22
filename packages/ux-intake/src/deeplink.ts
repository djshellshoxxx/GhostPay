import {
  classifyPayload,
  MAX_PAYLOAD_CHARS,
  sanitizeInput,
  type InvoiceLinkPayload,
  type PaymentUriPayload,
  type Payload,
  type PayloadErrorCode,
} from './payload.js';
import { err, ok, type Result } from './result.js';

/** Schemes this package can ever accept. Others (javascript, data, file, intent, blob…) are always rejected. */
export const SUPPORTED_SCHEMES = ['https', 'ghostpay', 'web+ghostpay'] as const;
/** Referrer policy the app shell must send so a fragment-bearing page never leaks via `Referer`. */
export const REQUIRED_REFERRER_POLICY = 'no-referrer';
/** Query parameter names that commonly carry redirect targets. */
export const REDIRECT_PARAM_NAMES: readonly string[] = [
  'next',
  'redirect',
  'redirect_uri',
  'redirecturi',
  'return',
  'returnto',
  'return_to',
  'continue',
  'dest',
  'destination',
  'callback',
  'goto',
  'target',
  'back',
  'forward',
  'u',
];
/** Max total chars of a Web Share Target query string. */
export const MAX_SHARE_QUERY_CHARS = MAX_PAYLOAD_CHARS + 2048;
const MAX_SHARE_PARAMS = 16;
const MAX_SHARE_CANDIDATES = 32;
const SHARE_PARAMS = ['title', 'text', 'url'] as const;

export type LinkErrorCode =
  | PayloadErrorCode
  | 'open-redirect'
  | 'route-not-allowed'
  | 'bad-share'
  | 'too-many-params'
  | 'nothing-recognized'
  | 'ambiguous-share';

/** Deep-link policy. */
export interface LinkPolicy {
  /** Exact lowercase hostnames for https links. */
  readonly allowedHosts: readonly string[];
  /** Subset of {@link SUPPORTED_SCHEMES}. Default: all of them. */
  readonly allowedSchemes?: readonly string[];
  /** Same-origin routes (no trailing slash except `/`). Default `['/pay','/invoice','/share-target']`. */
  readonly routes?: readonly string[];
  /** Optional asset allowlist forwarded to URI parsing. */
  readonly assetAllowlist?: readonly string[];
}

/** What a deep link or share resolved to. */
export type Incoming =
  | {
      readonly kind: 'invoice-link';
      readonly payload: InvoiceLinkPayload;
      readonly warnings: readonly LinkWarning[];
    }
  | {
      readonly kind: 'payment-uri';
      readonly payload: PaymentUriPayload;
      readonly warnings: readonly LinkWarning[];
    }
  | { readonly kind: 'address'; readonly payload: Payload; readonly warnings: readonly LinkWarning[] }
  | {
      readonly kind: 'navigate';
      readonly path: string;
      readonly returnTo?: string;
      readonly safeDisplay: string;
    };

/** `fragment-in-query`: a bearer secret arrived in a query string, so a server may already have seen it. */
export type LinkWarning = 'fragment-in-query';

const DEFAULT_ROUTES = ['/pay', '/invoice', '/share-target'] as const;

function schemes(policy: LinkPolicy): readonly string[] {
  const s = policy.allowedSchemes ?? SUPPORTED_SCHEMES;
  for (const x of s) {
    if (!(SUPPORTED_SCHEMES as readonly string[]).includes(x)) {
      throw new TypeError(`unsupported scheme in allowlist: ${x}`);
    }
  }
  return s;
}

/**
 * Validates a same-origin return path. Accepts only `/seg/seg` made of `[A-Za-z0-9-._~]` that equals an
 * allowed route or lives under one.
 *
 * @remarks Rejects `//host`, backslashes, `:`/`@`, `%` (no encoded tricks), `?`, `#`, dot segments, and
 * anything outside the route allowlist. Returns the path unchanged on success.
 * @security Open-redirect defence: never navigate to a value that did not pass this function.
 */
export function safeRedirectTarget(
  raw: unknown,
  routes: readonly string[] = DEFAULT_ROUTES,
): Result<string, 'open-redirect'> {
  if (typeof raw !== 'string' || raw.length > 256) return err('open-redirect');
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(raw) || raw.startsWith('//')) return err('open-redirect');
  if (raw.split('/').some((seg) => seg === '.' || seg === '..')) return err('open-redirect');
  const base = raw === '/' ? raw : raw.replace(/\/$/, '');
  const allowed = routes.some((r) => base === r || (r !== '/' && base.startsWith(`${r}/`)));
  return allowed ? ok(raw) : err('open-redirect');
}

/** Cuts everything from the first `#`. Use before logging, copying, or sending any URL. */
export function stripFragment(url: string): string {
  const i = url.indexOf('#');
  return i < 0 ? url : url.slice(0, i);
}

/**
 * Redacts secrets from free text destined for logs or error reports: any `#…` fragment,
 * `gpi=v1.…` (also percent-encoded), and long base64url blobs (40+ chars).
 *
 * @security Logging a raw invoice link leaks a bearer key (ADR-0005). Call this on every string you log.
 */
export function redactForLog(s: string): string {
  return s
    .replace(/#\S*/g, '#[redacted]')
    .replace(/gpi(?:=|%3[dD])v1(?:\.|%2[eE])[A-Za-z0-9_%-]*/g, 'gpi=[redacted]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted-blob]');
}

function toIncoming(p: Payload, warnings: readonly LinkWarning[]): Incoming {
  if (p.kind === 'invoice-link') return { kind: 'invoice-link', payload: p, warnings };
  if (p.kind === 'payment-uri') return { kind: 'payment-uri', payload: p, warnings };
  return { kind: 'address', payload: p, warnings };
}

function trimToken(t: string): string {
  return t.replace(/^[<("'[]+|[>)"'\],.;]+$/g, '');
}

/**
 * Parses a Web Share Target query (`title`, `text`, `url`).
 *
 * @remarks Exactly one distinct recognised payload must be present across `url` and the
 * whitespace-split tokens of `text`/`title`; two different payloads are `ambiguous-share` (no
 * substitution games). Duplicate share params are rejected; unknown params are ignored but capped.
 * If the payload is an invoice link its fragment arrived inside the query string, so a
 * `fragment-in-query` warning is attached: deploy the share target as a service-worker-handled
 * route that never reaches the network, then `history.replaceState` to the clean path.
 * @param search Query string with or without leading `?`.
 * @param policy Link policy.
 * @security Fragments are not sent to servers by browsers, but a shared URL embedded in a query value is.
 */
export function parseShareTarget(search: unknown, policy: LinkPolicy): Result<Incoming, LinkErrorCode> {
  if (typeof search !== 'string') return err('not-string');
  if (search.length > MAX_SHARE_QUERY_CHARS) return err('too-large');
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (q === '') return err('empty');
  const params = new URLSearchParams(q);
  const got = new Map<string, string>();
  let count = 0;
  for (const [k, v] of params) {
    if (++count > MAX_SHARE_PARAMS) return err('too-many-params');
    if (!(SHARE_PARAMS as readonly string[]).includes(k)) continue;
    if (got.has(k)) return err('bad-share');
    got.set(k, v);
  }
  const candidates: string[] = [];
  const url = got.get('url');
  if (url !== undefined) candidates.push(url);
  for (const key of ['text', 'title'] as const) {
    for (const tok of (got.get(key) ?? '').split(/\s+/)) {
      const t = trimToken(tok);
      if (t !== '') candidates.push(t);
    }
  }
  if (candidates.length > MAX_SHARE_CANDIDATES) return err('too-many-params');
  const found = new Map<string, Payload>();
  let firstErr: PayloadErrorCode | null = null;
  for (const c of candidates) {
    const r = classifyPayload(c, { ...policy, maxChars: MAX_PAYLOAD_CHARS });
    if (r.ok)
      found.set(r.value.safeDisplay + (r.value.kind === 'invoice-link' ? r.value.fragment : ''), r.value);
    else firstErr ??= r.code;
  }
  if (found.size > 1) return err('ambiguous-share');
  const only = [...found.values()][0];
  if (only === undefined)
    return err(url !== undefined && firstErr !== null ? firstErr : 'nothing-recognized');
  return ok(toIncoming(only, only.kind === 'invoice-link' ? ['fragment-in-query'] : []));
}

/**
 * Parses an incoming deep link (https app link, `ghostpay:` or `web+ghostpay:` URI).
 *
 * @remarks Order: hygiene (ASCII only, caps) → scheme allowlist → exact host match → no credentials/port
 * → route allowlist → open-redirect parameter check. Invoice links keep their fragment out of
 * `safeDisplay`. Plain navigation links return `navigate` with a validated path and optional safe `returnTo`.
 * @param raw Untrusted URL.
 * @param policy Link policy.
 * @security Any redirect-like parameter that is not a same-origin allowlisted path rejects the whole link.
 */
export function parseDeepLink(raw: unknown, policy: LinkPolicy): Result<Incoming, LinkErrorCode> {
  const allowed = schemes(policy);
  const clean = sanitizeInput(raw, MAX_SHARE_QUERY_CHARS);
  if (!clean.ok) return clean;
  const s = clean.value;
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(s);
  if (m === null) return err('scheme-not-allowed');
  const scheme = (m[1] as string).toLowerCase();
  if (!allowed.includes(scheme)) return err('scheme-not-allowed');
  if (scheme !== 'https') {
    const norm = scheme === 'web+ghostpay' ? `ghostpay:${s.slice(m[0].length)}` : s;
    const r = classifyPayload(norm, { ...policy, maxChars: MAX_PAYLOAD_CHARS });
    return r.ok ? ok(toIncoming(r.value, [])) : r;
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return err('malformed-url');
  }
  if (url.username !== '' || url.password !== '') return err('credentials-not-allowed');
  if (url.port !== '') return err('port-not-allowed');
  if (!policy.allowedHosts.includes(url.hostname)) return err('host-not-allowed');
  const routes = policy.routes ?? DEFAULT_ROUTES;
  const path = url.pathname;
  if (!routes.includes(path)) return err('route-not-allowed');
  if (url.hash.startsWith('#gpi=')) {
    const r = classifyPayload(`${url.origin}${path}${url.hash}`, { ...policy, maxChars: MAX_PAYLOAD_CHARS });
    if (!r.ok) return r;
    return ok(toIncoming(r.value, []));
  }
  if (url.hash !== '') return err('bad-fragment');
  if (path === '/share-target') return parseShareTarget(url.search, policy);
  let returnTo: string | undefined;
  for (const [k, v] of url.searchParams) {
    if (!REDIRECT_PARAM_NAMES.includes(k.toLowerCase())) continue;
    const t = safeRedirectTarget(v, routes);
    if (!t.ok) return t;
    returnTo = t.value;
  }
  return ok({
    kind: 'navigate',
    path,
    ...(returnTo === undefined ? {} : { returnTo }),
    safeDisplay: `https://${url.hostname}${path}`,
  });
}
