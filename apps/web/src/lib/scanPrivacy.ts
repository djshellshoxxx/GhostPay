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
  type RpcTransport,
} from '@ghostpay/chain-adapters';
import { FIRST_USE_NOTICE, TOR_BROWSER_NOTICE, createFetchTransport, type FetchLike } from '@ghostpay/net-transport/browser';
import { createIndexerSource, padWindow, ScanSourceError, TESTNET_CHAIN_IDS, type HttpTransport, type HeadSource, type ScanAnnouncement } from '@ghostpay/scan-source';
import { encodeAbiParameters } from 'viem/utils';
import { UserFacingError, displayMessage, type MessageDescriptor } from './errors';
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
  /**
   * Set only in memory, never saved: settings were saved in this browser but cannot be read exactly as saved (edited,
   * corrupted, or the browser refused the read). The saved intent is unknown, so nothing may weaken it: scanning is
   * blocked, the second RPC is not contacted and Sweep reads a balance only on request, until the user saves valid
   * settings again. It never falls back to Direct.
   */
  readonly unreadable?: true;
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
      throw new UserFacingError({ key: 'error.scanPrivacy.aLocalProxyEndpointMustBeOnThisComputerFor' });
    }
    try { return validateRpcUrl(trimmed, { allowInsecureLocalhost: true }); } catch { throw new UserFacingError({ key: 'error.scanPrivacy.localProxyEndpointRejectedNoUsernamePasswordOrFragment' }); }
  }
  try { return validateRpcUrl(trimmed); } catch { throw new UserFacingError({ key: 'error.scanPrivacy.scanEndpointRejectedUseHttpsWithNoUsernamePasswordOr' }); }
}

/** Validates an indexer base URL: https (loopback http only behind a local proxy), no credentials, query or fragment. */
export function checkIndexerUrl(raw: string, transport: ScanTransportKind): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new UserFacingError({ key: 'error.scanPrivacy.indexerURLIsNotAValidURL' }); }
  const loop = LOOPBACK.has(u.hostname);
  const okScheme = u.protocol === 'https:' || (u.protocol === 'http:' && loop);
  if (!okScheme || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') {
    throw new UserFacingError({ key: 'error.scanPrivacy.indexerURLMustBeHttpsOrHttpOn1270' });
  }
  if (transport === 'local-proxy' && !loop) throw new UserFacingError({ key: 'error.scanPrivacy.withALocalProxyTheIndexerMustAlsoBeReached' });
  const path = u.pathname;
  let end = path.length;
  while (end > 0 && path[end - 1] === '/') end--;
  return u.origin + path.slice(0, end);
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

const UNREADABLE_TEXT = 'They could not be read exactly as saved in this browser, so nothing is sent: scanning is blocked, the second RPC is not contacted and Sweep reads a balance only on request. Review and save them in Settings.';

/** Saved settings whose intent cannot be read: the defaults, with the private path required and scanning blocked. */
export const UNREADABLE_SCAN_PRIVACY: ScanPrivacySettings = Object.freeze({ ...DEFAULT_SCAN_PRIVACY, requireProxy: true, unreadable: true });

const sameKeys = (raw: unknown, kept: Readonly<Record<string, string>>): boolean =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) &&
  Object.keys(raw).length === Object.keys(kept).length && Object.keys(raw).every((k) => k in kept);

/**
 * True when every field that is present in `raw` survived sanitizing as itself (or, for a URL map, as the same chains).
 * Missing fields are allowed: they come from older saved versions and take their defaults.
 */
function intactScanPrivacy(raw: unknown, s: ScanPrivacySettings): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
  if (has('transport') && o['transport'] !== s.transport) return false;
  if (has('requireProxy') && o['requireProxy'] !== s.requireProxy) return false;
  if (has('source') && o['source'] !== s.source) return false;
  if (has('windowBlocks') && o['windowBlocks'] !== s.windowBlocks) return false;
  if (has('openLaneBudget') && o['openLaneBudget'] !== s.openLaneBudget) return false;
  if ((has('jitterMinMs') && o['jitterMinMs'] !== s.jitterMinMs) || (has('jitterMaxMs') && o['jitterMaxMs'] !== s.jitterMaxMs)) return false;
  if (has('endpoints') && !sameKeys(o['endpoints'], s.endpoints)) return false;
  if (has('indexerUrls') && !sameKeys(o['indexerUrls'], s.indexerUrls)) return false;
  return true;
}

