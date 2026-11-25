import {
  assertTestnetChain,
  MetadataHardeningError,
  parseEndpoint,
  randomInt,
  requireInput,
  type RandomSource,
} from './guard.js';
import { fail, isRecord, requireArray, requireFunction, requireRecord } from './validate.js';

/** Subset of an `eth_getLogs` filter relevant to privacy checks. */
export interface LogFilterLike {
  readonly address?: string | readonly string[];
  readonly topics?: readonly (string | readonly string[] | null)[];
}

const MAX_USER_ADDRESSES = 100_000;
const MAX_TOPIC_SLOTS = 8;
const MAX_TOPIC_OR_LIST = 1024;
const MAX_FILTER_ADDRESSES = 1024;
const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;
const TOPIC_HEX = /^0x[0-9a-fA-F]{0,64}$/;

/** 64-hex (32-byte) lowercase form of a user address, for topic comparison. */
function topicForm(address40: string): string {
  return '0'.repeat(24) + address40;
}

/** The caller's own addresses as lowercase 40-hex strings (no `0x`). Invalid entries are a caller bug. */
function ownedAddresses(list: unknown): Set<string> {
  requireArray(list, 'addresses', MAX_USER_ADDRESSES);
  const out = new Set<string>();
  for (const a of list) {
    requireInput(typeof a === 'string' && ADDRESS_HEX.test(a), 'address must be 20-byte hex');
    out.add(a.slice(2).toLowerCase());
  }
  return out;
}

/** Topic value as 64 lowercase hex digits when it is hex (short values left-padded, as an RPC would). */
function topicKey(v: string): string {
  return TOPIC_HEX.test(v) ? v.slice(2).toLowerCase().padStart(64, '0') : v.toLowerCase();
}

interface ParsedFilter {
  readonly addresses: readonly string[];
  /** One entry per topic slot: `null` for a wildcard, otherwise the or-list. */
  readonly topics: readonly (readonly string[] | null)[];
}

/** Validates the filter shape; `INVALID_INPUT` for anything an `eth_getLogs` filter could not be. */
function readFilter(filter: unknown): ParsedFilter {
  requireRecord(filter, 'filter');
  const { address, topics } = filter;
  let addresses: readonly string[] = [];
  if (address !== undefined) {
    const list = typeof address === 'string' ? [address] : address;
    requireArray(list, 'filter address', MAX_FILTER_ADDRESSES, 'INVALID_INPUT');
    requireInput(list.every((a) => typeof a === 'string'), 'filter address must be a string');
    addresses = list;
  }
  const slots: (readonly string[] | null)[] = [];
  if (topics !== undefined) {
    requireArray(topics, 'filter topics', MAX_TOPIC_SLOTS, 'INVALID_INPUT');
    for (const t of topics) {
      if (t === undefined || t === null) {
        slots.push(null);
        continue;
      }
      const vals = typeof t === 'string' ? [t] : t;
      requireArray(vals, 'topic', MAX_TOPIC_OR_LIST, 'INVALID_INPUT');
      requireInput(vals.every((v) => typeof v === 'string'), 'topic must be a string');
      slots.push(vals);
    }
  }
  return { addresses, topics: slots };
}

/** True when any address or topic of the parsed filter names one of `mine`. */
function namesOwned(f: ParsedFilter, mine: ReadonlySet<string>): boolean {
  if (f.addresses.some((a) => (ADDRESS_HEX.test(a) ? mine.has(a.slice(2).toLowerCase()) : false))) return true;
  const mine32 = new Set([...mine].map(topicForm));
  return f.topics.some((slot) => slot !== null && slot.some((v) => mine32.has(topicKey(v))));
}

