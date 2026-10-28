/**
 * Feature 5 stage 1 (spec 10): privacy-aware scanning. Everything here is opt-in and local: the defaults add no network
 * destination. Three layers, stacked as RpcClient decorators so the existing scan (reorg, provider comparison,
 * receipt verification, checkpoints) runs unchanged on top:
 *
 *   base RPC (Settings RPC, or the user's own scan endpoint / local proxy)
 *     -> optional indexer for announcement logs (scan-source, block hashes witnessed by the base RPC)
 *       -> fixed, grid-aligned windows with CSPRNG order and jitter (announcement queries only)
 *
 * A browser page cannot open SOCKS or verify that it runs in Tor Browser. "local-proxy" means a JSON-RPC forwarder the user
 * runs on loopback; "tor-browser" means the user says they opened this page in Tor Browser. The copy says so.
 */
import {
  ANNOUNCEMENT_TOPIC,
  ChainAdapterError,
  createClient,
  isLogLimitError,
  rawCallerTopic,
  validateRpcUrl,
  type Address,
  type ChainConfig,
  type Hex,
  type LogFilter,
  type RpcClient,
  type RpcLog,
} from '@ghostpay/chain-adapters';
import { FIRST_USE_NOTICE, TOR_BROWSER_NOTICE, createFetchTransport, type FetchLike } from '@ghostpay/net-transport/browser';
import { createIndexerSource, padWindow, ScanSourceError, TESTNET_CHAIN_IDS, type HttpTransport, type HeadSource, type ScanAnnouncement } from '@ghostpay/scan-source';
import { encodeAbiParameters } from 'viem/utils';
import { UserFacingError } from './errors';
import { randomDelayMs, type CryptoLike } from './jitter';

export type ScanTransportKind = 'direct' | 'tor-browser' | 'local-proxy';
export type ScanLogSource = 'rpc' | 'indexer';

/** Non-secret scan privacy preferences (plain text in this browser, like the RPC settings). */
export interface ScanPrivacySettings {
  readonly transport: ScanTransportKind;
  /** Optional per-chain scan endpoint (required for `local-proxy`); empty means the Settings RPC. */
  readonly endpoints: Readonly<Record<string, string>>;
  /** Never contact anything outside the configured private path; no direct second RPC, no fallback. */
  readonly requireProxy: boolean;
  /** Fixed announcement window (0 = provider-sized ranges). Clamped to the chain's log range. */
  readonly windowBlocks: number;
  readonly jitterMinMs: number;
  readonly jitterMaxMs: number;
  readonly source: ScanLogSource;
  readonly indexerUrls: Readonly<Record<string, string>>;
  /** Spec 05: non-router ("open lane") announcements processed per scan before the rest is deferred. */
  readonly openLaneBudget: number;
}

export const DEFAULT_SCAN_PRIVACY: ScanPrivacySettings = Object.freeze({
  transport: 'direct',
  endpoints: Object.freeze({}),
  requireProxy: false,
  windowBlocks: 1000,
  jitterMinMs: 0,
  jitterMaxMs: 0,
  source: 'rpc',
  indexerUrls: Object.freeze({}),
  openLaneBudget: 20_000,
});

export const SCAN_PRIVACY_KEY = 'ghostpay.scanPrivacy.v1';
const MAX_WINDOW = 100_000;
const MAX_JITTER_MS = 10_000;
const MAX_OPEN_BUDGET = 100_000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Validates a scan endpoint for a transport. Returns the normalized URL. */
export function checkScanEndpoint(raw: string, transport: ScanTransportKind): string {
  const trimmed = raw.trim();
  if (transport === 'local-proxy') {
    let u: URL | undefined;
    try { u = new URL(trimmed); } catch { u = undefined; }
    if (u === undefined || !LOOPBACK.has(u.hostname) || (u.protocol !== 'http:' && u.protocol !== 'https:')) {
      throw new UserFacingError('A local proxy endpoint must be on this computer, for example port 8545 on 127.0.0.1 (plain http is allowed there).');
    }
    try { return validateRpcUrl(trimmed, { allowInsecureLocalhost: true }); } catch { throw new UserFacingError('Local proxy endpoint rejected: no username, password or fragment.'); }
  }
  try { return validateRpcUrl(trimmed); } catch { throw new UserFacingError('Scan endpoint rejected: use https:// with no username, password or fragment.'); }
}

