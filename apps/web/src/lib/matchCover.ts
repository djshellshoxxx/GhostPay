import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Cover lookups for matched router payments (owner-approved, off by default).
 *
 * Verifying a matched router payment asks the RPC (and a configured second provider) for that announcement's block,
 * receipt and transaction; a non-matching announcement gets none of these, so the provider learns which public
 * announcements matched the seller's keys (docs/research/privacy-rpc-call-graph.md, items 2 and 3). With cover on, a
 * page that has a matched router payment also verifies a fixed share of the other router payments in the same block
 * window, through the same verification path and in chain order; their results are discarded.
 *
 * Which other payments are looked up does not depend on the page, the scan or a reorg: each announcement is in or out
 * by a keyed hash of its transaction hash and ephemeral key (both survive a reorg) against a fixed share. Comparing the
 * lookups of two scans therefore leaves the payment among the cover announcements of the overlap, not alone. The key
 * is derived from the viewing key, stays in memory and cannot be computed from public data.
 *
 * What it does not hide: that some payment matched in that page, roughly how many, timing, the IP address, a single
 * payment's re-check from the result list, and anything sent to a wallet or relayer. A sparse window gives little or
 * no cover; a very busy one is capped at {@link MAX_COVER_PER_PAGE}, and only then can the chosen set differ between
 * pages.
 */

/** Share of the other router payments in a covered window that are looked up as cover: 1 in 2. */
export const MATCH_COVER_SHARE = 0.5;
/** Most cover lookups per scan page, to bound the extra RPC load (decoys are chosen by keyed rank beyond this). */
export const MAX_COVER_PER_PAGE = 32;
/** Cover comes from the same fixed block windows as the covered payments. */
export const COVER_WINDOW_BLOCKS = 1000n;

/** The fixed cover window of a block. */
export function coverWindow(blockNumber: bigint): bigint {
  return blockNumber / COVER_WINDOW_BLOCKS;
}

/** One verification lookup to run, in order. `decoy` results must be discarded. */
export interface CoverStep<T> {
  readonly item: T;
  readonly decoy: boolean;
}

export interface CoverItem {
  readonly announcement: {
    readonly id: string;
    readonly blockNumber: bigint;
    readonly logIndex: number;
    readonly transactionHash?: string;
    readonly ephemeralPublicKey: string;
  };
}

export interface MatchCover {
  /** In or out as cover, for this announcement everywhere: depends only on the key and the announcement's stable id. */
  selects(item: CoverItem): boolean;
  /**
   * Every item of `ordered` exactly once and in its original (chain) order, merged in chain order with the selected
   * `candidates` from the windows of the items `covered` selects. Items of `ordered` are never decoys; a decoy appears
   * at most once. With nothing covered there are no decoys.
   */
  plan<T extends CoverItem>(ordered: readonly T[], candidates: readonly T[], covered: (item: T) => boolean): readonly CoverStep<T>[];
  /** Zeroizes the derived key; the planner refuses to plan afterwards. */
  dispose(): void;
}

const DOMAIN = utf8ToBytes('ghostpay/match-cover/v2');
const THRESHOLD = Math.floor(MATCH_COVER_SHARE * 0x1_0000_0000);

/** Reorg-stable identity: the transaction and the ephemeral key survive re-inclusion; block hash and log index do not. */
function stableId(item: CoverItem): string {
  return `${(item.announcement.transactionHash ?? '').toLowerCase()}|${item.announcement.ephemeralPublicKey.toLowerCase()}`;
}
function chainBefore(a: CoverItem, b: CoverItem): boolean {
  const x = a.announcement;
  const y = b.announcement;
  return x.blockNumber < y.blockNumber || (x.blockNumber === y.blockNumber && x.logIndex < y.logIndex);
}

/**
 * The cover planner for one scan, or `undefined` when cover is off. Call it before the viewing key is handed to the
 * scan worker (which zeroizes it) and {@link MatchCover.dispose} it when the scan ends.
 */
export function createMatchCover(enabled: boolean | undefined, viewingKey: Uint8Array): MatchCover | undefined {
  if (enabled !== true) return undefined;
  if (!(viewingKey instanceof Uint8Array) || viewingKey.length === 0) throw new Error('match cover needs the viewing key');
  // One-way and domain-separated: knowing this key does not reveal the viewing key, and nothing public derives it.
  const coverKey = hmac(sha256, viewingKey, DOMAIN);
  let disposed = false;
  const score = (item: CoverItem): number => {
    if (disposed) throw new Error('match cover disposed');
    const mac = hmac(sha256, coverKey, utf8ToBytes(stableId(item)));
    return ((mac[0]! << 24) | (mac[1]! << 16) | (mac[2]! << 8) | mac[3]!) >>> 0;
  };
  const selects = (item: CoverItem): boolean => score(item) < THRESHOLD;
  return Object.freeze({
    selects,
    plan<T extends CoverItem>(ordered: readonly T[], candidates: readonly T[], covered: (item: T) => boolean): readonly CoverStep<T>[] {
      const windows = new Set(ordered.filter(covered).map((r) => coverWindow(r.announcement.blockNumber)));
      const own = new Set(ordered.map((r) => r.announcement.id));
      const pool = new Map<string, { readonly item: T; readonly s: number }>();
      if (windows.size > 0) {
        for (const c of candidates) {
          const id = c.announcement.id;
          if (own.has(id) || pool.has(id) || !windows.has(coverWindow(c.announcement.blockNumber))) continue;
          const s = score(c);
          if (s < THRESHOLD) pool.set(id, { item: c, s });
        }
      }
      // Bounded load: past the cap, keep the lowest keyed ranks (stable for a given page; disclosed as a limit).
      const decoys = [...pool.values()].sort((a, b) => a.s - b.s).slice(0, MAX_COVER_PER_PAGE).map((d) => d.item)
        .sort((a, b) => (chainBefore(a, b) ? -1 : chainBefore(b, a) ? 1 : 0));
      // Merge in chain order. Ordered items keep their relative order even if a caller passes them out of chain order.
      const steps: CoverStep<T>[] = [];
      let d = 0;
      for (const item of ordered) {
        while (d < decoys.length && chainBefore(decoys[d]!, item)) steps.push(Object.freeze({ item: decoys[d++]!, decoy: true }));
        steps.push(Object.freeze({ item, decoy: false }));
      }
      while (d < decoys.length) steps.push(Object.freeze({ item: decoys[d++]!, decoy: true }));
      return Object.freeze(steps);
    },
    dispose(): void {
      disposed = true;
      coverKey.fill(0);
    },
  });
}
