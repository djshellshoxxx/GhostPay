import { CHAINS, ChainAdapterError } from '@ghostpay/chain-adapters';
import { isValidV3OnionHost, WEB_NETWORK_SELECTION_KEY } from '@ghostpay/net-transport/browser';
import { subscribeAppLock } from './appLock';
import { UserFacingError } from './errors';
import { readNetworkSelection } from './networkSelection';
import type { ScanPrivacySettings } from './scanPrivacy';
import type { ScanLaneSettings } from './scanSpam';
import { captureSessionVersionGuard, subscribeSession } from './session';
import { isRpcSessionOnly, SETTINGS_KEY } from './settings';

/** Actions are granted at their existing user interaction, never by merely configuring an endpoint. */
export type NetworkAction = 'settings-check' | 'scan' | 'payment-preflight' | 'payment-status'
  | 'sweep-balance' | 'sweep-quote' | 'sweep-prepare' | 'sweep-submit' | 'sweep-status'
  | 'registry-read' | 'registry-publish' | 'policy' | 'btc-scan' | 'btc-sweep'
  | 'solana-scan' | 'solana-sweep' | 'tron-scan' | 'tron-sweep' | 'merchant-profile' | 'release-hash';
export type NetworkCategory = 'rpc' | 'indexer' | 'relayer' | 'resource';
export type BrowserNetworkRef = { readonly kind: 'evm'; readonly chainId: number }
  | { readonly kind: 'btc' | 'solana' | 'tron'; readonly network: string };
export interface NetworkAuthorizationRequest {
  readonly action: NetworkAction;
  readonly category: NetworkCategory;
  readonly endpoint: string;
  readonly network?: BrowserNetworkRef;
  readonly signal?: AbortSignal;
  readonly match?: 'exact' | 'prefix';
  /** Non-secret identity of the reviewed action; never persisted or transmitted. */
  readonly scope?: string;
  readonly balance?: { readonly owner: string; readonly token: string };
  /** An explicit, visible one-action disclosure exception. It cannot override own-node mode. */
  readonly allowDirectOnce?: true;
}
export interface NetworkAuthorization {
  readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
  readonly cancel: () => void;
  readonly dispose: () => void;
}
export interface NetworkAuthority {
  readonly authorize: (request: NetworkAuthorizationRequest) => NetworkAuthorization;
  readonly invalidate: () => void;
  readonly getRevision: () => number;
  readonly subscribe: (listener: () => void) => () => void;
  readonly dispose: () => void;
  /** Verify opaque capability ownership and EVM endpoint binding before constructing an RPC client. */
  readonly assertRpcAuthorization: (authorization: NetworkAuthorization | undefined, chainId: number, url: string, body?: string) => void;
}
interface StorageReader { getItem(key: string): string | null }
interface Policy {
  readonly ownNode: boolean;
  readonly requireProxy: boolean;
  readonly transport: 'direct' | 'local-proxy' | 'tor-browser';
}
interface Snapshot {
  readonly raw: readonly (string | null)[];
  readonly policy: Policy;
  readonly settings: Record<string, unknown>;
  readonly scan: Record<string, unknown>;
}
export interface NetworkAuthorityOptions {
  readonly storage?: () => StorageReader | undefined;
  readonly fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  readonly events?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly origin?: () => string;
  readonly nowMs?: () => number;
  readonly requestTimeoutMs?: number;
  readonly contextIdleMs?: number;
  readonly maxResponseBytes?: number;
}

const SCAN_PRIVACY_STORAGE_KEY = 'ghostpay.scanPrivacy.v1';
const SCAN_LANES_STORAGE_KEY = 'ghostpay.scanLanes.v1';
const POLICY_KEYS = [SETTINGS_KEY, SCAN_PRIVACY_STORAGE_KEY, WEB_NETWORK_SELECTION_KEY, SCAN_LANES_STORAGE_KEY] as const;
// Exact persisted schemas: absent known fields remain compatible with older records; unknown fields cannot be
// mistaken for a missing privacy control. Type-only schema links keep these lists exhaustive without runtime imports.
const SCAN_PRIVACY_FIELDS: Readonly<Record<keyof ScanPrivacySettings, true>> = {
  transport: true, endpoints: true, requireProxy: true, windowBlocks: true, jitterMinMs: true, jitterMaxMs: true,
  source: true, indexerUrls: true, openLaneBudget: true, padBlocks: true, bulkEvidence: true,
};
const SCAN_LANE_FIELDS: Readonly<Record<keyof ScanLaneSettings, true>> = { floodPerBlock: true, spamScoring: true, privacySetTransfers: true };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const EXCEPTIONS = new Set<NetworkAction>(['sweep-balance', 'sweep-quote', 'sweep-prepare', 'sweep-submit', 'sweep-status', 'merchant-profile']);
const EVM_READ_METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getBalance',
  'eth_getBlockByNumber', 'eth_getCode', 'eth_getLogs', 'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'net_version']);