/** Validates an indexer base URL: https (loopback http only behind a local proxy), no credentials, query or fragment. */
export function checkIndexerUrl(raw: string, transport: ScanTransportKind): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new UserFacingError('Indexer URL is not a valid URL.'); }
  const loop = LOOPBACK.has(u.hostname);
  const okScheme = u.protocol === 'https:' || (u.protocol === 'http:' && loop);
  if (!okScheme || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') {
    throw new UserFacingError('Indexer URL must be https:// (or http on 127.0.0.1) with no credentials, query or fragment.');
  }
  if (transport === 'local-proxy' && !loop) throw new UserFacingError('With a local proxy, the indexer must also be reached through it (an address on 127.0.0.1).');
  return u.origin + u.pathname.replace(/\/+$/, '');
}

function sanitizeMap(raw: unknown, check: (v: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[1-9][0-9]{0,15}$/.test(k) || typeof v !== 'string') continue;
    try { out[k] = check(v); } catch { /* drop */ }
  }
  return out;
}

const intIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Parses untrusted stored settings; anything invalid falls back to the default field by field. */
export function sanitizeScanPrivacy(raw: unknown): ScanPrivacySettings {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SCAN_PRIVACY;
  const transport: ScanTransportKind = o['transport'] === 'tor-browser' || o['transport'] === 'local-proxy' ? o['transport'] : 'direct';
  const jitterOk = intIn(o['jitterMinMs'], 0, MAX_JITTER_MS) && intIn(o['jitterMaxMs'], 0, MAX_JITTER_MS) && o['jitterMinMs'] <= o['jitterMaxMs'];
  return {
    transport,
    endpoints: sanitizeMap(o['endpoints'], (v) => checkScanEndpoint(v, transport)),
    requireProxy: o['requireProxy'] === true,
    windowBlocks: intIn(o['windowBlocks'], 0, MAX_WINDOW) ? o['windowBlocks'] : d.windowBlocks,
    jitterMinMs: jitterOk ? (o['jitterMinMs'] as number) : d.jitterMinMs,
    jitterMaxMs: jitterOk ? (o['jitterMaxMs'] as number) : d.jitterMaxMs,
    source: o['source'] === 'indexer' ? 'indexer' : 'rpc',
    indexerUrls: sanitizeMap(o['indexerUrls'], (v) => checkIndexerUrl(v, transport)),
    openLaneBudget: intIn(o['openLaneBudget'], 1, MAX_OPEN_BUDGET) ? o['openLaneBudget'] : d.openLaneBudget,
  };
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** `localStorage` when the browser allows it. */
export function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadScanPrivacy(storage: StorageLike | undefined): ScanPrivacySettings {
  try {
    const text = storage?.getItem(SCAN_PRIVACY_KEY);
    return text === null || text === undefined ? DEFAULT_SCAN_PRIVACY : sanitizeScanPrivacy(JSON.parse(text));
  } catch {
    return DEFAULT_SCAN_PRIVACY;
  }
}

/** Returns false when the browser refused to store the settings. */
export function saveScanPrivacy(storage: StorageLike | undefined, s: ScanPrivacySettings): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(SCAN_PRIVACY_KEY, JSON.stringify(sanitizeScanPrivacy(s)));
    return true;
  } catch {
    return false;
  }
}

/** "Paranoid" preset: require the private path, fixed windows, random delays. The transport stays the user's choice. */
export function applyParanoidPreset(s: ScanPrivacySettings): ScanPrivacySettings {
  return { ...s, requireProxy: true, windowBlocks: s.windowBlocks > 0 ? s.windowBlocks : 1000, jitterMinMs: 500, jitterMaxMs: 3000 };
}

export interface WindowPolicy {
  readonly windowBlocks: number;
  readonly jitterMs: readonly [number, number];
}

