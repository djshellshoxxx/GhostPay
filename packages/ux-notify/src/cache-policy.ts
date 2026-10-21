import { hasSensitiveQuery } from './urlsafety.js';

/**
 * Service-worker cache policy planner. Pure data in, decisions out: nothing
 * here performs or schedules network access, so a SW shell can call it and act.
 *
 * @security Default-deny. Only same-origin, secret-free GETs matching the
 * static allowlist are ever cacheable; API paths, auth-bearing requests,
 * secret-looking queries and any URL with a fragment are never cached.
 */
export interface CachePolicyConfig {
  /** Own origin, e.g. "https://app.example". */
  origin: string;
  /** Path prefixes of hashed build assets, e.g. ["/assets/"]. */
  staticPrefixes: string[];
  /** Exact extra paths (shell, manifest, icons, offline page). */
  staticExact: string[];
  staticExtensions: string[];
  /** Require a content hash in filenames under staticPrefixes (immutable assets). */
  requireContentHash: boolean;
  apiPrefixes: string[];
  /** Precached page shown when a navigation fails. */
  offlineRoute: string;
}

export const DEFAULT_CACHE_CONFIG: Omit<CachePolicyConfig, 'origin'> = {
  staticPrefixes: ['/assets/'],
  staticExact: ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/favicon.ico'],
  staticExtensions: ['js', 'css', 'woff2', 'png', 'svg', 'webp', 'ico', 'webmanifest', 'html'],
  requireContentHash: true,
  apiPrefixes: ['/api', '/rpc', '/relay', '/relayer', '/auth', '/graphql', '/v1', '/v2', '/ws', '/socket'],
  offlineRoute: '/offline.html',
};

export interface CacheRequest {
  url: string;
  method: string;
  mode?: 'navigate' | 'same-origin' | 'cors' | 'no-cors';
  hasAuthorization?: boolean;
  hasCookies?: boolean;
}

export type CacheReason =
  | 'static_asset' | 'static_exact' | 'navigation' | 'invalid_url' | 'non_get' | 'cross_origin'
  | 'insecure_scheme' | 'api_path' | 'sensitive_query' | 'has_fragment' | 'authenticated'
  | 'not_allowlisted' | 'unhashed_asset';

export interface CacheDecision {
  strategy: 'cache-first' | 'network-only' | 'navigation';
  cacheable: boolean;
  /** Show the offline page if the network fails. */
  offlineFallback: boolean;
  reason: CacheReason;
}

const deny = (reason: CacheReason, offlineFallback = false): CacheDecision => ({ strategy: 'network-only', cacheable: false, offlineFallback, reason });
const segPrefix = (path: string, prefix: string): boolean => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');

/** Decide how the SW may treat a request. */
export function classifyRequest(cfg: CachePolicyConfig, req: CacheRequest): CacheDecision {
  let u: URL;
  try {
    u = new URL(req.url);
  } catch {
    return deny('invalid_url');
  }
  if (u.username !== '' || u.password !== '') return deny('invalid_url');
  if (req.method.toUpperCase() !== 'GET') return deny('non_get');
  const secure = u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  if (!secure) return deny('insecure_scheme');
  if (u.origin !== cfg.origin) return deny('cross_origin');
  const nav = req.mode === 'navigate';
  const path = u.pathname.toLowerCase();
  if (/%2f|%5c/.test(path)) return deny('invalid_url', nav);
  if (cfg.apiPrefixes.some((p) => segPrefix(path, p.toLowerCase()))) return deny('api_path', nav);
  if (u.hash !== '') return deny('has_fragment', nav);
  if (hasSensitiveQuery(u.search)) return deny('sensitive_query', nav);
  if (req.hasAuthorization === true || req.hasCookies === true) return deny('authenticated', nav);
  if (nav) return { strategy: 'navigation', cacheable: false, offlineFallback: true, reason: 'navigation' };
  const ext = path.slice(path.lastIndexOf('.') + 1);
  if (u.search === '' && cfg.staticExact.includes(u.pathname) && cfg.staticExtensions.includes(ext)) {
    return { strategy: 'cache-first', cacheable: true, offlineFallback: false, reason: 'static_exact' };
  }
  if (cfg.staticPrefixes.some((p) => segPrefix(path, p.toLowerCase())) && cfg.staticExtensions.includes(ext)) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    if (cfg.requireContentHash && !/[-.][a-z0-9_]{8,}\.[a-z0-9]+$/.test(file)) return deny('unhashed_asset');
    return { strategy: 'cache-first', cacheable: true, offlineFallback: false, reason: 'static_asset' };
  }
  return deny('not_allowlisted');
}

export interface ResponseInfo {
  status: number;
  /** Fetch response type; opaque/cors responses are not stored. */
  type: 'basic' | 'cors' | 'opaque' | 'opaqueredirect' | 'error' | 'default';
  cacheControl?: string;
  vary?: string;
  contentType?: string;
  hasSetCookie?: boolean;
}