const ACTIONS: Readonly<Record<NetworkAction, readonly NetworkCategory[]>> = {
  'settings-check': ['rpc'], scan: ['rpc', 'indexer'], 'payment-preflight': ['rpc'], 'payment-status': ['rpc'],
  'sweep-balance': ['rpc'], 'sweep-quote': ['rpc', 'relayer'], 'sweep-prepare': ['rpc'], 'sweep-submit': ['rpc', 'relayer'], 'sweep-status': ['rpc'],
  'registry-read': ['rpc'], 'registry-publish': ['rpc'], policy: ['rpc'], 'btc-scan': ['rpc', 'indexer'], 'btc-sweep': ['rpc', 'indexer'],
  'solana-scan': ['rpc'], 'solana-sweep': ['rpc'], 'tron-scan': ['rpc'], 'tron-sweep': ['rpc'],
  'merchant-profile': ['resource'], 'release-hash': ['resource'],
};

/** Fixed local failures never retain a transport exception, endpoint, abort reason or response data. */
export function networkAuthorizationError(): UserFacingError {
  return new UserFacingError({ key: 'error.network.authorizationRefused' });
}
function refuse(): never { throw networkAuthorizationError(); }
function storage(): StorageReader | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
function object(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return refuse();
  return raw as Record<string, unknown>;
}
function decode(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try { return object(JSON.parse(text)); } catch { return refuse(); }
}
function stringMap(raw: unknown): void {
  if (raw !== undefined && Object.values(object(raw)).some((value) => typeof value !== 'string')) refuse();
}
function storedInteger(data: Record<string, unknown>, key: string, min: number, max: number): void {
  const value = data[key];
  if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)) refuse();
}
/** Mirror the saved scan schema's validity rules without silently dropping a malformed chosen endpoint. */
function scanEndpointMap(raw: unknown, transport: Policy['transport'], indexer = false): void {
  if (raw === undefined) return;
  for (const [chainId, value] of Object.entries(object(raw))) {
    if (!/^[1-9][0-9]{0,15}$/.test(chainId) || typeof value !== 'string') return refuse();
    const url = endpoint(value);
    if ((transport === 'local-proxy' && !LOOPBACK.has(url.hostname)) ||
        (!indexer && transport !== 'local-proxy' && url.protocol !== 'https:') || (indexer && url.search !== '')) refuse();
  }
}
function snapshot(read: () => StorageReader | undefined, observed: Set<number>): Snapshot {
  let raw: (string | null)[];
  try {
    const store = read();
    if (store === undefined) return refuse();
    raw = POLICY_KEYS.map((key) => store.getItem(key));
    for (const [index, text] of raw.entries()) {
      if (text === null && observed.has(index)) return refuse();
      if (text !== null) observed.add(index);
    }
  } catch { return refuse(); }
  const settings = decode(raw[0] ?? null);
  stringMap(settings['rpcUrls']);
  stringMap(settings['rpcUrlsSecondary']);
  stringMap(settings['secondaryRpcUrls']);
  if (settings['relayerUrl'] !== undefined && typeof settings['relayerUrl'] !== 'string') refuse();
  const privacy = decode(raw[1] ?? null);
  const lanes = decode(raw[3] ?? null);
  if (Object.keys(privacy).some((key) => !Object.hasOwn(SCAN_PRIVACY_FIELDS, key)) ||
      Object.keys(lanes).some((key) => !Object.hasOwn(SCAN_LANE_FIELDS, key))) refuse();
  storedInteger(lanes, 'floodPerBlock', 1, 10_000);
  for (const key of ['spamScoring', 'privacySetTransfers']) if (lanes[key] !== undefined && typeof lanes[key] !== 'boolean') refuse();
  // These are the existing Settings/scanPrivacy bounds. Missing legacy fields retain defaults; present corrupt
  // fields must never become zero padding, per-match evidence, immediate timing or a different request shape.
  for (const [key, min, max] of [
    ['windowBlocks', 0, 100_000], ['jitterMinMs', 0, 10_000], ['jitterMaxMs', 0, 10_000],
    ['openLaneBudget', 1, 100_000], ['padBlocks', 0, 100_000], ['bulkEvidence', 0, 500],
  ] as const) storedInteger(privacy, key, min, max);
  const jitterMin = privacy['jitterMinMs']; const jitterMax = privacy['jitterMaxMs'];
  if ((jitterMin === undefined) !== (jitterMax === undefined) || (typeof jitterMin === 'number' && typeof jitterMax === 'number' && jitterMin > jitterMax)) refuse();
  const transport = privacy['transport'] === undefined ? 'direct' : privacy['transport'];
  if (transport !== 'direct' && transport !== 'local-proxy' && transport !== 'tor-browser') refuse();
  const requireProxy = privacy['requireProxy'] === undefined ? false : privacy['requireProxy'];
  if (typeof requireProxy !== 'boolean') refuse();
  if (privacy['source'] !== undefined && privacy['source'] !== 'rpc' && privacy['source'] !== 'indexer') refuse();
  scanEndpointMap(privacy['endpoints'], transport);
  scanEndpointMap(privacy['indexerUrls'], transport, true);
  // Use the same strict stored-profile boundary as Settings and standalone RPC creation. A present truncated
  // record cannot authorize a weaker default; only a genuinely absent preference selects the install default.
  const selection = readNetworkSelection({ getItem: () => raw[2] ?? null });
  if (selection.status !== 'ready') return refuse();
  const { rpcMode } = selection.selection;
  return { raw, policy: { ownNode: rpcMode === 'own-node', requireProxy, transport }, settings, scan: privacy };
}
function endpoint(raw: string, allowPlainHttp = false): URL {
  let url: URL;
  try { url = new URL(raw); } catch { return refuse(); }
  if (url.username !== '' || url.password !== '' || url.hash !== '' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && (allowPlainHttp || LOOPBACK.has(url.hostname))))) refuse();
  return url;
}
function permittedTarget(base: URL, target: URL, match: 'exact' | 'prefix'): boolean {
  if (match === 'exact') return base.href === target.href;
  const prefix = base.pathname.replace(/\/+$/, '');
  return base.origin === target.origin && (target.pathname === prefix || target.pathname.startsWith(prefix + '/'));
}
function networkAllowed(network: BrowserNetworkRef | undefined): boolean {
  if (network === undefined) return false;
  if (network.kind === 'evm') return network.chainId === 31337 || CHAINS.some((chain) => chain.chainId === network.chainId && chain.enabled);
  const allowed: Readonly<Record<'btc' | 'solana' | 'tron', readonly string[]>> = {
    btc: ['testnet', 'testnet4', 'signet', 'regtest'], solana: ['devnet', 'testnet', 'localnet'], tron: ['nile', 'shasta', 'local'],
  };
  return Object.hasOwn(allowed, network.kind) && allowed[network.kind].includes(network.network);
}
function checkPolicy(request: NetworkAuthorizationRequest, url: URL, policy: Policy): void {
  if (policy.ownNode && (request.category === 'rpc' || request.category === 'indexer') &&
      !LOOPBACK.has(url.hostname) && !isValidV3OnionHost(url.hostname)) refuse();
  if (request.allowDirectOnce === true && !EXCEPTIONS.has(request.action)) refuse();
  if (!policy.requireProxy || request.allowDirectOnce === true) return;
  if (policy.transport === 'direct' || (policy.transport === 'local-proxy' && !LOOPBACK.has(url.hostname))) refuse();
}
function sameEndpoint(value: unknown, selected: URL): boolean {
  try { return typeof value === 'string' && endpoint(value).href === selected.href; } catch { return false; }
}
function selectedValue(values: Record<string, unknown>, key: string, chainId: string): unknown {
  const map = values[key];
  return typeof map === 'object' && map !== null && !Array.isArray(map) ? (map as Record<string, unknown>)[chainId] : undefined;
}
/** A new grant from a stale UI closure cannot revive an endpoint replaced before its storage event arrived. */
function checkSelection(request: NetworkAuthorizationRequest, selected: URL, current: Snapshot): void {
  if (request.category === 'relayer') {
    const base = current.settings['relayerUrl'];
    if (typeof base !== 'string') return refuse();
    const route = request.action === 'sweep-quote' ? '/v1/quote' : '/v1/sweep';
    if (!sameEndpoint(request.match === 'prefix' ? base : base.replace(/\/+$/, '') + route, selected)) refuse();
    return;
  }
  if (request.network?.kind !== 'evm') return;
  const chainId = String(request.network.chainId);
  if (request.category === 'indexer') {
    if (!sameEndpoint(selectedValue(current.scan, 'indexerUrls', chainId), selected)) refuse();
    return;
  }
  if (request.category !== 'rpc' || request.action === 'settings-check') return;
  const primary = selectedValue(current.settings, 'rpcUrls', chainId);
  const permitted = [primary];
  if (primary === undefined && isRpcSessionOnly('primary', chainId, selected.href)) permitted.push(selected.href);
  if (request.action === 'scan') {
    const secondary = selectedValue(current.settings, current.settings['rpcUrlsSecondary'] === undefined ? 'secondaryRpcUrls' : 'rpcUrlsSecondary', chainId);
    permitted.push(secondary, selectedValue(current.scan, 'endpoints', chainId));
    if (secondary === undefined && isRpcSessionOnly('secondary', chainId, selected.href)) permitted.push(selected.href);
  }
  if (!permitted.some((value) => sameEndpoint(value, selected))) refuse();
}
function checkEvmMethod(request: NetworkAuthorizationRequest, body: string): void {
  let message: Record<string, unknown>;
  try { message = object(JSON.parse(body)); } catch { return refuse(); }
  const rpcMethod = message['method'];
  if (typeof rpcMethod !== 'string') refuse();
  if (!EVM_READ_METHODS.has(rpcMethod) && !(rpcMethod === 'eth_sendRawTransaction' && request.action === 'sweep-submit')) refuse();
  if (request.action === 'settings-check' && rpcMethod !== 'eth_chainId') refuse();
  if (request.action === 'sweep-balance') {
    const balance = request.balance;
    if (balance === undefined || !/^0x[0-9a-fA-F]{40}$/.test(balance.owner) ||
        (balance.token !== 'native' && !/^0x[0-9a-fA-F]{40}$/.test(balance.token))) refuse();
    const params = message['params'];
    if (!Array.isArray(params)) refuse();
    if (rpcMethod === 'eth_getBalance') {
      if (balance.token !== 'native' || typeof params[0] !== 'string' || params[0].toLowerCase() !== balance.owner.toLowerCase()) refuse();
    } else if (rpcMethod === 'eth_call') {
      const call = object(params[0]);
      if (balance.token === 'native' || typeof call['to'] !== 'string' || call['to'].toLowerCase() !== balance.token.toLowerCase() ||
          call['data'] !== '0x70a08231' + balance.owner.slice(2).toLowerCase().padStart(64, '0')) refuse();
    } else if (rpcMethod !== 'eth_chainId') refuse();
  }
}
function cancelQuietly(value: { cancel(): Promise<void> } | null | undefined): void {
  try { if (value !== null && value !== undefined) void value.cancel().catch(() => undefined); } catch { /* Cleanup is never awaited. */ }
}
function positive(value: number): boolean { return Number.isInteger(value) && value > 0 && value <= 2_147_483_647; }