export type ScanPlan =
  | { readonly kind: 'blocked'; readonly reason: string }
  | {
      readonly kind: 'ready';
      /** Undefined: use the Settings RPC. */
      readonly endpoint: string | undefined;
      readonly allowLoopbackHttp: boolean;
      readonly useSecondary: boolean;
      readonly indexerUrl: string | undefined;
      readonly window: WindowPolicy;
    };

/** Decides how one chain is scanned. Never falls back silently: a missing private path is a blocked scan. */
export function planScan(s: ScanPrivacySettings, chain: ChainConfig): ScanPlan {
  const id = String(chain.chainId);
  if (s.requireProxy && s.transport === 'direct') {
    return { kind: 'blocked', reason: 'Scan blocked: "Require the private path" is on, but the scan transport is Direct. Choose Tor Browser or a local proxy in Settings, or turn the requirement off.' };
  }
  let endpoint: string | undefined;
  try {
    const raw = s.endpoints[id];
    endpoint = raw === undefined || raw === '' ? undefined : checkScanEndpoint(raw, s.transport);
  } catch (e) {
    return { kind: 'blocked', reason: e instanceof Error ? e.message : 'Scan endpoint rejected.' };
  }
  if (s.transport === 'local-proxy' && endpoint === undefined) {
    return { kind: 'blocked', reason: 'Scan blocked: the local proxy has no endpoint for this chain. GhostPay does not fall back to your normal RPC.' };
  }
  let indexerUrl: string | undefined;
  if (s.source === 'indexer') {
    if (!TESTNET_CHAIN_IDS.includes(chain.chainId)) return { kind: 'blocked', reason: 'Scan blocked: the indexer source supports only Anvil, Ethereum Sepolia and Base Sepolia in this build.' };
    const raw = s.indexerUrls[id];
    if (raw === undefined || raw === '') return { kind: 'blocked', reason: 'Scan blocked: no indexer URL is set for this chain.' };
    try { indexerUrl = checkIndexerUrl(raw, s.transport); } catch (e) { return { kind: 'blocked', reason: e instanceof Error ? e.message : 'Indexer URL rejected.' }; }
  }
  const windowBlocks = s.windowBlocks <= 0 ? 0 : Math.min(s.windowBlocks, chain.getLogsMaxRange);
  return {
    kind: 'ready',
    endpoint,
    allowLoopbackHttp: s.transport === 'local-proxy',
    // The second RPC from Settings is contacted directly; behind a required local proxy that would leak the IP.
    useSecondary: !(s.requireProxy && s.transport === 'local-proxy'),
    indexerUrl,
    window: { windowBlocks, jitterMs: [s.jitterMinMs, s.jitterMaxMs] },
  };
}

export interface DisclosureRow {
  readonly party: string;
  readonly learns: string;
}

