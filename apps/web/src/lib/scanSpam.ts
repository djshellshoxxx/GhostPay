/**
 * Spec 05: scanner-side spam handling and local anonymity-set telemetry. Pure functions over public announcement data;
 * nothing here is sent anywhere. The cheap prefilter order (length, view tag, point decode, ECDH) lives in core-crypto's
 * `checkAnnouncement` inside the worker.
 */
import { isLogLimitError, type Address, type ChainConfig, type RpcClient, type ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';

/** One caller posting more than this many announcements in one block is treated as likely spam (heuristic, default). */
export const FLOOD_PER_BLOCK = 32;
export const MAX_FLOOD_PER_BLOCK = 10_000;

/** Lane options the spec lists beyond the open-lane budget. */
export interface ScanLaneOptions {
  /** Per-caller, per-block announcement count above which a caller is treated as flooding (default {@link FLOOD_PER_BLOCK}). */
  readonly floodPerBlock?: number;
  /** The optional local spam score: off keeps the open lane in chain order and flags nothing (default on). */
  readonly spamScoring?: boolean;
}

export interface LaneSplit {
  /** Posted by the manifest-verified router: processed first and never deferred. */
  readonly trusted: readonly ScannedAnnouncement[];
  /** Everything else, likely spam last. Subject to the per-scan budget; deferred, never dropped. */
  readonly open: readonly ScannedAnnouncement[];
  readonly suspected: number;
}

function wellFormedMetadata(hex: string): boolean {
  try {
    parseMetadata(hex);
    return true;
  } catch {
    return false;
  }
}

const intIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Splits one page into the trusted (router) and open lanes and orders the open lane by a local spam score. */
export function splitLanes(anns: readonly ScannedAnnouncement[], router: string, options: ScanLaneOptions = {}): LaneSplit {
  const routerLower = router.toLowerCase();
  const floodAt = intIn(options.floodPerBlock, 1, MAX_FLOOD_PER_BLOCK) ? options.floodPerBlock : FLOOD_PER_BLOCK;
  const trusted: ScannedAnnouncement[] = [];
  const open: ScannedAnnouncement[] = [];
  const ephCount = new Map<string, number>();
  const callerBlock = new Map<string, number>();
  for (const a of anns) {
    if (a.caller.toLowerCase() === routerLower) {
      trusted.push(a);
      continue;
    }
    open.push(a);
    const eph = a.ephemeralPublicKey.toLowerCase();
    ephCount.set(eph, (ephCount.get(eph) ?? 0) + 1);
    const cb = `${a.caller.toLowerCase()}|${a.blockNumber.toString()}`;
    callerBlock.set(cb, (callerBlock.get(cb) ?? 0) + 1);
  }
  if (options.spamScoring === false) return { trusted, open, suspected: 0 };
  const clean: ScannedAnnouncement[] = [];
  const suspect: ScannedAnnouncement[] = [];
  for (const a of open) {
    const flagged = (ephCount.get(a.ephemeralPublicKey.toLowerCase()) ?? 0) > 1 ||
      (callerBlock.get(`${a.caller.toLowerCase()}|${a.blockNumber.toString()}`) ?? 0) > floodAt ||
      !wellFormedMetadata(a.metadata);
    (flagged ? suspect : clean).push(a);
  }
  return { trusted, open: [...clean, ...suspect], suspected: suspect.length };
}

/** Non-secret lane and privacy-set preferences (plain text in this browser, like the scan privacy settings). */
export interface ScanLaneSettings {
  readonly floodPerBlock: number;
  readonly spamScoring: boolean;
  /** Opt-in: after a scan, count same-token transfers at similar amounts for the privacy set (costs RPC calls). */
  readonly privacySetTransfers: boolean;
}

export const DEFAULT_SCAN_LANES: ScanLaneSettings = Object.freeze({ floodPerBlock: FLOOD_PER_BLOCK, spamScoring: true, privacySetTransfers: false });
export const SCAN_LANES_KEY = 'ghostpay.scanLanes.v1';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Parses untrusted stored settings; anything invalid falls back to the default field by field. */
export function sanitizeScanLanes(raw: unknown): ScanLaneSettings {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    floodPerBlock: intIn(o['floodPerBlock'], 1, MAX_FLOOD_PER_BLOCK) ? o['floodPerBlock'] : DEFAULT_SCAN_LANES.floodPerBlock,
    spamScoring: o['spamScoring'] !== false,
    privacySetTransfers: o['privacySetTransfers'] === true,
  };
}

export function loadScanLanes(storage: StorageLike | undefined): ScanLaneSettings {
  try {
    const text = storage?.getItem(SCAN_LANES_KEY);
    return text === null || text === undefined ? DEFAULT_SCAN_LANES : sanitizeScanLanes(JSON.parse(text));
  } catch {
    return DEFAULT_SCAN_LANES;
  }
}

export function saveScanLanes(storage: StorageLike | undefined, s: ScanLaneSettings): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(SCAN_LANES_KEY, JSON.stringify(sanitizeScanLanes(s)));
    return true;
  } catch {
    return false;
  }
}

/** `keccak256("Transfer(address,address,uint256)")`: ERC-20 Transfer topic 0. */
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** Fixed recent window the transfer estimate looks at, ending at the head the scan reached. */
export const PRIVACY_TRANSFER_WINDOW_BLOCKS = 2000;
/** More transfer logs than this in the window (or a provider limit) make the estimate `unknown`, never a guess. */
export const PRIVACY_TRANSFER_MAX_LOGS = 10_000;
const MAX_TRANSFER_REQUESTS = 8;
const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;
const WORD_HEX = /^0x[0-9a-fA-F]{64}$/;

