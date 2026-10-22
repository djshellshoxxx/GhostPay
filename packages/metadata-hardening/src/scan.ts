import {
  assertTestnetChain,
  MetadataHardeningError,
  parseEndpoint,
  randomInt,
  requireInput,
  type RandomSource,
} from './guard.js';

/** Subset of an `eth_getLogs` filter relevant to privacy checks. */
export interface LogFilterLike {
  readonly address?: string | readonly string[];
  readonly topics?: readonly (string | readonly string[] | null)[];
}

function pad32(addr: string): string {
  return '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/**
 * MH-SCAN-1 R1: no `topic2`/`topic3` filter may reference a user address.
 *
 * @param filter The `getLogs` filter about to be sent.
 * @param userAddresses Addresses the user owns (stealth or otherwise); 20-byte hex.
 * @param strict When true any topic2/topic3 constraint is rejected.
 * @throws {MetadataHardeningError} `POLICY_REJECTED`.
 */
export function assertNoUserAddressFilter(
  filter: LogFilterLike,
  userAddresses: readonly string[],
  strict = false,
): void {
  const mine = new Set(userAddresses.map(pad32));
  for (const idx of [2, 3]) {
    const t = filter.topics?.[idx];
    if (t === undefined || t === null) continue;
    if (strict) throw new MetadataHardeningError('POLICY_REJECTED', 'topic2/topic3 filters are not allowed');
    const vals = typeof t === 'string' ? [t] : t;
    if (vals.some((v) => mine.has(v.toLowerCase()))) {
      throw new MetadataHardeningError('POLICY_REJECTED', 'log filter would reveal a user address');
    }
  }
}

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
  assertTestnetChain(opts.chainId);
  const grid = opts.grid ?? 10_000;
  const extra = opts.maxExtraGrids ?? 1;
  const windowSize = opts.windowSize ?? 1000;
  const maxRequests = opts.maxRequests ?? 50;
  requireInput(Number.isSafeInteger(grid) && grid >= 1, 'grid out of range');
  requireInput(Number.isSafeInteger(extra) && extra >= 0 && extra <= 100, 'lookback out of range');
  requireInput(Number.isSafeInteger(windowSize) && windowSize >= 1, 'window out of range');
  requireInput(Number.isSafeInteger(maxRequests) && maxRequests >= 1, 'budget out of range');
  requireInput(Number.isSafeInteger(opts.wantedFrom) && opts.wantedFrom >= 0, 'wantedFrom out of range');
  requireInput(Number.isSafeInteger(opts.head) && opts.head >= opts.wantedFrom, 'head must be >= wantedFrom');
  const back = extra === 0 ? 0 : randomInt(extra + 1, rng);
  const fromBlock = Math.max(0, Math.floor(opts.wantedFrom / grid) * grid - back * grid);
  const windows: { from: number; to: number }[] = [];
  let cursor = fromBlock;
  while (cursor <= opts.head && windows.length < maxRequests) {
    const to = Math.min(cursor + windowSize - 1, opts.head);
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
  const out: T[] = [];
  for (const l of logs) {
    if (l.blockNumber < discardBefore) continue;
    const k = keyOf(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

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
  if (!SCAN_METHODS.has(method)) return 'query';
  if (method !== 'eth_getLogs' || filter === undefined) return 'scan';
  const mine = new Set(userAddresses.map((a) => a.toLowerCase()));
  const mine32 = new Set(userAddresses.map(pad32));
  const addrs = filter.address === undefined ? [] : typeof filter.address === 'string' ? [filter.address] : filter.address;
  if (addrs.some((a) => mine.has(a.toLowerCase()))) return 'query';
  for (const t of filter.topics ?? []) {
    if (t === null) continue;
    const vals = typeof t === 'string' ? [t] : t;
    if (vals.some((v) => mine32.has(v.toLowerCase()))) return 'query';
  }
  return 'scan';
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
  const scan = parseEndpoint(cfg.scan);
  const query = parseEndpoint(cfg.query);
  return { scan, query, separated: scan !== query };
}
