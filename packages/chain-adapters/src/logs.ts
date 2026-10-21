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
  /** Stable dedupe key `blockHash:logIndex`. */
  readonly id: string;
}

/** Persistable scan position. */
export interface ScanCursor {
  /** First block that has not yet been fetched. */
  readonly nextBlock: bigint;
  /** Last fully processed block and its hash, used to detect reorgs. */
  readonly last?: { readonly number: bigint; readonly hash: Hex };
  /**
   * Optional older checkpoints (ascending by block number), recorded only when `FetchOptions.historySize > 0`.
   * They let a resume find the deepest still-canonical checkpoint and so detect and roll back reorgs deeper
   * than `finalityDepth`. Consumers that persist only `nextBlock`/`last` simply lose this extra protection.
   */
  readonly history?: readonly { readonly number: bigint; readonly hash: Hex }[];
}

/** Options for {@link fetchAnnouncements}. */
export interface FetchOptions {
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  /** Announcer from the verified deployment manifest. */
  readonly announcer: Address;
  readonly cursor: ScanCursor;
  /** Inclusive upper block bound; the scan never requests logs above it (default: chain head). */
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
   * Cross-check the `blockHash` of every accepted log against the canonical block at that height
   * (S3-14 / CA-14). Default `false` (opt-in: the cost is extra RPC load and a stricter provider contract); costs one `eth_getBlockByNumber` per distinct block that carries an
   * accepted log (window end blocks are free). A mismatch throws `RPC_FAILURE`.
   */
  readonly verifyLogBlocks?: boolean;
  /**
   * Number of block-hash checkpoints (0..64) kept in `cursor.history`, default 0 (off). With a history a reorg
   * deeper than `finalityDepth` is still detected and the cursor rewinds to the newest checkpoint that is
   * still canonical (or below the oldest one when none is).
   */
  readonly historySize?: number;
}

/**
 * Upper bound for a plausible chain head. 10^10 blocks is ~80 years at 4 blocks/s, so a larger value
 * comes from a hostile or broken provider (it would otherwise drive an effectively endless scan).
 */
export const MAX_PLAUSIBLE_HEAD = 10_000_000_000n;
const MAX_HISTORY = 64;

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
  return {
    schemeId,
    stealthAddress: stealth,
    ephemeralPublicKey: eph,
    metadata,
    caller,
    blockNumber,
    blockHash: log.blockHash as Hex,
    logIndex: index,
    id: `${log.blockHash}:${String(index)}`,
  };
}

/**
 * Fetches announcements from `cursor.nextBlock` towards the chain head with reorg handling.
 *
 * @remarks
 * - Reorg check first: the stored block hash is compared with the chain; on mismatch (or a missing
 *   block) the cursor rolls back by `chain.finalityDepth` blocks (never below 0) and `reorg` tells
 *   the caller which stored results to drop.
 * - Ranges are at most `min(chain.getLogsMaxRange, opts.maxRange)`; a provider range error halves the
 *   window (down to one block) before giving up.
 * - Every window's end-block hash is read before its logs and re-verified before returning: a reorg inside
 *   the scanned span (also in a truncated multi-request call) yields `reorg` with the first affected
 *   window's start, drops that window's and later results, and returns a cursor positioned there.
 * - Duplicate logs (same `blockHash:logIndex`) within a call are dropped.
 * - Caps (`maxRequests`, `maxLogs`) end the call with `truncated: true` and a cursor that resumes
 *   exactly after the last completed range, so nothing is skipped.
 * - The new cursor stores the hash of the last processed block, re-read after the logs.
 *
 * @param o Options.
 * @returns Announcements, new cursor and flags.
 * @throws {ChainAdapterError} `CHAIN_MISMATCH` (client on another chain), `INVALID_LOG`, `RPC_FAILURE`.
 */