/**
 * Reads the saved settings. Nothing saved (or no storage API at all) gives the defaults. Saved settings that are not
 * exactly valid, or a read the browser refuses, give {@link UNREADABLE_SCAN_PRIVACY}-style settings: their saved
 * intent is unknown and must not be weakened by falling back to Direct or to field defaults.
 */
export function loadScanPrivacy(storage: StorageLike | undefined): ScanPrivacySettings {
  let text: string | null | undefined;
  try {
    text = storage?.getItem(SCAN_PRIVACY_KEY);
  } catch {
    return UNREADABLE_SCAN_PRIVACY;
  }
  if (text === null || text === undefined) return DEFAULT_SCAN_PRIVACY;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return UNREADABLE_SCAN_PRIVACY;
  }
  const s = sanitizeScanPrivacy(raw);
  // Keep what could be read so Settings can show it for review, but require the private path and block until saved.
  return intactScanPrivacy(raw, s) ? s : { ...s, requireProxy: true, unreadable: true };
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
  | {
      readonly kind: 'blocked';
      /** Source-English compatibility text. UI callers render reasonMessage with their current translator. */
      readonly reason: string;
      readonly reasonMessage: MessageDescriptor;
    }
  | {
      readonly kind: 'ready';
      /** Undefined: use the Settings RPC. */
      readonly endpoint: string | undefined;
      readonly allowLoopbackHttp: boolean;
      readonly useSecondary: boolean;
      readonly indexerUrl: string | undefined;
      readonly window: WindowPolicy;
    };

function blockedPlan(reasonMessage: MessageDescriptor): Extract<ScanPlan, { kind: 'blocked' }> {
  return { kind: 'blocked', reason: displayMessage(reasonMessage), reasonMessage };
}

/**
 * True when the user requires the private path through a local proxy: then nothing may contact the Settings RPCs
 * directly on its own (the scan skips the second RPC, and Sweep reads a balance only when asked), because a direct
 * request would link the user's IP address to what it asks about.
 */
export function privatePathForbidsDirect(s: ScanPrivacySettings): boolean {
  // Unreadable saved settings may have required the private path: treat them as if they did.
  return s.unreadable === true || (s.requireProxy && s.transport === 'local-proxy');
}

/** Decides how one chain is scanned. Never falls back silently: a missing private path is a blocked scan. */
export function planScan(s: ScanPrivacySettings, chain: ChainConfig): ScanPlan {
  const id = String(chain.chainId);
  if (s.unreadable === true) return blockedPlan({ key: 'scanPrivacy.blocked.settingsUnreadable' });
  if (s.requireProxy && s.transport === 'direct') {
    return blockedPlan({ key: 'scanPrivacy.blocked.requirePrivatePath' });
  }
  let endpoint: string | undefined;
  try {
    const raw = s.endpoints[id];
    endpoint = raw === undefined || raw === '' ? undefined : checkScanEndpoint(raw, s.transport);
  } catch (e) {
    return blockedPlan(e instanceof UserFacingError && e.translation !== undefined ? e.translation : { key: 'scanPrivacy.blocked.endpointRejected' });
  }
  if (s.transport === 'local-proxy' && endpoint === undefined) {
    return blockedPlan({ key: 'scanPrivacy.blocked.proxyEndpoint' });
  }
  let indexerUrl: string | undefined;
  if (s.source === 'indexer') {
    if (!TESTNET_CHAIN_IDS.includes(chain.chainId)) return blockedPlan({ key: 'scanPrivacy.blocked.indexerChain' });
    const raw = s.indexerUrls[id];
    if (raw === undefined || raw === '') return blockedPlan({ key: 'scanPrivacy.blocked.indexerMissing' });
    try { indexerUrl = checkIndexerUrl(raw, s.transport); } catch (e) { return blockedPlan(e instanceof UserFacingError && e.translation !== undefined ? e.translation : { key: 'scanPrivacy.blocked.indexerRejected' }); }
  }
  const windowBlocks = s.windowBlocks <= 0 ? 0 : Math.min(s.windowBlocks, chain.getLogsMaxRange);
  return {
    kind: 'ready',
    endpoint,
    allowLoopbackHttp: s.transport === 'local-proxy',
    // The second RPC from Settings is contacted directly; behind a required local proxy that would leak the IP.
    useSecondary: !privatePathForbidsDirect(s),
    indexerUrl,
    window: { windowBlocks, jitterMs: [s.jitterMinMs, s.jitterMaxMs] },
  };
}