/**
 * MH-SCAN-1 R1: no part of the `getLogs` filter may reference a user address.
 *
 * @remarks Spec R1 names `topic2`/`topic3`; this checks every place an address can appear (the
 * contract `address`, and every topic slot, padded or not, any case, in or-lists), a strict
 * superset: the announcer is never a user address, so there is no false positive.
 *
 * @param filter The `getLogs` filter about to be sent.
 * @param userAddresses Addresses the user owns (stealth or otherwise); 20-byte hex.
 * @param strict When true any topic2/topic3 constraint is rejected.
 * @throws {MetadataHardeningError} `POLICY_REJECTED`; `INVALID_INPUT` for a malformed filter or
 * address list. Messages never contain an address.
 */
export function assertNoUserAddressFilter(
  filter: LogFilterLike,
  userAddresses: readonly string[],
  strict = false,
): void {
  const mine = ownedAddresses(userAddresses);
  const parsed = readFilter(filter);
  if (strict && parsed.topics.some((slot, i) => i >= 2 && i <= 3 && slot !== null)) {
    throw new MetadataHardeningError('POLICY_REJECTED', 'topic2/topic3 filters are not allowed');
  }
  if (namesOwned(parsed, mine)) {
    throw new MetadataHardeningError('POLICY_REJECTED', 'log filter would reveal a user address');
  }
}

/** Largest request budget accepted: bounds the plan's memory and the scan's cost. */
const MAX_REQUESTS = 10_000;

/** Options for {@link alignedScanRange}. */
export interface AlignedScanOptions {
  readonly chainId: number;
  /** Block the scan logically needs to start from. */
  readonly wantedFrom: number;
  /** Chain head (inclusive end). */
  readonly head: number;
  /** Alignment grid, default 10 000. */
  readonly grid?: number;
  /** Extra random lookback of 0..N whole grids, default 1. */
  readonly maxExtraGrids?: number;
  /** `getLogsMaxRange`, default 1000. */
  readonly windowSize?: number;
  /** Request budget, default 50 (`logs.ts` `maxRequests`). */
  readonly maxRequests?: number;
}

/** Planned aligned scan. */
export interface AlignedScan {
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly windows: readonly { readonly from: number; readonly to: number }[];
  /** True when the budget cut the range short: the tail was NOT scanned. */
  readonly truncated: boolean;
  /** Results below this block are already known: discard locally (dedupe). */
  readonly discardBefore: number;
}

/**
 * MH-SCAN-2: aligns `fromBlock` down to a grid (plus random whole-grid lookback), so the RPC does
 * not learn the exact last-scanned block.
 *
 * @remarks Always scans forward from the aligned start in `windowSize` windows, at most
 * `maxRequests`. `truncated` is set honestly. Does NOT hide that this IP scans GhostPay
 * announcements. Cost: extra requests.
 */
export function alignedScanRange(opts: AlignedScanOptions, rng?: RandomSource): AlignedScan {
  requireRecord(opts, 'options');
  assertTestnetChain(opts.chainId);
  const grid = opts.grid ?? 10_000;
  const extra = opts.maxExtraGrids ?? 1;
  const windowSize = opts.windowSize ?? 1000;
  const maxRequests = opts.maxRequests ?? 50;
  requireInput(Number.isSafeInteger(grid) && grid >= 1, 'grid out of range');
  requireInput(Number.isSafeInteger(extra) && extra >= 0 && extra <= 100, 'lookback out of range');
  requireInput(Number.isSafeInteger(windowSize) && windowSize >= 1, 'window out of range');
  requireInput(Number.isSafeInteger(maxRequests) && maxRequests >= 1 && maxRequests <= MAX_REQUESTS, 'budget out of range');
  requireInput(Number.isSafeInteger(opts.wantedFrom) && opts.wantedFrom >= 0, 'wantedFrom out of range');
  requireInput(Number.isSafeInteger(opts.head) && opts.head >= opts.wantedFrom, 'head must be >= wantedFrom');
  const back = extra === 0 ? 0 : randomInt(extra + 1, rng);
  // `%` is exact on safe integers; `Math.floor(a / b) * b` can round up past `a` near 2^53.
  const fromBlock = Math.max(0, opts.wantedFrom - (opts.wantedFrom % grid) - back * grid);
  const windows: { from: number; to: number }[] = [];
  let cursor = fromBlock;
  while (cursor <= opts.head && windows.length < maxRequests) {
    const to = cursor + Math.min(windowSize - 1, opts.head - cursor);
    windows.push({ from: cursor, to });
    cursor = to + 1;
  }
  const last = windows[windows.length - 1] as { from: number; to: number };
  return {
    fromBlock,
    toBlock: last.to,
    windows,
    truncated: last.to < opts.head,
    discardBefore: opts.wantedFrom,
  };
}