export async function fetchAnnouncements(o: FetchOptions): Promise<FetchResult> {
  if (o.client.chainId !== o.chain.chainId) return fail('CHAIN_MISMATCH', 'client chain differs from scan chain');
  const schemeId = o.schemeId ?? 1n;
  const maxRequests = o.maxRequests ?? 50;
  const maxLogs = o.maxLogs ?? 10_000;
  const cap = BigInt(Math.max(1, Math.min(o.maxRange ?? o.chain.getLogsMaxRange, o.chain.getLogsMaxRange)));
  const depth = BigInt(o.chain.finalityDepth);

  let next = o.cursor.nextBlock;
  let reorg: FetchResult['reorg'];
  /** Checkpoints still canonical after the resume check (only used to extend the history). */
  let keptHistory: { number: bigint; hash: Hex }[] = [];
  const histSize = Math.max(0, Math.min(Number.isInteger(o.historySize) ? (o.historySize as number) : 0, MAX_HISTORY));
  if (o.cursor.last !== undefined) {
    const stored = [...(o.cursor.history ?? []), o.cursor.last]
      .filter((c, i, a) => a.findIndex((d) => d.number === c.number) === i)
      .sort((a, b) => (a.number < b.number ? -1 : 1))
      .slice(-(MAX_HISTORY + 1));
    const newest = stored[stored.length - 1] as { number: bigint; hash: Hex };
    const ref = await o.client.getBlock(newest.number);
    if (ref !== null && ref.hash.toLowerCase() === newest.hash.toLowerCase()) {
      keptHistory = stored;
    } else {
      // Newest checkpoint is gone: walk back to the deepest-known canonical one.
      let matched: { number: bigint; hash: Hex } | undefined;
      let idx = stored.length - 2;
      for (; idx >= 0; idx--) {
        const c = stored[idx] as { number: bigint; hash: Hex };
        const r = await o.client.getBlock(c.number);
        if (r !== null && r.hash.toLowerCase() === c.hash.toLowerCase()) {
          matched = c;
          break;
        }
      }
      const oldest = stored[0] as { number: bigint; hash: Hex };
      const base = matched === undefined ? oldest.number : newest.number;
      const byDepth = base >= depth ? base - depth + 1n : 0n;
      next = matched === undefined ? byDepth : matched.number + 1n < byDepth ? matched.number + 1n : byDepth;
      reorg = { rolledBackTo: next };
      keptHistory = stored.filter((c) => c.number < next);
    }
  }

  const head = await o.client.blockNumber();
  if (head > MAX_PLAUSIBLE_HEAD) return fail('RPC_FAILURE', 'implausible chain head');
  // A canonical checkpoint above the reported head means the provider contradicts itself (or went backwards).
  if (reorg === undefined && o.cursor.last !== undefined && head < o.cursor.last.number) {
    return fail('RPC_FAILURE', 'chain head is behind the verified checkpoint');
  }
  const headRef = await o.client.getBlock(head);
  if (headRef === null) return fail('RPC_FAILURE', 'chain head block unavailable');
  const end = o.toBlock !== undefined && o.toBlock < head ? o.toBlock : head;
  const verifyLogs = o.verifyLogBlocks === true;
  const canonical = new Map<bigint, string>();
  const out: ScannedAnnouncement[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let requests = 0;
  let window = cap;
  let doneThrough = next - 1n;
  let processed = false;
  let truncated = false;
  /** Boundary hash of every window, read BEFORE its logs: re-verified before returning (reorg inside the span). */
  const windows: { from: bigint; to: bigint; hash: Hex }[] = [];

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
      if (e instanceof ChainAdapterError && /json-rpc error -(32602|32005)/.test(e.message) && window > 1n) {
        window = window / 2n;
        windows.pop();
        continue;
      }
      throw e;
    }
    for (const log of logs) {
      const a = validateAnnouncementLog(log, o.announcer, schemeId, next, to);
      if (a === undefined) {
        skipped++;
      } else if (!seen.has(a.id)) {
        if (verifyLogs) {
          let known = canonical.get(a.blockNumber);
          if (known === undefined) {
            const b = await o.client.getBlock(a.blockNumber);
            if (b === null) return fail('RPC_FAILURE', 'log block unavailable');
            known = b.hash.toLowerCase();
            canonical.set(a.blockNumber, known);
          }
          if (known !== a.blockHash.toLowerCase()) return fail('RPC_FAILURE', 'log block hash differs from canonical block');
        }
        seen.add(a.id);
        out.push(a);
      }
    }
    doneThrough = to;
    processed = true;
    next = to + 1n;
  }

  let last = reorg === undefined ? o.cursor.last : undefined;
  let newHistory: { number: bigint; hash: Hex }[] = [];
  if (processed) {
    const ref = await o.client.getBlock(doneThrough);
    if (ref === null) return fail('RPC_FAILURE', 'processed block vanished');
    if (doneThrough === head && ref.hash.toLowerCase() !== headRef.hash.toLowerCase()) {
      return fail('RPC_FAILURE', 'chain reorganised during scan; retry');
    }
    // Re-verify every window boundary: a reorg inside the span (including truncated, multi-request scans)
    // changes the hash of the window's end block. Roll back to the first window that no longer matches.
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i] as { from: bigint; to: bigint; hash: Hex };
      const cur = w.to === doneThrough ? ref : await o.client.getBlock(w.to);
      if (cur !== null && cur.hash.toLowerCase() === w.hash.toLowerCase()) continue;
      const prev = windows[i - 1];
      const lastOk = prev !== undefined ? { number: prev.to, hash: prev.hash } : reorg === undefined ? o.cursor.last : undefined;
      const hist = histSize === 0 ? [] : mergeHistory(keptHistory, windows.slice(0, i).map((x) => ({ number: x.to, hash: x.hash })), histSize + 1);
      const rc: ScanCursor = {
        nextBlock: w.from,
        ...(lastOk === undefined ? {} : { last: lastOk }),
        ...(hist.length > 1 ? { history: hist.slice(0, -1) } : {}),
      };
      return {
        announcements: out.filter((x) => x.blockNumber < w.from),
        cursor: rc,
        truncated: true,
        skipped,
        reorg: { rolledBackTo: reorg === undefined ? w.from : reorg.rolledBackTo },
      };
    }
    last = { number: doneThrough, hash: ref.hash };
    if (histSize > 0) {
      newHistory = mergeHistory(keptHistory, windows.map((x) => ({ number: x.to, hash: x.hash })), histSize + 1);
    }
  }
  if (histSize > 0 && !processed) newHistory = keptHistory.slice(-(histSize + 1));
  // `history` excludes `last` itself (it is stored separately).
  const olderThanLast = last === undefined ? [] : newHistory.filter((c) => c.number < last.number);
  const cursor: ScanCursor = {
    nextBlock: next,
    ...(last === undefined ? {} : { last }),
    ...(olderThanLast.length > 0 ? { history: olderThanLast } : {}),
  };
  return finish({ announcements: out, cursor, truncated, skipped }, reorg);
}

/** Merges checkpoint lists, dedupes by block number (later wins), sorts ascending and keeps the newest `max`. */
function mergeHistory(
  a: readonly { number: bigint; hash: Hex }[],
  b: readonly { number: bigint; hash: Hex }[],
  max: number,
): { number: bigint; hash: Hex }[] {
  const m = new Map<bigint, { number: bigint; hash: Hex }>();
  for (const c of [...a, ...b]) m.set(c.number, c);
  return [...m.values()].sort((x, y) => (x.number < y.number ? -1 : 1)).slice(-max);
}

function finish(r: Omit<FetchResult, 'reorg'>, reorg: FetchResult['reorg']): FetchResult {
  return reorg === undefined ? r : { ...r, reorg };
}