export interface DisclosureRow {
  readonly party: string;
  readonly learns: string;
}

export interface DisclosureMessageRow {
  readonly party: MessageDescriptor;
  readonly learns: MessageDescriptor;
}

/** Public message data only: callers translate at render time, without reopening or replanning a scan. */
export function describeScanDisclosureMessages(s: ScanPrivacySettings, o: { readonly hasSecondary: boolean }): DisclosureMessageRow[] {
  const rows: DisclosureMessageRow[] = [];
  if (s.unreadable === true) rows.push({ party: { key: 'scanPrivacy.disclosure.unreadableParty' }, learns: { key: 'scanPrivacy.disclosure.unreadable' } });
  const windows: MessageDescriptor = s.windowBlocks > 0
    ? { key: 'scanPrivacy.disclosure.windowsFixed', values: { blocks: String(s.windowBlocks) } }
    : { key: 'scanPrivacy.disclosure.windowsExact' };
  const ip: MessageDescriptor = { key: s.transport === 'direct' ? 'scanPrivacy.disclosure.ipDirect' : s.transport === 'tor-browser' ? 'scanPrivacy.disclosure.ipTorBrowser' : 'scanPrivacy.disclosure.ipProxyExit' };
  const logs: MessageDescriptor = s.source === 'indexer'
    ? { key: 'scanPrivacy.disclosure.logsIndexer' }
    : { key: 'scanPrivacy.disclosure.logsRpc', values: { windows } };
  rows.push({ party: { key: 'scanPrivacy.disclosure.rpcParty' }, learns: { key: 'scanPrivacy.disclosure.rpc', values: { ip, logs } } });
  if (s.source === 'indexer') {
    rows.push({ party: { key: 'scanPrivacy.disclosure.indexerParty' }, learns: { key: 'scanPrivacy.disclosure.indexer', values: { ip, windows } } });
  }
  if (s.transport === 'local-proxy') rows.push({ party: { key: 'scanPrivacy.disclosure.proxyParty' }, learns: { key: 'scanPrivacy.disclosure.proxy' } });
  if (s.transport === 'tor-browser') rows.push({ party: { key: 'scanPrivacy.disclosure.torExitParty' }, learns: { key: 'scanPrivacy.disclosure.torExit', values: { notice: { key: 'scanPrivacy.disclosure.torBrowserNotice' } } } });
  if (o.hasSecondary && !privatePathForbidsDirect(s)) {
    const secondWindows: MessageDescriptor = s.windowBlocks > 0
      ? { key: 'scanPrivacy.disclosure.secondWindowsFixed', values: { blocks: String(s.windowBlocks) } }
      : { key: 'scanPrivacy.disclosure.secondWindowsExact' };
    const secondIp: MessageDescriptor = s.transport === 'local-proxy' ? { key: 'scanPrivacy.disclosure.secondDirectIp' } : ip;
    rows.push({ party: { key: 'scanPrivacy.disclosure.secondParty' }, learns: { key: 'scanPrivacy.disclosure.second', values: { ip: secondIp, windows: secondWindows } } });
  }
  // Not part of the scan: Sweep reads the found address's balance and prepares/sends the sweep via the Settings RPC.
  const sweepIp: MessageDescriptor = s.transport === 'local-proxy' ? { key: 'scanPrivacy.disclosure.secondDirectIp' } : ip;
  rows.push({ party: { key: 'scanPrivacy.disclosure.sweepParty' }, learns: { key: 'scanPrivacy.disclosure.sweepOnRequest', values: { ip: sweepIp } } });
  // A connected wallet talks to its own provider: none of these settings or checks reach that traffic.
  rows.push({ party: { key: 'scanPrivacy.disclosure.walletParty' }, learns: { key: 'scanPrivacy.disclosure.wallet' } });
  rows.push({ party: { key: 'scanPrivacy.disclosure.everyoneParty' }, learns: s.transport === 'direct'
    ? { key: 'scanPrivacy.disclosure.everyone' }
    : { key: 'scanPrivacy.disclosure.everyonePrivate', values: { notice: { key: 'scanPrivacy.disclosure.firstUseNotice' } } } });
  return rows;
}