/**
 * In-memory, per-action grants. Storage contains preferences only: no grant or wallet identity is synchronized.
 * Storage/session/lock changes revoke existing grants and their streams; new actions need fresh grants.
 * Browser-required Origin/DNS/IP metadata and independent wallet-extension traffic remain outside this boundary.
 */
export function createNetworkAuthority(options: NetworkAuthorityOptions = {}): NetworkAuthority {
  const readStorage = options.storage ?? storage;
  const fetcher = options.fetchFn ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  const events = options.events ?? (typeof window === 'undefined' ? undefined : window);
  const origin = options.origin ?? (() => globalThis.location.origin);
  const now = options.nowMs ?? (() => Date.now());
  const timeoutMs = options.requestTimeoutMs ?? 30_000;
  const idleMs = options.contextIdleMs ?? 600_000;
  const maxBytes = options.maxResponseBytes ?? 16 * 1024 * 1024;
  if (!positive(timeoutMs) || !positive(idleMs) || !positive(maxBytes)) refuse();
  // Deleting a previously observed policy cannot turn the next action into a fresh direct-mode installation.
  // Only an explicit valid saved replacement repairs it. No wallet identity or authorization is persisted.
  const observedRecords = new Set<number>();
  const readSnapshot = (): Snapshot => snapshot(readStorage, observedRecords);
  try { readSnapshot(); } catch { /* Offline use and same-origin release hashing remain available. */ }
  const active = new Set<() => void>();
  const listeners = new Set<() => void>();
  const grants = new WeakMap<NetworkAuthorization, { request: NetworkAuthorizationRequest; endpoint: URL }>();
  let revision = 0;
  let disposed = false;
  const invalidate = (): void => {
    revision++;
    for (const cancel of [...active]) cancel();
    for (const listener of [...listeners]) { try { listener(); } catch { /* Every subscriber gets revocation. */ } }
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || POLICY_KEYS.some((key) => event.key === key)) invalidate();
  };
  events?.addEventListener('storage', onStorage);
  const unsubscribeSession = subscribeSession(invalidate);
  const unsubscribeLock = subscribeAppLock(invalidate);

  const authorize = (input: NetworkAuthorizationRequest): NetworkAuthorization => {
    if (disposed || !Object.hasOwn(ACTIONS, input.action) || !ACTIONS[input.action].includes(input.category)) return refuse();
    // A copied immutable request prevents callers from changing an issued grant's action, chain or URL.
    const request: NetworkAuthorizationRequest = Object.freeze({ ...input, ...(input.network === undefined ? {} : { network: Object.freeze({ ...input.network }) }), ...(input.balance === undefined ? {} : { balance: Object.freeze({ ...input.balance }) }) });
    const release = request.action === 'release-hash';
    const base = endpoint(request.endpoint, release);
    const match = request.match ?? 'exact';
    if (match !== 'exact' && match !== 'prefix') refuse();
    if (match === 'prefix' && base.search !== '') refuse();
    if (release && (match !== 'exact' || base.origin !== origin())) refuse();
    if (!release && (request.category === 'rpc' || request.category === 'indexer') && !networkAllowed(request.network)) refuse();
    const initial = release ? undefined : readSnapshot();
    if (initial !== undefined) { checkPolicy(request, base, initial.policy); checkSelection(request, base, initial); }
    const sessionGuard = captureSessionVersionGuard();
    const issuedRevision = revision;
    const controller = new AbortController();
    let lastUsed = now();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const cancel = (): void => {
      clearTimeout(idleTimer);
      request.signal?.removeEventListener('abort', cancel);
      active.delete(cancel);
      controller.abort();
    };
    const armIdle = (): void => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(cancel, idleMs);
    };
    const assertCurrent = (): void => {
      try {
        const currentTime = now();
        if (disposed || controller.signal.aborted || request.signal?.aborted === true || revision !== issuedRevision ||
            currentTime < lastUsed || currentTime - lastUsed >= idleMs) return refuse();
        sessionGuard();
        if (initial !== undefined) {
          const current = readSnapshot();
          if (current.raw.some((text, index) => text !== initial.raw[index])) return refuse();
          checkPolicy(request, base, current.policy);
          checkSelection(request, base, current);
        }
      } catch { cancel(); return refuse(); }
    };
    request.signal?.addEventListener('abort', cancel, { once: true });
    active.add(cancel);
    armIdle();
    assertCurrent();

    const dispatch = async (url: string, init: RequestInit): Promise<Response> => {
      assertCurrent();
      const target = endpoint(url, release);
      if (!permittedTarget(base, target, match)) return refuse();
      const method = (init.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'POST') refuse();
      if (request.category === 'rpc' && request.network?.kind !== 'btc' && method !== 'POST') refuse();
      if ((request.category === 'resource' && method !== 'GET') || (request.category === 'relayer' && method !== 'POST')) refuse();
      if (request.category === 'relayer' && !target.pathname.endsWith(request.action === 'sweep-quote' ? '/v1/quote' : '/v1/sweep')) refuse();
      if (request.action === 'btc-scan' && method === 'POST' && request.category === 'rpc') refuse();
      if (request.action === 'tron-scan' && /broadcast/i.test(target.pathname)) refuse();
      if (request.category === 'rpc' && request.network?.kind === 'evm') checkEvmMethod(request, typeof init.body === 'string' ? init.body : '');
      if (request.action === 'solana-scan') {
        try { if (object(JSON.parse(typeof init.body === 'string' ? init.body : ''))['method'] === 'sendTransaction') refuse(); } catch { return refuse(); }
      }
      const headers = new Headers(init.headers);
      for (const name of headers.keys()) {
        if (!['accept', 'content-type', 'x-grpc-web'].includes(name.toLowerCase()) && !(name.toLowerCase() === 'tron-pro-api-key' && request.network?.kind === 'tron')) refuse();
      }
      lastUsed = now();
      armIdle();
      const started = lastUsed;
      const stop = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let responseBody: ReadableStream<Uint8Array> | null | undefined;
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      let settled = false;
      const timer = setTimeout(() => { abort(); }, timeoutMs);
      let rejectStopped: (error: Error) => void = () => undefined;
      const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
      // The rejection is also used after response headers resolve, while the caller reads the wrapped body.
      void stopped.catch(() => undefined);
      const cleanup = (): void => {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', abort);
        init.signal?.removeEventListener('abort', abort);
      };
      const abort = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        stop.abort();
        const failure = networkAuthorizationError();
        rejectStopped(failure);
        try { streamController?.error(failure); } catch { /* The reader may already have closed. */ }
        cancelQuietly(reader ?? responseBody);
        try { reader?.releaseLock(); } catch { /* A pending read may still hold the lock. */ }
      };
      const assertRequest = (): void => {
        assertCurrent();
        const currentTime = now();
        if (stop.signal.aborted || currentTime < started || currentTime - started >= timeoutMs) refuse();
      };
      const finish = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        try { reader?.releaseLock(); } catch { /* Cleanup cannot replace a safe result. */ }
      };
      controller.signal.addEventListener('abort', abort, { once: true });
      init.signal?.addEventListener('abort', abort, { once: true });
      if (init.signal?.aborted === true || controller.signal.aborted) abort();
      try {
        assertRequest();
        const pending = Promise.resolve(fetcher(target.href, {
          ...init, headers, signal: stop.signal, redirect: 'error', credentials: 'omit', referrer: '', referrerPolicy: 'no-referrer', cache: 'no-store', keepalive: false,
          ...(release ? { mode: 'same-origin' as const } : {}),
        })).then((response) => {
          if (settled || stop.signal.aborted) { cancelQuietly(response.body); return refuse(); }
          return response;
        });
        const response = await Promise.race([pending, stopped]);
        responseBody = response.body;
        assertRequest();
        if (stop.signal.aborted || response.redirected || (response.url !== '' && endpoint(response.url, release).href !== target.href) ||
            !Number.isInteger(response.status) || response.status < 200 || response.status > 599 || response.ok !== (response.status < 300)) refuse();
        const declared = response.headers.get('content-length');
        if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) refuse();
        if (response.body === null) { finish(); return response; }
        reader = response.body.getReader();
        const sourceReader = reader;
        let size = 0;
        const body = new ReadableStream<Uint8Array>({
          start(control) { streamController = control; },
          async pull(control) {
            try {
              assertRequest();
              const part = await Promise.race([sourceReader.read(), stopped]);
              assertRequest();
              if (part.done) { control.close(); finish(); return; }
              size += part.value.byteLength;
              if (size > maxBytes) return refuse();
              control.enqueue(part.value);
            } catch { abort(); }
          },
          cancel() { abort(); },
        });
        const guarded = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        Object.defineProperty(guarded, 'url', { value: response.url });
        return guarded;
      } catch {
        abort();
        return refuse();
      }
    };
    const scopedFetch = async (url: string, init: RequestInit): Promise<Response> => {
      try { return await dispatch(url, init); } catch { return refuse(); }
    };
    const grant: NetworkAuthorization = Object.freeze({ fetchFn: scopedFetch, signal: controller.signal, assertCurrent, cancel, dispose: cancel });
    grants.set(grant, { request, endpoint: base });
    return grant;
  };
  return Object.freeze({
    authorize, invalidate, getRevision: () => revision,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    assertRpcAuthorization(authorization: NetworkAuthorization | undefined, chainId: number, url: string, body?: string) {
      const binding = authorization === undefined ? undefined : grants.get(authorization);
      if (authorization === undefined || binding === undefined || binding.request.category !== 'rpc' || binding.request.network?.kind !== 'evm' ||
          binding.request.network.chainId !== chainId || binding.endpoint.href !== endpoint(url).href) {
        throw new ChainAdapterError('RPC_URL_REJECTED', 'network action authorization required');
      }
      try {
        authorization.assertCurrent();
        if (body !== undefined) checkEvmMethod(binding.request, body);
      } catch {
        throw new ChainAdapterError('RPC_URL_REJECTED', 'network action authorization refused');
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      events?.removeEventListener('storage', onStorage);
      unsubscribeSession(); unsubscribeLock(); listeners.clear();
    },
  });
}
