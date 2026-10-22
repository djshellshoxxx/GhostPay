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

function schemeTopic(id: bigint): Hex {
  return `0x${id.toString(16).padStart(64, '0')}`;
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
 * - Reorg check first: the stored block hash is compared with the chain; on mismatch (or a missing
 *   block) the cursor resets to genesis because one checkpoint cannot safely identify a deep fork.
 *   `reorg` tells the caller which stored results to drop.
 * - Ranges are at most `min(chain.getLogsMaxRange, opts.maxRange)`; a provider range error or an oversize
 *   response halves the window (down to one block) before giving up.
 * - A cursor more than `finalityDepth` blocks beyond the reported head is refused (`RPC_FAILURE`).
 * - Duplicate logs (same `blockHash:logIndex`) within a call are dropped.
 * - `maxRequests` bounds `eth_getLogs` calls (at most 50); `maxLogs` bounds accepted logs (at most
 *   10,000). Canonical event-block lookups have a separate 1,000-read cap. Window boundary checks
 *   add at most 50 reads before and 50 after completed pages, plus fixed head/checkpoint reads.
 *   Page/log caps end with `truncated: true` and a cursor after the last completed range.
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
  const maxRequests = Math.max(1, Math.min(MAX_REQUESTS_PER_FETCH, Number.isSafeInteger(o.maxRequests) ? (o.maxRequests as number) : MAX_REQUESTS_PER_FETCH));
  const maxLogs = Math.max(1, Math.min(MAX_LOGS_PER_FETCH, Number.isSafeInteger(o.maxLogs) ? (o.maxLogs as number) : MAX_LOGS_PER_FETCH));
  const cap = BigInt(Math.max(1, Math.min(o.maxRange ?? o.chain.getLogsMaxRange, o.chain.getLogsMaxRange)));
  const depth = BigInt(o.chain.finalityDepth);

  let next = o.cursor.nextBlock;
  let reorg: FetchResult['reorg'];
  if (o.cursor.last !== undefined) {
    const ref = await o.client.getBlock(o.cursor.last.number);
    if (ref === null || ref.hash.toLowerCase() !== o.cursor.last.hash.toLowerCase()) {
      // With only one persisted checkpoint we cannot locate a deep fork safely. Reset to genesis so a
      // reorg deeper than finalityDepth cannot leave an unscanned gap between the fork and this cursor.
      next = 0n;
      reorg = { rolledBackTo: 0n };
    }
  }

  const head = await o.client.blockNumber();
  if (head > MAX_PLAUSIBLE_HEAD) return fail('RPC_FAILURE', 'implausible chain head');
  // A cursor more than finalityDepth beyond the reported head is poisoned (earlier lying head) or the provider lies low:
  // fail closed rather than save a cursor that silently skips the real blocks.
  if (o.cursor.nextBlock - 1n > head + depth) return fail('RPC_FAILURE', 'cursor is ahead of the chain head; clear the checkpoint and rescan');
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
    try {
      logs = await o.client.getLogs({ address: o.announcer, topics: [ANNOUNCEMENT_TOPIC, schemeTopic(schemeId)], fromBlock: next, toBlock: to });
    } catch (e) {
      // A provider range error or a response over the client cap (announcer spam) both mean "ask for less".
      const tooBig = e instanceof ChainAdapterError && (e.code === 'RESPONSE_TOO_LARGE' || /json-rpc error -(32602|32005)/.test(e.message));
      if (tooBig && window > 1n) {
        window = window / 2n;
        windows.pop();
        canonical.delete(to);
        continue;
      }
      throw e;
    }
    const page: ScannedAnnouncement[] = [];
    const pageIds = new Set<string>();
    let pageSkipped = 0;
    for (const log of logs) {
      const a = validateAnnouncementLog(log, o.announcer, schemeId, next, to);
      if (a === undefined) {
        pageSkipped++;
      } else if (!seen.has(a.id) && !pageIds.has(a.id)) {
        page.push(a);
        pageIds.add(a.id);
      }
    }
    const remainingLogs = maxLogs - out.length;
    if (page.length > remainingLogs) {
      if (window > 1n) {
        window = window / 2n;
        windows.pop();
        continue;
      }
      return fail('RPC_FAILURE', 'accepted log cap exceeded within one block');
    }
    skipped += pageSkipped;
    for (const a of page) {
      let hash = canonical.get(a.blockNumber);
      if (hash === undefined) {
        if (canonicalBlockReads >= MAX_CANONICAL_BLOCK_READS) {
          return fail('RPC_FAILURE', 'canonical log block read cap reached');
        }
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
      if (current !== null && current.hash.toLowerCase() === w.hash.toLowerCase()) continue;
      const previous = windows[i - 1];
      const anchor = previous !== undefined ? { number: previous.to, hash: previous.hash } : (reorg === undefined ? o.cursor.last : undefined);
      const rollback = reorg?.rolledBackTo ?? w.from;
      const cursor: ScanCursor = anchor === undefined ? { nextBlock: w.from } : { nextBlock: w.from, last: anchor };
      return {
        announcements: out.filter((a) => a.blockNumber < w.from),
        cursor,
        truncated: true,
        skipped,
        reorg: { rolledBackTo: rollback < w.from ? rollback : w.from },
      };
    }
    last = { number: doneThrough, hash: ref.hash };
  }
  const cursor: ScanCursor = last === undefined ? { nextBlock: next } : { nextBlock: next, last };
  return finish({ announcements: out, cursor, truncated, skipped }, reorg);
}

function finish(r: Omit<FetchResult, 'reorg'>, reorg: FetchResult['reorg']): FetchResult {
  return reorg === undefined ? r : { ...r, reorg };
}