/** Source-English compatibility disclosure (spec 10 section 2); UI uses describeScanDisclosureMessages. */
export function describeScanDisclosure(s: ScanPrivacySettings, o: { readonly hasSecondary: boolean }): DisclosureRow[] {
  const rows: DisclosureRow[] = [];
  if (s.unreadable === true) rows.push({ party: 'Saved scan privacy settings', learns: UNREADABLE_TEXT });
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
  if (o.hasSecondary && !privatePathForbidsDirect(s)) {
    const secondWindows = s.windowBlocks > 0 ? `the same fixed ${String(s.windowBlocks)}-block windows` : 'the same exact block ranges';
    rows.push({ party: 'Second RPC', learns: `${s.transport === 'local-proxy' ? 'Your IP address (it is contacted directly, not through the proxy)' : ip}; ${secondWindows} for announcements, the same block reads (so it also learns exactly how far you have scanned) and the same verification requests.` });
  }
  const sweepHow = 'but only when you press "Read balance from the Settings RPC" in Sweep';
  rows.push({ party: 'Settings RPC (Sweep)', learns: `${s.transport === 'local-proxy' ? 'Your IP address (it is contacted directly, not through the proxy)' : ip}; the one-time address of a found payment, ${sweepHow}. Signing a sweep also reads from it, and a direct sweep is sent through it. These requests go to the RPC in Settings directly, not through the scan path.` });
  rows.push({ party: 'Your wallet (extension or app)', learns: 'Not covered by these settings: a wallet you connect to pay, sign or publish uses its own RPC provider and network settings. The wallet and its provider can see your accounts, the chain, each request you approve and your IP address. GhostPay cannot route, check or see that traffic.' });
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
  // Exact request-field names use deterministic UTF-16 order, never host-locale collation.
  const keys = Object.keys(f).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join(',');
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
    request: (...args) => inner.request(...args),
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

/**
 * Reads at most `max` bytes of a response body. A declared Content-Length above the cap is refused unread; otherwise the
 * stream is counted chunk by chunk and, once it passes the cap, the reader is cancelled and the request aborted, so at most
 * one chunk beyond the cap is ever held. A response without a body reads as empty. (The capped readers in net-transport
 * and the Esplora client are private and throw their own error types, so this one stays local.)
 */
async function readBodyCapped(res: Response, max: number, ctl: AbortController): Promise<Uint8Array> {
  const tooLarge = (): ScanSourceError => new ScanSourceError('TRANSPORT', 'response too large');
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => undefined);
    ctl.abort();
    throw tooLarge();
  }
  if (res.body === null) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      ctl.abort();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return all;
}

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
        return { status: res.status, body: await readBodyCapped(res, req.maxBytes, ctl) };
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