/**
 * MH-SCAN-2 R2: drops logs older than `discardBefore` and logs already seen, keeping first sight.
 *
 * @param keyOf Stable unique key per log, e.g. `${txHash}:${logIndex}`.
 */
export function dedupeLogs<T extends { readonly blockNumber: number }>(
  logs: readonly T[],
  discardBefore: number,
  seen: Set<string>,
  keyOf: (l: T) => string,
): T[] {
  requireArray(logs, 'logs', MAX_LOGS);
  requireInput(Number.isSafeInteger(discardBefore) && discardBefore >= 0, 'discardBefore out of range');
  if (Object.prototype.toString.call(seen) !== '[object Set]') fail('seen must be a Set');
  requireFunction(keyOf, 'keyOf');
  // Validate and key every log first so a bad entry leaves `seen` untouched.
  const keyed: { log: T; key: string }[] = [];
  for (const l of logs) {
    requireInput(isRecord(l) && Number.isSafeInteger(l.blockNumber) && l.blockNumber >= 0, 'log needs a block number');
    let key: unknown;
    try {
      key = keyOf(l);
    } catch {
      throw new MetadataHardeningError('INVALID_INPUT', 'log key function failed');
    }
    requireInput(typeof key === 'string', 'log key must be a string');
    keyed.push({ log: l, key });
  }
  const out: T[] = [];
  for (const { log, key } of keyed) {
    if (log.blockNumber < discardBefore) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(log);
  }
  return out;
}

const MAX_LOGS = 1_000_000;

/** RPC role: `scan` = bulk range reads; `query` = anything tied to a specific address, plus broadcast. */
export type RpcRole = 'scan' | 'query';

const SCAN_METHODS: ReadonlySet<string> = new Set(['eth_getLogs', 'eth_blockNumber', 'eth_chainId']);

/**
 * MH-NET-1 R2: which endpoint a request must use. Unknown methods fail closed to `query`;
 * `eth_getLogs` goes to `scan` only when the filter names none of the user's addresses.
 */
export function roleForRequest(
  method: string,
  filter: LogFilterLike | undefined,
  userAddresses: readonly string[],
): RpcRole {
  const mine = ownedAddresses(userAddresses);
  if (typeof method !== 'string' || !SCAN_METHODS.has(method)) return 'query';
  if (method !== 'eth_getLogs' || filter === undefined) return 'scan';
  let parsed: ParsedFilter;
  try {
    parsed = readFilter(filter);
  } catch {
    return 'query'; // a filter we cannot read is never sent down the bulk-scan path
  }
  return namesOwned(parsed, mine) ? 'query' : 'scan';
}

/** Validated two-role RPC config. */
export interface RpcRoles {
  readonly scan: string;
  readonly query: string;
  /** False when both roles share one endpoint: no separation achieved. */
  readonly separated: boolean;
}

/**
 * MH-NET-1 R1: validates `{scan, query}` for a chain. Does NOT hide the IP from either provider;
 * a provider that sees both IPs can still join them. Errors never contain the URLs.
 */
export function validateRpcRoles(chainId: number, cfg: { scan: string; query: string }): RpcRoles {
  assertTestnetChain(chainId);
  requireRecord(cfg, 'rpc config');
  const scan = parseEndpoint(cfg.scan);
  const query = parseEndpoint(cfg.query);
  return { scan, query, separated: scan !== query };
}