const STORABLE_TYPES = /^(text\/(css|javascript|html)|application\/(javascript|manifest\+json)|font\/woff2|image\/(png|svg\+xml|webp|x-icon|vnd\.microsoft\.icon))(;|$)/i;

/** Whether a fetched response may be written to the cache for an already-cacheable request. */
export function shouldStoreResponse(decision: CacheDecision, res: ResponseInfo): boolean {
  if (!decision.cacheable || res.status !== 200 || res.type !== 'basic' || res.hasSetCookie === true) return false;
  if (/(^|,)\s*(no-store|private)\b/i.test(res.cacheControl ?? '')) return false;
  if ((res.vary ?? '').includes('*')) return false;
  return STORABLE_TYPES.test(res.contentType ?? '');
}

export type FallbackAction = 'network' | 'cache' | 'offline-page' | 'error';

export interface FallbackInput {
  decision: CacheDecision;
  networkOk: boolean;
  cachedAvailable: boolean;
  offlinePageCached: boolean;
}

/** Offline-fallback routing given the outcome facts. */
export function planFallback(i: FallbackInput): FallbackAction {
  if (i.decision.strategy === 'cache-first' && i.cachedAvailable) return 'cache';
  if (i.networkOk) return 'network';
  if (i.decision.offlineFallback && i.offlinePageCached) return 'offline-page';
  return 'error';
}

/** Validate that every precache URL is itself cacheable under the policy. Returns offenders. */
export function auditPrecache(cfg: CachePolicyConfig, paths: string[]): string[] {
  return paths.filter((p) => !classifyRequest(cfg, { url: cfg.origin + p, method: 'GET', mode: 'no-cors' }).cacheable);
}

/** Cache bucket name for a version. */
export function cacheName(version: string): string {
  return `app-static-${version}`;
}

/** Existing cache names this app owns but which are not the current one (safe to delete). */
export function obsoleteCaches(existing: string[], currentVersion: string): string[] {
  const cur = cacheName(currentVersion);
  return existing.filter((n) => n.startsWith('app-static-') && n !== cur);
}

/* ---------------------------------------------------------------- updates */

export interface UpdateInput {
  runningVersion: string;
  /** Version of the installed-but-waiting worker, if any. */
  waitingVersion?: string;
  /** Oldest version still compatible with stored data / relayer protocol. */
  minSupportedVersion: string;
  openClients: number;
  /** User is mid-flow (signing, composing, unsaved form). */
  inSensitiveFlow: boolean;
}

export type UpdateAction = 'none' | 'prompt' | 'apply-on-idle' | 'defer' | 'apply-now' | 'invalid';

export interface UpdateDecision {
  action: UpdateAction;
  reason: string;
}

/** Strict semver core parse (no prerelease/build). */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1, 0, 1. Throws never; caller must have parsed. */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Decide how to roll a waiting worker out.
 *
 * @security Never interrupt a signing/compose flow, even if the running
 * version is unsupported (the user is told to finish first). Multiple tabs on
 * mixed versions cause skew, so they are prompted instead of auto-activated.
 */
export function decideUpdate(i: UpdateInput): UpdateDecision {
  const run = parseVersion(i.runningVersion), min = parseVersion(i.minSupportedVersion);
  if (!run || !min || !Number.isSafeInteger(i.openClients) || i.openClients < 0) return { action: 'invalid', reason: 'bad_input' };
  if (i.waitingVersion === undefined) return { action: 'none', reason: 'no_waiting_worker' };
  const wait = parseVersion(i.waitingVersion);
  if (!wait) return { action: 'invalid', reason: 'bad_waiting_version' };
  if (compareVersions(wait, run) <= 0) return { action: 'none', reason: 'waiting_not_newer' };
  if (compareVersions(wait, min) < 0) return { action: 'invalid', reason: 'waiting_below_min_supported' };
  const unsupported = compareVersions(run, min) < 0;
  if (i.inSensitiveFlow) return { action: 'defer', reason: unsupported ? 'unsupported_but_in_flow' : 'in_flow' };
  if (unsupported) return { action: 'apply-now', reason: 'running_unsupported' };
  if (wait[0] !== run[0]) return { action: 'prompt', reason: 'major_change' };
  if (i.openClients > 1) return { action: 'prompt', reason: 'multiple_tabs' };
  return { action: 'apply-on-idle', reason: 'compatible_single_client' };
}

/** Version skew between a page and its worker/data: same major required. */
export function isSkewed(pageVersion: string, workerVersion: string): boolean {
  const a = parseVersion(pageVersion), b = parseVersion(workerVersion);
  return !a || !b || a[0] !== b[0];
}