function headSourceFrom(c: RpcClient): HeadSource {
  // Checked before every read: a stopped scan asks for no further block, and a dense window needs one read per block.
  const assertRunning = (signal: AbortSignal | undefined): void => {
    if (signal?.aborted === true) throw new ChainAdapterError('RPC_FAILURE', 'scan stopped');
  };
  return {
    async head(signal) {
      assertRunning(signal);
      const n = await c.blockNumber();
      assertRunning(signal);
      const b = await c.getBlock(n);
      if (b === null) throw new ChainAdapterError('RPC_FAILURE', 'chain head block unavailable');
      return { number: n, hash: b.hash };
    },
    async blockHash(n, signal) {
      assertRunning(signal);
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
  /** Stops a running fetch: its indexer request is aborted and no further block is read for the cross-check. */
  readonly signal?: AbortSignal;
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
    // Anyone can post announcements into more blocks than the source's default cross-check cap, which failed the whole
    // scan. The bound here is the widest grid window a scan page (at most getLogsMaxRange blocks) can cover, so every
    // announcement block of it is still confirmed by the user's RPC, one read each, as an RPC scan reads them.
    maxCrossChecks: (Math.ceil(o.chain.getLogsMaxRange / w) + 1) * w,
  });
  return {
    chainId: inner.chainId,
    request: (...args) => inner.request(...args),
    blockNumber: () => inner.blockNumber(),
    getBlock: (n) => inner.getBlock(n),
    async getLogs(f) {
      if (!isAnnouncerQuery(f, o.announcer)) return inner.getLogs(f);
      assertScanFilter(f, o.router);
      let res;
      try {
        res = await source.fetch({ chainId: o.chain.chainId, fromBlock: f.fromBlock, toBlock: f.toBlock }, o.signal);
      } catch (e) {
        if (e instanceof ChainAdapterError) throw e;
        throw new ChainAdapterError('RPC_FAILURE', `indexer ${e instanceof ScanSourceError ? e.code : 'failure'}`);
      }
      if (res.coverage.fromBlock > f.fromBlock || res.coverage.toBlock < f.toBlock) throw new ChainAdapterError('RPC_FAILURE', 'indexer CONTINUITY window incomplete');
      // A record that cannot be placed or read may be a payment: fail here, so the scan saves no checkpoint past it.
      if ((res.rejected ?? 0) > 0) throw new ChainAdapterError('RPC_FAILURE', 'indexer REJECTED_RECORDS in the requested range');
      const caller = f.topics[3];
      // What anyone can post goes to the scan's on-chain check with the rest, in chain order, so it is skipped or
      // accepted as over an RPC and a second provider's page agrees.
      return [...res.announcements, ...(res.posted ?? [])]
        .filter((a) => a.blockNumber >= f.fromBlock && a.blockNumber <= f.toBlock && (typeof caller !== 'string' || word(a.caller) === caller.toLowerCase()))
        .sort((x, y) => (x.blockNumber < y.blockNumber ? -1 : x.blockNumber > y.blockNumber ? 1 : x.logIndex - y.logIndex))
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
  /**
   * Throws when the route this scan was planned for is no longer the saved one (see {@link guardScanClient}). Checked
   * before every request this client sends, including transport retries and chain re-checks on a scan endpoint and
   * indexer fetches, and again when each answer arrives.
   */
  readonly assertCurrent?: () => void;
  /** The run these clients are opened for: stopping it ends the indexer's block reads. `base` stays usable. */
  readonly signal?: AbortSignal;
}

/** The scan's privacy settings or RPC changed while it was running; nothing more is sent on the old route. */
export const SCAN_ROUTE_CHANGED: MessageDescriptor = { key: 'scanPrivacy.blocked.routeChanged' };

export function isScanRouteChanged(e: unknown): boolean {
  return e instanceof UserFacingError && e.translation?.key === SCAN_ROUTE_CHANGED.key;
}

/** Runs `call` between two route checks. A failure after a route change reports the change, not the failure. */
async function checkedCall<T>(assertCurrent: () => void, call: () => Promise<T>): Promise<T> {
  assertCurrent();
  let out: T;
  try {
    out = await call();
  } catch (e) {
    assertCurrent();
    throw e;
  }
  // A delayed answer from a route the user has since changed is discarded.
  assertCurrent();
  return out;
}

/**
 * Re-checks the current scan route around every request of `inner`. A cached client stays usable while the saved
 * settings still match; once they change (here or in another tab), no further request leaves this client. Requests
 * already sent cannot be recalled.
 */
export function guardScanClient(inner: RpcClient, assertCurrent: () => void): RpcClient {
  return {
    chainId: inner.chainId,
    request: (...args) => checkedCall(assertCurrent, () => inner.request(...args)),
    blockNumber: () => checkedCall(assertCurrent, () => inner.blockNumber()),
    getBlock: (n) => checkedCall(assertCurrent, () => inner.getBlock(n)),
    getLogs: (f) => checkedCall(assertCurrent, () => inner.getLogs(f)),
  };
}

/**
 * Checks the route before every transport send, so the client's own retries and chain re-checks cannot reach a changed
 * route. The refusal is a non-retryable adapter error (an unknown error would be retried); the client-level guard
 * around it reports it as {@link SCAN_ROUTE_CHANGED}.
 */
function guardTransport(inner: RpcTransport, assertCurrent: () => void): RpcTransport {
  const check = (): void => {
    try {
      assertCurrent();
    } catch {
      throw new ChainAdapterError('RPC_URL_REJECTED', 'scan route changed');
    }
  };
  return {
    send: async (url, body, init) => {
      check();
      const text = await inner.send(url, body, init);
      check();
      return text;
    },
  };
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
  const { plan, assertCurrent } = o;
  const fetchImpl = assertCurrent === undefined
    ? o.fetchImpl
    : (url: string, init: RequestInit): Promise<Response> => checkedCall(assertCurrent, () => o.fetchImpl(url, init));
  let base: RpcClient | undefined;
  if (plan.endpoint !== undefined) {
    const fetchTransport = createFetchTransport({ fetchImpl: fetchImpl as unknown as FetchLike, allowInsecureLocalhost: plan.allowLoopbackHttp });
    const transport = assertCurrent === undefined ? fetchTransport : guardTransport(fetchTransport, assertCurrent);
    try {
      const open = (): Promise<RpcClient> => createClient(o.chain, plan.endpoint as string, { allowInsecureLocalhost: plan.allowLoopbackHttp, transport });
      base = assertCurrent === undefined ? await open() : await checkedCall(assertCurrent, open);
    } catch (e) {
      if (isScanRouteChanged(e)) throw e;
      const blocked = new UserFacingError({ key: 'error.scanPrivacy.scanBlockedThePrivateScanEndpointCouldNotBeUsed' });
      blocked.cause = e;
      throw blocked;
    }
  } else {
    if (assertCurrent !== undefined) assertCurrent();
    base = await o.appRpc();
  }
  if (base === undefined) return undefined;
  // The app's RPC is cached across views; guard this scan's use of it without changing the cached client.
  if (assertCurrent !== undefined) base = guardScanClient(base, assertCurrent);
  const router = o.router === undefined ? {} : { router: o.router };
  const stop = o.signal === undefined ? {} : { signal: o.signal };
  const logs = plan.indexerUrl === undefined ? base : createIndexerScanClient(base, { chain: o.chain, announcer: o.announcer, ...router, ...stop, baseUrl: plan.indexerUrl, fetchImpl, windowBlocks: plan.window.windowBlocks });
  const scan = createWindowedScanClient(logs, { chain: o.chain, announcer: o.announcer, ...router, policy: plan.window, sleep: o.sleep });
  // The outer guard also turns an indexer or window failure that follows a route change into SCAN_ROUTE_CHANGED.
  return { base, scan: assertCurrent === undefined ? scan : guardScanClient(scan, assertCurrent) };
}

// i18n-use: error.scanPrivacy.aLocalProxyEndpointMustBeOnThisComputerFor error.scanPrivacy.localProxyEndpointRejectedNoUsernamePasswordOrFragment error.scanPrivacy.scanEndpointRejectedUseHttpsWithNoUsernamePasswordOr error.scanPrivacy.indexerURLIsNotAValidURL error.scanPrivacy.indexerURLMustBeHttpsOrHttpOn1270 error.scanPrivacy.withALocalProxyTheIndexerMustAlsoBeReached error.scanPrivacy.scanBlockedThePrivateScanEndpointCouldNotBeUsed

// i18n-use: scanPrivacy.blocked.settingsUnreadable scanPrivacy.blocked.routeChanged scanPrivacy.disclosure.unreadableParty scanPrivacy.disclosure.unreadable scanPrivacy.disclosure.walletParty scanPrivacy.disclosure.wallet
// i18n-use: scanPrivacy.blocked.requirePrivatePath scanPrivacy.blocked.proxyEndpoint scanPrivacy.blocked.indexerChain scanPrivacy.blocked.indexerMissing scanPrivacy.blocked.endpointRejected scanPrivacy.blocked.indexerRejected
// i18n-use: scanPrivacy.disclosure.windowsFixed scanPrivacy.disclosure.windowsExact scanPrivacy.disclosure.ipDirect scanPrivacy.disclosure.ipTorBrowser scanPrivacy.disclosure.ipProxyExit scanPrivacy.disclosure.logsIndexer scanPrivacy.disclosure.logsRpc scanPrivacy.disclosure.rpcParty scanPrivacy.disclosure.rpc scanPrivacy.disclosure.indexerParty scanPrivacy.disclosure.indexer scanPrivacy.disclosure.proxyParty scanPrivacy.disclosure.proxy scanPrivacy.disclosure.torExitParty scanPrivacy.disclosure.torExit scanPrivacy.disclosure.torBrowserNotice scanPrivacy.disclosure.secondParty scanPrivacy.disclosure.secondWindowsFixed scanPrivacy.disclosure.secondWindowsExact scanPrivacy.disclosure.secondDirectIp scanPrivacy.disclosure.second scanPrivacy.disclosure.sweepParty scanPrivacy.disclosure.sweepAuto scanPrivacy.disclosure.sweepOnRequest scanPrivacy.disclosure.everyoneParty scanPrivacy.disclosure.everyone scanPrivacy.disclosure.everyonePrivate scanPrivacy.disclosure.firstUseNotice
