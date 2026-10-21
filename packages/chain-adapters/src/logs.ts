import { parseCompressedPoint, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { decodeAbiParameters, encodeAbiParameters, getAddress, hexToBytes, keccak256, toBytes } from 'viem/utils';
import type { ChainConfig } from './config/chains.js';
import { fail, ChainAdapterError } from './errors.js';
import { parseQuantity, requestWithFallbackCheck, toQuantity, type RpcClient, type RpcLog } from './rpc.js';
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
  /** Transaction hash when the provider reported a well-formed one (lowercase), else `undefined`. */
  readonly transactionHash?: Hex;
  /**
   * Confirmations at the head seen by {@link fetchAnnouncements}: `head - blockNumber + 1` (1 = in the newest
   * block). Set by `fetchAnnouncements`; undefined on values from {@link validateAnnouncementLog} directly.
   * A value below `chain.finalityDepth` means the announcement can still be reorged away (TS-03).
   */
  readonly confirmations?: bigint;
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
  /** ERC-5564 scheme id filter, default 1n. */
  readonly schemeId?: bigint;
  /** Upper bound of `eth_getLogs` calls in one invocation, default 50. */
  readonly maxRequests?: number;
  /** Stop after this many accepted logs, default 10 000. */
  readonly maxLogs?: number;
  /** Smaller range cap than the chain default (never larger). */
  readonly maxRange?: number;
  /**
   * Only scan blocks with at least this many confirmations (default 1 = up to the head). Use
   * `chain.finalityDepth` to never see reorg-able matches. Must be an integer >= 1.
   */
  readonly minConfirmations?: number;
  /**
   * Independent second provider (same chain). When set, every `eth_getLogs` window and the closing block
   * hash must agree between both (via `requestWithFallbackCheck`); a disagreement throws `RPC_FAILURE`
   * (no silent trust of a single provider).
   */
  readonly secondary?: RpcClient;
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
  /** Chain head observed at the start of this call. */
  readonly head: bigint;
  /** Highest block this call was allowed to scan (`head - minConfirmations + 1`). */
  readonly scanHead: bigint;
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
  const txh = log.transactionHash;
  const transactionHash = typeof txh === 'string' && HASH.test(txh.toLowerCase()) ? (txh.toLowerCase() as Hex) : undefined;
  return {
    ...(transactionHash === undefined ? {} : { transactionHash }),
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
  const minConf = o.minConfirmations ?? 1;
  if (!Number.isInteger(minConf) || minConf < 1) return fail('INVALID_INPUT', 'minConfirmations');
  if (o.secondary !== undefined && o.secondary.chainId !== o.chain.chainId) {
    return fail('CHAIN_MISMATCH', 'secondary client chain differs from scan chain');
  }

  let next = o.cursor.nextBlock;
  let reorg: FetchResult['reorg'];
  if (o.cursor.last !== undefined) {
    const ref = await o.client.getBlock(o.cursor.last.number);
    if (ref === null || ref.hash.toLowerCase() !== o.cursor.last.hash.toLowerCase()) {
      next = o.cursor.last.number >= depth ? o.cursor.last.number - depth + 1n : 0n;
      reorg = { rolledBackTo: next };
    }
  }

  const head = await o.client.blockNumber();
  const confDelta = BigInt(minConf) - 1n;
  // scanHead < 0 means the chain is younger than minConfirmations: nothing is scannable yet.
  const scanHead = head >= confDelta ? head - confDelta : -1n;
  const headRef = scanHead >= 0n ? await o.client.getBlock(scanHead) : null;
  const out: ScannedAnnouncement[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let requests = 0;
  let window = cap;
  let doneThrough = next - 1n;
  let processed = false;
  let truncated = false;

  while (next <= scanHead) {
    if (requests >= maxRequests || out.length >= maxLogs) {
      truncated = true;
      break;
    }
    const to = next + window - 1n > scanHead ? scanHead : next + window - 1n;
    requests++;
    let logs: readonly RpcLog[];
    try {
      const filter = { address: o.announcer, topics: [ANNOUNCEMENT_TOPIC, schemeTopic(schemeId)], fromBlock: next, toBlock: to };
      logs = o.secondary === undefined ? await o.client.getLogs(filter) : await getLogsAgreed(o.client, o.secondary, filter);
    } catch (e) {
      if (e instanceof ChainAdapterError && /json-rpc error -(32602|32005)/.test(e.message) && window > 1n) {
        window = window / 2n;
        continue;
      }
      throw e;
    }
    for (const log of logs) {
      const a = validateAnnouncementLog(log, o.announcer, schemeId, next, to);
      if (a === undefined) {
        skipped++;
      } else if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push({ ...a, confirmations: head - a.blockNumber + 1n });
      }
    }
    doneThrough = to;
    processed = true;
    next = to + 1n;
  }

  let last = reorg === undefined ? o.cursor.last : undefined;
  if (processed) {
    const ref = await o.client.getBlock(doneThrough);
    if (ref === null) return fail('RPC_FAILURE', 'processed block vanished');
    if (headRef !== null && doneThrough === scanHead && ref.hash.toLowerCase() !== headRef.hash.toLowerCase()) {
      return fail('RPC_FAILURE', 'chain reorganised during scan; retry');
    }
    if (o.secondary !== undefined) {
      const other = await o.secondary.getBlock(doneThrough);
      if (other === null || other.hash.toLowerCase() !== ref.hash.toLowerCase()) {
        return fail('RPC_FAILURE', 'providers disagree');
      }
    }
    last = { number: doneThrough, hash: ref.hash };
  }
  const cursor: ScanCursor = last === undefined ? { nextBlock: next } : { nextBlock: next, last };
  return finish({ announcements: out, cursor, truncated, skipped, head, scanHead }, reorg);
}

function finish(r: Omit<FetchResult, 'reorg'>, reorg: FetchResult['reorg']): FetchResult {
  return reorg === undefined ? r : { ...r, reorg };
}

/** Projection of an `eth_getLogs` result that both providers must agree on (ignores provider-specific extras). */
function projectLogs(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return (result as unknown[])
    .map((l) => {
      const r = (typeof l === 'object' && l !== null ? l : {}) as Record<string, unknown>;
      const topics = Array.isArray(r['topics']) ? (r['topics'] as unknown[]).map((t) => (typeof t === 'string' ? t.toLowerCase() : t)) : r['topics'];
      return [
        typeof r['blockHash'] === 'string' ? r['blockHash'].toLowerCase() : r['blockHash'],
        r['blockNumber'],
        r['logIndex'],
        typeof r['address'] === 'string' ? r['address'].toLowerCase() : r['address'],
        topics,
        typeof r['data'] === 'string' ? r['data'].toLowerCase() : r['data'],
        r['removed'] === true,
      ];
    })
    .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
}

async function getLogsAgreed(a: RpcClient, b: RpcClient, f: Parameters<RpcClient['getLogs']>[0]): Promise<readonly RpcLog[]> {
  const r = await requestWithFallbackCheck(
    a,
    b,
    'eth_getLogs',
    [{ address: f.address, topics: f.topics, fromBlock: toQuantity(f.fromBlock), toBlock: toQuantity(f.toBlock) }],
    projectLogs,
  );
  if (!Array.isArray(r)) return fail('RPC_FAILURE', 'logs not an array');
  return r as RpcLog[];
}