/** Per-party disclosure for the status line (spec 10 section 2). Plain limits; no anonymity claims. */
export function describeScanDisclosure(s: ScanPrivacySettings, o: { readonly hasSecondary: boolean }): DisclosureRow[] {
  const rows: DisclosureRow[] = [];
  const windows = s.windowBlocks > 0 ? `fixed ${String(s.windowBlocks)}-block windows (coarse, but they still show roughly how far you have scanned)` : 'the exact block ranges you scan';
  const ip = s.transport === 'direct' ? 'your IP address' : s.transport === 'tor-browser' ? 'your IP address unless you really opened this page in Tor Browser' : 'the IP address of your proxy\'s exit, not yours, if your proxy really forwards over Tor';
  const logsFrom = s.source === 'indexer' ? 'block hashes for the scanned windows and announcement blocks' : `that you read GhostPay announcements, ${windows}, and when`;
  // Windows cover only the eth_getLogs ranges: block reads at the checkpoint, window ends and page ends are exact.
  const position = 'The block reads that check your checkpoint and each page still show exactly how far you have scanned.';
  rows.push({ party: 'Scan RPC', learns: `${ip}; ${logsFrom}. ${position} Checking a router payment that matched asks for its receipt, which can reveal which announcement is yours.` });
  if (s.source === 'indexer') {
    rows.push({ party: 'Indexer operator', learns: `${ip}; ${windows}, and when. Block hashes are cross-checked against your RPC, but the indexer could still omit announcements inside blocks it reports.` });
  }
  if (s.transport === 'local-proxy') rows.push({ party: 'Your local proxy', learns: 'Everything the RPC sees, plus the destination. GhostPay cannot check that it forwards over Tor.' });
  if (s.transport === 'tor-browser') rows.push({ party: 'Tor exit', learns: `The destination host, not the TLS content. ${TOR_BROWSER_NOTICE}` });
  if (o.hasSecondary && !(s.requireProxy && s.transport === 'local-proxy')) {
    const secondWindows = s.windowBlocks > 0 ? `the same fixed ${String(s.windowBlocks)}-block windows` : 'the same exact block ranges';
    rows.push({ party: 'Second RPC', learns: `${s.transport === 'local-proxy' ? 'Your IP address (it is contacted directly, not through the proxy)' : ip}; ${secondWindows} for announcements, the same block reads (so it also learns exactly how far you have scanned) and the same verification requests.` });
  }
  rows.push({ party: 'Everyone', learns: `Nothing on-chain is hidden: payer, amount, token, timing and the announcement are public.${s.transport === 'direct' ? '' : ` ${FIRST_USE_NOTICE}`}` });
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// Windowed client

const SCHEME_TOPIC = /^0x[0-9a-f]{64}$/;

function isAnnouncerQuery(f: LogFilter, announcer: Address): boolean {
  return f.address.toLowerCase() === announcer.toLowerCase() && typeof f.topics[0] === 'string' && f.topics[0].toLowerCase() === ANNOUNCEMENT_TOPIC;
}

/**
 * Outgoing-request audit: a scan query names only the announcer, the event topic and the public scheme topic. The one
 * exception is the public manifest router as the `caller` (topics[3]), used for a single block too large to fetch
 * whole; it is the same for every GhostPay user and names nothing about this seller.
 */
function assertScanFilter(f: LogFilter, router: Address | undefined): void {
  const keys = Object.keys(f).sort().join(',');
  const scheme = f.topics[1];
  const caller = f.topics[3];
  const routerOnly = f.topics.length === 4 && f.topics[2] === null && router !== undefined && typeof caller === 'string' && caller.toLowerCase() === word(router);
  if (keys !== 'address,fromBlock,toBlock,topics' || (f.topics.length !== 2 && !routerOnly) || typeof scheme !== 'string' || !SCHEME_TOPIC.test(scheme.toLowerCase())) {
    throw new ChainAdapterError('INVALID_INPUT', 'scan filter may only name the announcer and its event topics');
  }
}

function parseHexNumber(v: unknown): bigint | undefined {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{1,16}$/.test(v) ? BigInt(v) : undefined;
}

export interface WindowedOptions {
  readonly chain: ChainConfig;
  readonly announcer: Address;
  /** Manifest router: the only `caller` a scan query may filter on (one oversized block). */
  readonly router?: Address;
  readonly policy: WindowPolicy;
  readonly sleep: (ms: number) => Promise<void>;
  readonly cryptoApi?: CryptoLike;
}

/**
 * Announcement `eth_getLogs` calls become whole, grid-aligned windows (so different users send identical queries), fetched
 * in CSPRNG order with CSPRNG jitter between network requests; logs outside the caller's range are dropped locally after
 * provider-fault checks. Final windows are cached for this client's lifetime. All other calls pass through unchanged.
 *
 * A window the provider refuses as too large (announcer spam, or a provider range or result limit) is split into
 * halves, the same way for every user, and retried; only that window is fetched in smaller pieces for the rest of the
 * run, so one spam block does not shrink the whole grid. A refusal reaches the scanner only for a single block, which
 * the scanner then re-reads for router-posted announcements (`router`, the one allowed caller filter).
 */
export function createWindowedScanClient(inner: RpcClient, o: WindowedOptions): RpcClient {
  const cryptoApi = o.cryptoApi ?? crypto;
  const [jMin, jMax] = o.policy.jitterMs;
  if (!Number.isSafeInteger(o.policy.windowBlocks) || o.policy.windowBlocks < 0) throw new RangeError('windowBlocks');
  randomDelayMs(jMin, jMax, { getRandomValues: (a) => a }); // validates the range without drawing randomness
  const W = Math.min(o.policy.windowBlocks, o.chain.getLogsMaxRange);
  let head: bigint | undefined;
  let networkRequests = 0;
  const depth = BigInt(o.chain.finalityDepth);
  const cache = new Map<string, readonly RpcLog[]>();
  const CACHE_MAX = 64;
  // Windows a provider refused as too large; they are requested as their two halves from then on.
  const split = new Set<string>();
  const SPLIT_MAX = 4096;
  const nodeKey = (f: LogFilter, start: bigint, end: bigint): string => `${String(f.topics[1])}|${String(f.topics[3] ?? '')}:${start.toString()}:${end.toString()}`;

  async function fetchWindow(f: LogFilter, start: bigint, end: bigint): Promise<readonly RpcLog[]> {
    const key = nodeKey(f, start, end);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (networkRequests > 0 && jMax > 0) await o.sleep(randomDelayMs(jMin, jMax, cryptoApi));
    networkRequests++;
    const logs = await inner.getLogs({ address: f.address, topics: f.topics, fromBlock: start, toBlock: end });
    const list: unknown = logs;
    if (!Array.isArray(list)) throw new ChainAdapterError('RPC_FAILURE', 'logs not an array');
    const caller = f.topics[3];
    for (const raw of list as readonly unknown[]) {
      const l = typeof raw === 'object' && raw !== null ? (raw as Partial<RpcLog>) : undefined;
      const n = parseHexNumber(l?.blockNumber);
      const topics: unknown = l?.topics;
      if (typeof l?.address !== 'string' || l.address.toLowerCase() !== f.address.toLowerCase() || !Array.isArray(topics) ||
          String(topics[0]).toLowerCase() !== String(f.topics[0]).toLowerCase() || String(topics[1]).toLowerCase() !== String(f.topics[1]).toLowerCase() ||
          (typeof caller === 'string' && rawCallerTopic(l as RpcLog) !== caller.toLowerCase()) ||
          n === undefined || n < start || n > end) {
        throw new ChainAdapterError('INVALID_LOG', 'provider returned a log outside the requested window or filter');
      }
    }
    if (head !== undefined && end + depth <= head) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, logs);
    }
    return logs;
  }

  /** Collects the logs of grid window [start, end] that fall in [from, to], splitting refused windows into halves. */
  async function fetchNode(f: LogFilter, start: bigint, end: bigint, out: RpcLog[]): Promise<void> {
    if (end < f.fromBlock || start > f.toBlock) return;
    const key = nodeKey(f, start, end);
    if (end > start && split.has(key)) {
      const mid = start + (end - start + 1n) / 2n - 1n;
      const halves: [bigint, bigint][] = [[start, mid], [mid + 1n, end]];
      // CSPRNG order inside a split window as well.
      if (randomDelayMs(0, 1, cryptoApi) === 1) halves.reverse();
      for (const [s, e] of halves) await fetchNode(f, s, e, out);
      return;
    }
    let logs: readonly RpcLog[];
    try {
      logs = await fetchWindow(f, start, end);
    } catch (e) {
      // Too large: split this window and retry it. Only a single block too large to return is left to the scanner.
      if (!isLogLimitError(e) || end === start) throw e;
      if (split.size >= SPLIT_MAX) split.delete(split.values().next().value as string);
      split.add(key);
      await fetchNode(f, start, end, out);
      return;
    }
    for (const l of logs) {
      const n = BigInt(l.blockNumber);
      if (n >= f.fromBlock && n <= f.toBlock) out.push(l);
    }
  }

  return {
    chainId: inner.chainId,
    request: (m, p) => inner.request(m, p),
    getBlock: (n) => inner.getBlock(n),
    async blockNumber() {
      const h = await inner.blockNumber();
      head = h;
      return h;
    },
    async getLogs(f) {
      if (!isAnnouncerQuery(f, o.announcer)) return inner.getLogs(f);
      assertScanFilter(f, o.router);
      if (W === 0) return inner.getLogs(f);
      if (f.fromBlock < 0n || f.toBlock < f.fromBlock) throw new ChainAdapterError('INVALID_INPUT', 'invalid scan range');
      head ??= await inner.blockNumber();
      const grid = padWindow(f.fromBlock, f.toBlock, W, W);
      // The window containing the head is clamped to it (inherent: it shows roughly where the head is, which is public).
      const limit = head > f.toBlock ? head : f.toBlock;
      const windows: [bigint, bigint][] = [];
      for (let s = grid.from; s <= grid.to && s <= limit; s += BigInt(W)) {
        const e = s + BigInt(W) - 1n;
        windows.push([s, e < limit ? e : limit]);
      }
      // Fisher-Yates with the CSPRNG: request order does not follow scan progress.
      for (let i = windows.length - 1; i > 0; i--) {
        const j = randomDelayMs(0, i, cryptoApi);
        [windows[i], windows[j]] = [windows[j] as [bigint, bigint], windows[i] as [bigint, bigint]];
      }
      const out: RpcLog[] = [];
      for (const [s, e] of windows) await fetchNode(f, s, e, out);
      const pos = (l: RpcLog): bigint => (BigInt(l.blockNumber) << 32n) + (parseHexNumber(l.logIndex) ?? 0n);
      out.sort((a, b) => (pos(a) < pos(b) ? -1 : pos(a) > pos(b) ? 1 : 0));
      return out;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Indexer

/** Browser GET transport for the indexer: no redirects, no cookies, no referrer, streamed size cap, timeout. */
export function fetchHttpTransport(fetchImpl: (url: string, init: RequestInit) => Promise<Response>): HttpTransport {
  return {
    async request(req) {
      const ctl = new AbortController();
      const timer = setTimeout(() => { ctl.abort(); }, req.timeoutMs);
      const onAbort = (): void => { ctl.abort(); };
      req.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetchImpl(req.url, { method: req.method, signal: ctl.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { accept: 'application/json' } });
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length > req.maxBytes) throw new ScanSourceError('TRANSPORT', 'response too large');
        return { status: res.status, body: buf };
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

function headSourceFrom(c: RpcClient): HeadSource {
  return {
    async head() {
      const n = await c.blockNumber();
      const b = await c.getBlock(n);
      if (b === null) throw new ChainAdapterError('RPC_FAILURE', 'chain head block unavailable');
      return { number: n, hash: b.hash };
    },
    async blockHash(n) {
      const b = await c.getBlock(n);
      if (b === null) throw new ChainAdapterError('RPC_FAILURE', 'block unavailable');
      return b.hash;
    },
  };
}

const word = (a: string): Hex => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;

/** Back to the on-chain log shape, so chain-adapters' validator re-checks ABI, point and position as for an RPC log. */
function toRpcLog(a: ScanAnnouncement, announcer: Address): RpcLog {
  return {
    address: announcer,
    topics: [ANNOUNCEMENT_TOPIC, word(`0x${a.schemeId.toString(16)}`), word(a.stealthAddress), word(a.caller)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [a.ephemeralPublicKey, a.metadata]),
    blockNumber: `0x${a.blockNumber.toString(16)}`,
    blockHash: a.blockHash,
    logIndex: `0x${a.logIndex.toString(16)}`,
    ...(a.transactionHash === undefined ? {} : { transactionHash: a.transactionHash }),
  };
}

export interface IndexerClientOptions {
  readonly chain: ChainConfig;
  readonly announcer: Address;
  /** Manifest router: a router-only query is answered from the same records, filtered here by caller. */
  readonly router?: Address;
  readonly baseUrl: string;
  readonly fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  /** Window grid for the indexer request (the chain's log range when windows are off). */
  readonly windowBlocks: number;
}

/**
 * Announcement logs come from `GET /v1/logs` (scan-source): header chain continuity and every announcement block hash are
 * checked against `inner` (the user's RPC). The emitter cannot be proven from an indexer record; a router payment is only
 * shown as verified after its receipt on the user's RPC binds it to the announcer log. Any failure fails the scan closed.
 */
export function createIndexerScanClient(inner: RpcClient, o: IndexerClientOptions): RpcClient {
  const w = o.windowBlocks > 0 ? o.windowBlocks : o.chain.getLogsMaxRange;
  const source = createIndexerSource({
    chainId: o.chain.chainId,
    baseUrl: o.baseUrl,
    transport: fetchHttpTransport(o.fetchImpl),
    secondSource: headSourceFrom(inner),
    windowBlocks: w,
    align: w,
    minSpan: w,
  });
  return {
    chainId: inner.chainId,
    request: (m, p) => inner.request(m, p),
    blockNumber: () => inner.blockNumber(),
    getBlock: (n) => inner.getBlock(n),
    async getLogs(f) {
      if (!isAnnouncerQuery(f, o.announcer)) return inner.getLogs(f);
      assertScanFilter(f, o.router);
      let res;
      try {
        res = await source.fetch({ chainId: o.chain.chainId, fromBlock: f.fromBlock, toBlock: f.toBlock });
      } catch (e) {
        if (e instanceof ChainAdapterError) throw e;
        throw new ChainAdapterError('RPC_FAILURE', `indexer ${e instanceof ScanSourceError ? e.code : 'failure'}`);
      }
      if (res.coverage.fromBlock > f.fromBlock || res.coverage.toBlock < f.toBlock) throw new ChainAdapterError('RPC_FAILURE', 'indexer CONTINUITY window incomplete');
      const caller = f.topics[3];
      return res.announcements
        .filter((a) => a.blockNumber >= f.fromBlock && a.blockNumber <= f.toBlock && (typeof caller !== 'string' || word(a.caller) === caller.toLowerCase()))
        .map((a) => toRpcLog(a, o.announcer));
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Wiring

export interface OpenScanOptions {
  readonly plan: Extract<ScanPlan, { kind: 'ready' }>;
  readonly chain: ChainConfig;
  readonly announcer: Address;
  /** Manifest router: allows the router-only re-query of a single oversized block. */
  readonly router?: Address;
  readonly appRpc: () => Promise<RpcClient | undefined>;
  readonly fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface ScanClients {
  /** Plain client on the chosen path: manifest checks and receipts. */
  readonly base: RpcClient;
  /** `base` plus indexer and windows: hand this to the scan. */
  readonly scan: RpcClient;
}

/**
 * Builds the scan clients for a ready plan; undefined when no RPC is configured. A custom endpoint is verified with one
 * `eth_chainId` call on that endpoint only. The second RPC is the caller's business (`plan.useSecondary`), so its
 * fail-closed handling stays in one place.
 */
export async function openScanClients(o: OpenScanOptions): Promise<ScanClients | undefined> {
  const { plan } = o;
  let base: RpcClient | undefined;
  if (plan.endpoint !== undefined) {
    const transport = createFetchTransport({ fetchImpl: o.fetchImpl as unknown as FetchLike, allowInsecureLocalhost: plan.allowLoopbackHttp });
    try {
      base = await createClient(o.chain, plan.endpoint, { allowInsecureLocalhost: plan.allowLoopbackHttp, transport });
    } catch (e) {
      const blocked = new UserFacingError('Scan blocked: the private scan endpoint could not be used (unreachable or wrong chain). GhostPay did not fall back to another RPC.');
      blocked.cause = e;
      throw blocked;
    }
  } else {
    base = await o.appRpc();
  }
  if (base === undefined) return undefined;
  const router = o.router === undefined ? {} : { router: o.router };
  const logs = plan.indexerUrl === undefined ? base : createIndexerScanClient(base, { chain: o.chain, announcer: o.announcer, ...router, baseUrl: plan.indexerUrl, fetchImpl: o.fetchImpl, windowBlocks: plan.window.windowBlocks });
  const scan = createWindowedScanClient(logs, { chain: o.chain, announcer: o.announcer, ...router, policy: plan.window, sleep: o.sleep });
  return { base, scan };
}
