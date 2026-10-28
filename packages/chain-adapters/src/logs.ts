import { parseCompressedPoint, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { decodeAbiParameters, encodeAbiParameters, getAddress, hexToBytes, keccak256, toBytes } from 'viem/utils';
import type { ChainConfig } from './config/chains.js';
import { fail, ChainAdapterError } from './errors.js';
import { parseQuantity, type RpcClient, type RpcLog } from './rpc.js';
import type { Address, Hex } from './types.js';

/** `keccak256("Announcement(uint256,address,address,bytes,bytes)")`: ERC-5564 topic 0. */
export const ANNOUNCEMENT_TOPIC: Hex = keccak256(toBytes('Announcement(uint256,address,address,bytes,bytes)'));

/** A validated announcement plus chain position. Assignable to core-crypto's `PublicAnnouncement`. */
export interface ScannedAnnouncement extends PublicAnnouncement {
  readonly schemeId: bigint;
  readonly stealthAddress: Address;
  /** Address that called `announce` (the router for GhostPay payments). */
  readonly caller: Address;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly logIndex: number;
  /** Validated transaction hash when supplied by the provider; never proof of payment by itself. */
  readonly transactionHash?: Hex;
  /** Stable dedupe key `blockHash:logIndex`. */
  readonly id: string;
}

/** Persistable scan position. */
export interface ScanCursor {
  /** First block that has not yet been fetched. */
  readonly nextBlock: bigint;
  /** Last fully processed block and its hash, used to detect reorgs. */
  readonly last?: { readonly number: bigint; readonly hash: Hex };
}

/** Options for {@link fetchAnnouncements}. */
export interface FetchOptions {
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  /** Announcer from the verified deployment manifest. */
  readonly announcer: Address;
  readonly cursor: ScanCursor;
  /** Inclusive upper bound; defaults to the reported head. */
  readonly toBlock?: bigint;
  /** ERC-5564 scheme id filter, default 1n. */
  readonly schemeId?: bigint;
  /** Upper bound of `eth_getLogs` calls in one invocation, default 50. */
  readonly maxRequests?: number;
  /** Stop after this many accepted logs, default 10 000. */
  readonly maxLogs?: number;
  /** Smaller range cap than the chain default (never larger). */
  readonly maxRange?: number;
  /**
   * Router from the verified deployment manifest. A single block whose announcer logs exceed the response or
   * accepted-log cap (announcer spam) is then scanned for this caller only and reported in `routerOnlyBlocks`.
   * Without it such a block fails the fetch, so nothing is skipped silently.
   */
  readonly router?: Address;
}

/** Result of one {@link fetchAnnouncements} call. */
export interface FetchResult {
  readonly announcements: readonly ScannedAnnouncement[];
  readonly cursor: ScanCursor;
  /** True when work stopped at a cap before reaching the chain head. */
  readonly truncated: boolean;
  /** Set when a reorg was detected: drop any previously stored announcements with `blockNumber >= rolledBackTo`. */
  readonly reorg?: { readonly rolledBackTo: bigint };
  /** Count of logs from the announcer that failed on-chain-content validation and were skipped. */
  readonly skipped: number;
  /**
   * Blocks whose full announcer response exceeded a cap: only announcements posted by `router` were fetched and
   * returned for them; any other announcement in these blocks was NOT scanned. Absent when there were none.
   */
  readonly routerOnlyBlocks?: readonly bigint[];
}

const HASH = /^0x[0-9a-f]{64}$/;
/** Values above this bound are not a plausible EVM head and can drive a hostile, effectively endless scan. */
export const MAX_PLAUSIBLE_HEAD = 10_000_000_000n;
const MAX_REQUESTS_PER_FETCH = 50;
const MAX_LOGS_PER_FETCH = 10_000;
// Ancillary eth_getBlockByNumber reads do not consume the eth_getLogs page budget. A fetch
// performs at most 1,000 distinct event-block lookups, plus the bounded window checks and fixed
// head/checkpoint reads documented below.
const MAX_CANONICAL_BLOCK_READS = 1_000;
// JSON-RPC codes providers use for eth_getLogs range or result limits (Alchemy, QuickNode and reth -32602; Infura, Besu
// and Nethermind -32005; others -32600, -32614 or the generic -32000). Any of them only means "ask for a smaller range".
const RANGE_LIMIT = /^RPC_FAILURE: json-rpc error -(32602|32005|32600|32614|32000)$/;
// The subset that also means "this response is too large", so a single block is retried for the router lane only.
const SIZE_LIMIT = /^RPC_FAILURE: json-rpc error -(32602|32005)$/;

function schemeTopic(id: bigint): Hex {
  return `0x${id.toString(16).padStart(64, '0')}`;
}

/** The 32-byte topic form of an address (lowercase), as used for the `caller` filter. */
function addressTopic(a: Address): Hex {
  return `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
}

/**
 * Whether an `eth_getLogs` failure means "ask for less": a response over the client's size cap or a provider range or
 * result limit. Shared with callers that wrap the client (windowed scan clients, provider comparison).
 *
 * @param e Thrown value.
 * @returns True for a size or range limit.
 */
export function isLogLimitError(e: unknown): boolean {
  return e instanceof ChainAdapterError && (e.code === 'RESPONSE_TOO_LARGE' || RANGE_LIMIT.test(e.message));
}

/**
 * Whether an `eth_getLogs` failure says the response itself is too large (not merely the range), so that a single
 * block may be re-queried for router-posted announcements only.
 *
 * @param e Thrown value.
 * @returns True for a response size or result-count limit.
 */
export function isLogSizeError(e: unknown): boolean {
  return e instanceof ChainAdapterError && (e.code === 'RESPONSE_TOO_LARGE' || SIZE_LIMIT.test(e.message));
}

/**
 * The filter for router-posted announcements only: `topics[3]` is the ERC-5564 `caller`, the public manifest router.
 *
 * @param schemeId Scheme id.
 * @param router Manifest router.
 * @returns Topic list for `eth_getLogs`.
 */
export function routerAnnouncementTopics(schemeId: bigint, router: Address): readonly (Hex | null)[] {
  return [ANNOUNCEMENT_TOPIC, schemeTopic(schemeId), null, addressTopic(router)];
}

/** Raw `topics[3]` of a log in lowercase, or undefined. */
export function rawCallerTopic(log: RpcLog): string | undefined {
  const topics: unknown = typeof log === 'object' && log !== null ? log.topics : undefined;
  const t: unknown = Array.isArray(topics) ? topics[3] : undefined;
  return typeof t === 'string' ? t.toLowerCase() : undefined;
}

function topicAddress(t: string): Address | undefined {
  if (!/^0x0{24}[0-9a-f]{40}$/.test(t)) return undefined;
  return getAddress(`0x${t.slice(26)}`);
}

/**
 * Validates one raw log.
 *
 * @remarks Two classes of failure. PROVIDER faults (wrong emitter, wrong topic 0 or scheme topic,
 * removed flag, block outside the requested range, malformed block hash / index) throw
 * `INVALID_LOG`: the response cannot be trusted. CONTENT faults (anyone may call the announcer with
 * garbage: not 4 topics, undecodable or non-canonical data, ephemeral key not a valid 33-byte
 * compressed point, empty metadata) return `undefined` so one hostile announcement cannot halt a scan.
 *
 * @param log Raw log.
 * @param announcer Expected emitter.
 * @param schemeId Expected scheme.
 * @param from Requested range start (inclusive).
 * @param to Requested range end (inclusive).
 * @returns The announcement or `undefined` when skipped.
 * @throws {ChainAdapterError} `INVALID_LOG`.
 */
export function validateAnnouncementLog(
  log: RpcLog,
  announcer: Address,
  schemeId: bigint,
  from: bigint,
  to: bigint,
): ScannedAnnouncement | undefined {
  if (typeof log !== 'object' || log === null) return fail('INVALID_LOG', 'not an object');
  if (typeof log.address !== 'string' || log.address.toLowerCase() !== announcer.toLowerCase()) return fail('INVALID_LOG', 'wrong emitter');
  if (log.removed === true) return fail('INVALID_LOG', 'removed log');
  const rawTopics: unknown = log.topics;
  if (!Array.isArray(rawTopics) || rawTopics.some((t) => typeof t !== 'string')) return fail('INVALID_LOG', 'topics');
  const topics = (rawTopics as string[]).map((t) => t.toLowerCase());
  if (topics[0] !== ANNOUNCEMENT_TOPIC) return fail('INVALID_LOG', 'wrong topic0');
  if (topics[1] !== schemeTopic(schemeId)) return fail('INVALID_LOG', 'wrong scheme topic');
  let blockNumber: bigint;
  let logIndex: bigint;
  try {
    blockNumber = parseQuantity(log.blockNumber);
    logIndex = parseQuantity(log.logIndex);
  } catch {
    return fail('INVALID_LOG', 'position fields');
  }
  if (blockNumber < from || blockNumber > to) return fail('INVALID_LOG', 'block outside requested range');
  if (typeof log.blockHash !== 'string' || !HASH.test(log.blockHash) || logIndex > 0xffffffn) return fail('INVALID_LOG', 'position fields');

  // ---- content (attacker-controlled) from here: skip instead of throw ----
  if (topics.length !== 4) return undefined;
  const stealth = topicAddress(topics[2] as string);
  const caller = topicAddress(topics[3] as string);
  if (stealth === undefined || caller === undefined) return undefined;
  if (typeof log.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(log.data)) return undefined;
  let eph: Hex;
  let metadata: Hex;
  try {
    const [e, m] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log.data as Hex);
    if (encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [e, m]).toLowerCase() !== log.data.toLowerCase()) return undefined;
    eph = e;
    metadata = m;
  } catch {
    return undefined;
  }
  if (eph.length !== 2 + 66 || metadata.length < 4) return undefined;
  try {
    parseCompressedPoint(hexToBytes(eph));
  } catch {
    return undefined;
  }
  const index = Number(logIndex);
  const txHash = typeof log.transactionHash === 'string' && HASH.test(log.transactionHash) ? (log.transactionHash as Hex) : undefined;
  return {
    schemeId,
    stealthAddress: stealth,
    ephemeralPublicKey: eph,
    metadata,
    caller,
    blockNumber,
    blockHash: log.blockHash as Hex,
    logIndex: index,
    ...(txHash === undefined ? {} : { transactionHash: txHash }),
    id: `${log.blockHash}:${String(index)}`,
  };
}

/**
 * Fetches announcements from `cursor.nextBlock` towards the chain head with reorg handling.
 *
 * @remarks
 * - Reorg check first: the stored block hash is compared with the chain; on a mismatch the cursor resets
 *   to genesis because one checkpoint cannot safely identify a deep fork. `reorg` tells the caller which
 *   stored results to re-check. A checkpoint (or processed window end) the provider does not return is
 *   an `RPC_FAILURE` to retry later, never a reorg: a lagging or load-balanced node must not roll back history.
 * - Ranges are at most `min(chain.getLogsMaxRange, opts.maxRange)`; a provider range or result limit, or a
 *   response over the client's size cap, halves the window down to one block. A single block that is still
 *   too large (announcer spam) is re-queried for `opts.router`'s announcements only and listed in
 *   `routerOnlyBlocks`; without a router it ends the fetch at the last completed window, or fails if none.
 * - A cursor more than `finalityDepth` blocks beyond the reported head is refused (`RPC_FAILURE`).
 * - Duplicate logs (same `blockHash:logIndex`) within a call are dropped.
 * - `maxRequests` bounds `eth_getLogs` calls (at most 50); `maxLogs` bounds accepted logs (at most
 *   10,000). Canonical event-block lookups have a separate 1,000-read cap. Window boundary checks
 *   add at most 50 reads before and 50 after completed pages, plus fixed head/checkpoint reads.
 *   Every cap ends the fetch with `truncated: true` and a cursor after the last completed range, so a
 *   later fetch resumes there; a single block over the accepted-log cap keeps only its router lane.
 * - The new cursor stores the hash of the last processed block, re-read after the logs.
 *
 * @param o Options.
 * @returns Announcements, new cursor and flags.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` (client on another chain), `INVALID_LOG`, `RPC_FAILURE`.
 */
export async function fetchAnnouncements(o: FetchOptions): Promise<FetchResult> {
  if (o.client.chainId !== o.chain.chainId) return fail('CHAIN_MISMATCH', 'client chain differs from scan chain');
  if (typeof o.cursor.nextBlock !== 'bigint' || o.cursor.nextBlock < 0n ||
      (o.toBlock !== undefined && (typeof o.toBlock !== 'bigint' || o.toBlock < 0n))) {
    return fail('INVALID_INPUT', 'invalid scan range');
  }
  const schemeId = o.schemeId ?? 1n;
  const routerTopic = o.router === undefined ? undefined : addressTopic(o.router);
  const maxRequests = Math.max(1, Math.min(MAX_REQUESTS_PER_FETCH, Number.isSafeInteger(o.maxRequests) ? (o.maxRequests as number) : MAX_REQUESTS_PER_FETCH));
  const maxLogs = Math.max(1, Math.min(MAX_LOGS_PER_FETCH, Number.isSafeInteger(o.maxLogs) ? (o.maxLogs as number) : MAX_LOGS_PER_FETCH));
  const cap = BigInt(Math.max(1, Math.min(o.maxRange ?? o.chain.getLogsMaxRange, o.chain.getLogsMaxRange)));
  const depth = BigInt(o.chain.finalityDepth);

  let next = o.cursor.nextBlock;
  let reorg: FetchResult['reorg'];
  const checkpoint = o.cursor.last === undefined ? undefined : await o.client.getBlock(o.cursor.last.number);
  if (checkpoint != null && checkpoint.hash.toLowerCase() !== o.cursor.last?.hash.toLowerCase()) {
    // With only one persisted checkpoint we cannot locate a deep fork safely. Reset to genesis so a
    // reorg deeper than finalityDepth cannot leave an unscanned gap between the fork and this cursor.
    next = 0n;
    reorg = { rolledBackTo: 0n };
  }

  const head = await o.client.blockNumber();
  if (head > MAX_PLAUSIBLE_HEAD) return fail('RPC_FAILURE', 'implausible chain head');
  // A cursor more than finalityDepth beyond the reported head is poisoned (earlier lying head) or the provider lies low:
  // fail closed rather than save a cursor that silently skips the real blocks.
  if (o.cursor.nextBlock - 1n > head + depth) return fail('RPC_FAILURE', 'cursor is ahead of the chain head; clear the checkpoint and rescan');
  // A provider that cannot return the checkpoint block (lagging, pruned or load-balanced) is unavailable, not
  // evidence of a fork: retry later and invalidate nothing.
  if (checkpoint === null) return fail('RPC_FAILURE', 'checkpoint block unavailable');
  const end = o.toBlock !== undefined && o.toBlock < head ? o.toBlock : head;
  const headRef = end === head ? await o.client.getBlock(head) : null;
  if (end === head && headRef === null) return fail('RPC_FAILURE', 'chain head block unavailable');
  const out: ScannedAnnouncement[] = [];
  const seen = new Set<string>();
  const canonical = new Map<bigint, string>();
  const windows: { from: bigint; to: bigint; hash: Hex }[] = [];
  let canonicalBlockReads = 0;
  let skipped = 0;
  let requests = 0;
  let window = cap;
  let doneThrough = next - 1n;
  let processed = false;
  let truncated = false;
  const routerOnly: bigint[] = [];

  while (next <= end) {
    if (requests >= maxRequests || out.length >= maxLogs) {
      truncated = true;
      break;
    }
    const to = next + window - 1n > end ? end : next + window - 1n;
    requests++;
    const boundary = to === head ? headRef : await o.client.getBlock(to);
    if (boundary === null) return fail('RPC_FAILURE', 'window boundary block unavailable');
    windows.push({ from: next, to, hash: boundary.hash });
    canonical.set(to, boundary.hash.toLowerCase());
    let logs: readonly RpcLog[];
    let routerLane = false;
    try {
      logs = await o.client.getLogs({ address: o.announcer, topics: [ANNOUNCEMENT_TOPIC, schemeTopic(schemeId)], fromBlock: next, toBlock: to });
    } catch (e) {
      // A provider range or result limit, or a response over the client cap (announcer spam), means "ask for less".
      if (!isLogLimitError(e)) throw e;
      const routerFallback = window === 1n && o.router !== undefined && isLogSizeError(e);
      if (!routerFallback || requests >= maxRequests) {
        windows.pop();
        canonical.delete(to);
        if (window > 1n) {
          window = window / 2n;
          continue;
        }
        // One block still fails and its router lane cannot be fetched: keep the completed windows, or fail.
        if (!processed && !routerFallback) throw e;
        truncated = true;
        break;
      }
      // One block is still too large (announcer spam). Never drop a GhostPay payment silently: fetch only the
      // router's announcements for it and report the block as scanned for the router lane only.
      requests++;
      try {
        logs = await o.client.getLogs({ address: o.announcer, topics: routerAnnouncementTopics(schemeId, o.router), fromBlock: next, toBlock: to });
      } catch (routerError) {
        // Even the router lane is too large: keep the completed windows; the scan cannot pass this block.
        if (!processed) throw routerError;
        windows.pop();
        canonical.delete(to);
        truncated = true;
        break;
      }
      // The provider must honour the caller filter; anything else is a provider fault.
      if (logs.some((l) => rawCallerTopic(l) !== routerTopic)) return fail('INVALID_LOG', 'log outside the requested caller filter');
      routerLane = true;
    }
    let { page, pageSkipped } = acceptPage(logs, o.announcer, schemeId, next, to, seen);
    const remainingLogs = maxLogs - out.length;
    if (page.length > remainingLogs) {
      if (window > 1n) {
        window = window / 2n;
        windows.pop();
        continue;
      }
      if (processed) {
        // Keep the completed windows; the next fetch starts at this block with the whole log budget.
        windows.pop();
        truncated = true;
        break;
      }
      if (routerTopic !== undefined && !routerLane) {
        // This block alone exceeds the accepted-log cap: keep its router lane, as for an oversized response.
        ({ page, pageSkipped } = acceptPage(logs.filter((l) => rawCallerTopic(l) === routerTopic), o.announcer, schemeId, next, to, seen));
        routerLane = true;
      }
      if (page.length > remainingLogs) return fail('RPC_FAILURE', 'accepted log cap exceeded within one block');
    }
    const reads = new Set<bigint>();
    for (const a of page) if (!canonical.has(a.blockNumber)) reads.add(a.blockNumber);
    if (canonicalBlockReads + reads.size > MAX_CANONICAL_BLOCK_READS) {
      // Before any read: stop after the completed windows. Only a window wider than the read cap can need more
      // reads than the cap on its own (nothing was read yet), so shrinking it always makes progress.
      windows.pop();
      if (processed) {
        truncated = true;
        break;
      }
      window = window / 2n;
      continue;
    }
    skipped += pageSkipped;
    for (const a of page) {
      let hash = canonical.get(a.blockNumber);
      if (hash === undefined) {
        const block = await o.client.getBlock(a.blockNumber);
        if (block === null) return fail('RPC_FAILURE', 'log block unavailable');
        hash = block.hash.toLowerCase();
        canonical.set(a.blockNumber, hash);
        canonicalBlockReads++;
      }
      if (hash !== a.blockHash.toLowerCase()) return fail('RPC_FAILURE', 'log block hash differs from canonical block');
      seen.add(a.id);
      out.push(a);
    }
    if (routerLane) routerOnly.push(next);
    doneThrough = to;
    processed = true;
    next = to + 1n;
  }

  let last = reorg === undefined ? o.cursor.last : undefined;
  if (processed) {
    const ref = await o.client.getBlock(doneThrough);
    if (ref === null) return fail('RPC_FAILURE', 'processed block vanished');
    if (doneThrough === head && headRef !== null && ref.hash.toLowerCase() !== headRef.hash.toLowerCase()) {
      return fail('RPC_FAILURE', 'chain reorganised during scan; retry');
    }
    // Recheck every processed window end. Checking only the head misses a fork in a truncated or
    // bounded scan and can persist a fresh cursor hash alongside stale logs from the old fork.
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i] as { from: bigint; to: bigint; hash: Hex };
      const current = w.to === doneThrough ? ref : await o.client.getBlock(w.to);
      if (current === null) return fail('RPC_FAILURE', 'window block unavailable');
      if (current.hash.toLowerCase() === w.hash.toLowerCase()) continue;
      const previous = windows[i - 1];
      const anchor = previous !== undefined ? { number: previous.to, hash: previous.hash } : (reorg === undefined ? o.cursor.last : undefined);
      const rollback = reorg?.rolledBackTo ?? w.from;
      const cursor: ScanCursor = anchor === undefined ? { nextBlock: w.from } : { nextBlock: w.from, last: anchor };
      const kept = routerOnly.filter((b) => b < w.from);
      return {
        announcements: out.filter((a) => a.blockNumber < w.from),
        cursor,
        truncated: true,
        skipped,
        reorg: { rolledBackTo: rollback < w.from ? rollback : w.from },
        ...(kept.length === 0 ? {} : { routerOnlyBlocks: kept }),
      };
    }
    last = { number: doneThrough, hash: ref.hash };
  }
  const cursor: ScanCursor = last === undefined ? { nextBlock: next } : { nextBlock: next, last };
  return finish({ announcements: out, cursor, truncated, skipped, ...(routerOnly.length === 0 ? {} : { routerOnlyBlocks: routerOnly }) }, reorg);
}

/** Validates one page of raw logs: accepted announcements not seen before (deduplicated) and the skipped count. */
function acceptPage(logs: readonly RpcLog[], announcer: Address, schemeId: bigint, from: bigint, to: bigint, seen: ReadonlySet<string>): { page: ScannedAnnouncement[]; pageSkipped: number } {
  const page: ScannedAnnouncement[] = [];
  const pageIds = new Set<string>();
  let pageSkipped = 0;
  for (const log of logs) {
    const a = validateAnnouncementLog(log, announcer, schemeId, from, to);
    if (a === undefined) {
      pageSkipped++;
    } else if (!seen.has(a.id) && !pageIds.has(a.id)) {
      page.push(a);
      pageIds.add(a.id);
    }
  }
  return { page, pageSkipped };
}

function finish(r: Omit<FetchResult, 'reorg'>, reorg: FetchResult['reorg']): FetchResult {
  return reorg === undefined ? r : { ...r, reorg };
}