/** Spec 05 B: same-token transfers at a similar amount, labelled as an estimate; `unknown` whenever it could not be counted. */
export type TransferEstimate =
  | { readonly status: 'estimate'; readonly token: Address; readonly count: number; readonly windowBlocks: number }
  | { readonly status: 'unknown'; readonly reason: 'limit' | 'error' | 'noPayment' };

/**
 * Counts `Transfer` logs of `token` whose amount is within 25 % of `amount` in the last {@link PRIVACY_TRANSFER_WINDOW_BLOCKS}
 * blocks up to `head`. The query carries no sender or recipient, so the provider learns the token and the window, not an
 * address. Any provider limit, oversized result or error fails closed to `unknown`.
 */
export async function estimateSimilarTransfers(o: { readonly client: RpcClient; readonly chain: ChainConfig; readonly token: string; readonly amount: bigint; readonly head: bigint }): Promise<TransferEstimate> {
  if (o.client.chainId !== o.chain.chainId || !ADDRESS_HEX.test(o.token) || o.amount <= 0n || o.head < 0n) return { status: 'unknown', reason: 'error' };
  const window = BigInt(PRIVACY_TRANSFER_WINDOW_BLOCKS);
  const range = BigInt(Math.max(1, o.chain.getLogsMaxRange));
  const from = o.head + 1n > window ? o.head + 1n - window : 0n;
  const low = o.amount * 3n;
  const high = o.amount * 5n;
  let count = 0;
  let seen = 0;
  try {
    let requests = 0;
    for (let next = from; next <= o.head; next += range) {
      if (++requests > MAX_TRANSFER_REQUESTS) return { status: 'unknown', reason: 'limit' };
      const to = next + range - 1n > o.head ? o.head : next + range - 1n;
      const logs = await o.client.getLogs({ address: o.token as Address, topics: [TRANSFER_TOPIC], fromBlock: next, toBlock: to });
      seen += logs.length;
      if (seen > PRIVACY_TRANSFER_MAX_LOGS) return { status: 'unknown', reason: 'limit' };
      for (const log of logs) {
        if (log.topics.length !== 3 || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || !WORD_HEX.test(log.data)) continue;
        const value = BigInt(log.data) * 4n;
        if (value >= low && value <= high) count++;
      }
    }
  } catch (e) {
    return { status: 'unknown', reason: isLogLimitError(e) ? 'limit' : 'error' };
  }
  return { status: 'estimate', token: o.token as Address, count, windowBlocks: PRIVACY_TRANSFER_WINDOW_BLOCKS };
}

export interface AnonymitySet {
  readonly level: 'low' | 'medium' | 'high';
  readonly count7d: number;
  readonly count30d: number;
  /** The scan did not cover the whole 7-day span up to the head, so the counts are lower bounds. */
  readonly partial: boolean;
  /** Opt-in same-token transfer estimate; it never changes `level`. */
  readonly transfers?: TransferEstimate;
}

/** Product heuristics, UNVERIFIED: tune with real volume data. */
const MEDIUM_AT = 20;
const HIGH_AT = 200;

/**
 * Router announcement volume near the head, computed from blocks this device scanned. `head` is the chain head the windows
 * end at; `scannedTo` (default `head`) is the last block the scan reached, so a run stopped short of the head is `partial`.
 */
export function anonymitySet(o: { readonly chain: ChainConfig; readonly routerBlocks: readonly bigint[]; readonly head: bigint; readonly scannedFrom: bigint; readonly scannedTo?: bigint; readonly transfers?: TransferEstimate }): AnonymitySet {
  const span = (days: number): bigint => BigInt(Math.ceil((days * 86_400_000) / Math.max(1, o.chain.blockTimeMs)));
  const from7 = o.head - span(7) + 1n;
  const from30 = o.head - span(30) + 1n;
  const count7d = o.routerBlocks.filter((b) => b >= from7 && b <= o.head).length;
  const count30d = o.routerBlocks.filter((b) => b >= from30 && b <= o.head).length;
  return {
    level: count7d >= HIGH_AT ? 'high' : count7d >= MEDIUM_AT ? 'medium' : 'low', count7d, count30d,
    partial: o.scannedFrom > (from7 > 0n ? from7 : 0n) || (o.scannedTo !== undefined && o.scannedTo < o.head),
    ...(o.transfers === undefined ? {} : { transfers: o.transfers }),
  };
}

const UNKNOWN_REASON: Record<Extract<TransferEstimate, { status: 'unknown' }>['reason'], string> = {
  limit: 'the provider limit was hit',
  error: 'the lookup failed',
  noPayment: 'no token payment of yours was found to compare with',
};

/** Banner copy for the seller. Coarse on purpose; states what shrinks the set. */
export function describeAnonymitySet(a: AnonymitySet): string {
  const transfers = a.transfers === undefined ? '' : a.transfers.status === 'estimate'
    ? ` Same-token estimate: ${String(a.transfers.count)} transfers of the token you were paid in at a similar amount (within 25%) in the last ${String(a.transfers.windowBlocks)} blocks, from public transfer logs; it does not change the level.`
    : ` Same-token estimate: unknown (${UNKNOWN_REASON[a.transfers.reason]}).`;
  return `Privacy set: ${a.level} (${String(a.count7d)} GhostPay router announcements in about the last 7 days, ${String(a.count30d)} in about 30 days${a.partial ? '; counted over only the blocks scanned this time, so the real number may be higher' : ''}).${transfers} ` +
    'This is a rough local heuristic, not a guarantee: payments that share your view-tag bucket, unusual amounts and timing make the real set smaller. It is computed on this device and never sent.';
}
