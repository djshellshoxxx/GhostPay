import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Cover lookups for matched router payments (owner-approved, off by default).
 *
 * Verifying a matched router payment asks the RPC (and a configured second provider) for that announcement's block,
 * receipt and transaction; a non-matching announcement gets none of these, so the provider learns which public
 * announcements matched the seller's keys (docs/research/privacy-rpc-call-graph.md, items 2 and 3). With cover on,
 * every scan page also verifies a fixed share of the other router payments it reads, through the same verification
 * path and in chain order, whether or not any payment matched; their results are discarded. Only the block and receipt
 * state of a check, real or cover, decides where the next scan restarts after a pending or failed one.
 *
 * Which other payments are looked up depends only on the announcement and a key derived from the viewing key: not on
 * the page, on whether anything matched, or on a reorg (the hashed fields survive one). A provider that only records
 * requests therefore sees the same cover again on a rescan or a resume, and comparing scans does not leave the payment
 * alone. The hashed fields include the one-time address and metadata, so an altered copy of an announcement gets an
 * independent decision. The key stays in memory and cannot be computed from public data.
 *
 * What it does not hide: when the scan ran and the IP address; anything a provider finds out by altering or failing its
 * answers; the block reads made only for the seller's payments (after a reorg report, those found in the scan and saved
 * ledger records; on a ledger retry, saved invoice records); a balance read, key export or sweep through the same RPC;
 * a single payment's re-check from the result list; and anything sent to a wallet or relayer. Few router payments give
 * little or no cover.
 */

/** Share of the other router payments that are looked up as cover: 1 in 2. */
export const MATCH_COVER_SHARE = 0.5;

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
    readonly stealthAddress: string;
    readonly metadata: string;
  };
}

export interface MatchCover {
  /** In or out as cover, for this announcement everywhere: depends only on the key and the announcement's content. */
  selects(item: CoverItem): boolean;
  /** Every item of `real`, and every selected candidate that is not one of them (once each), all in chain order. */
  plan<T extends CoverItem>(real: readonly T[], candidates: readonly T[]): readonly CoverStep<T>[];
  /** Zeroizes the derived key; the planner refuses to plan afterwards. */
  dispose(): void;
}

const DOMAIN = utf8ToBytes('ghostpay/match-cover/v3');
const THRESHOLD = Math.floor(MATCH_COVER_SHARE * 0x1_0000_0000);

/** Reorg-stable content: block number, block hash and log index change on re-inclusion; these fields do not. */
function stableId({ announcement: a }: CoverItem): string {
  return [a.transactionHash ?? '', a.ephemeralPublicKey, a.stealthAddress, a.metadata].join('|').toLowerCase();
}

function chainOrder(a: CoverItem, b: CoverItem): number {
  const x = a.announcement;
  const y = b.announcement;
  if (x.blockNumber !== y.blockNumber) return x.blockNumber < y.blockNumber ? -1 : 1;
  return x.logIndex - y.logIndex;
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
  const assertLive = (): void => { if (disposed) throw new Error('match cover disposed'); };
  const selects = (item: CoverItem): boolean => {
    assertLive();
    const mac = hmac(sha256, coverKey, utf8ToBytes(stableId(item)));
    return (((mac[0]! << 24) | (mac[1]! << 16) | (mac[2]! << 8) | mac[3]!) >>> 0) < THRESHOLD;
  };
  return Object.freeze({
    selects,
    plan<T extends CoverItem>(real: readonly T[], candidates: readonly T[]): readonly CoverStep<T>[] {
      assertLive();
      const taken = new Set(real.map((r) => r.announcement.id));
      const steps: CoverStep<T>[] = real.map((item) => Object.freeze({ item, decoy: false }));
      for (const item of candidates) {
        if (taken.has(item.announcement.id) || !selects(item)) continue;
        taken.add(item.announcement.id);
        steps.push(Object.freeze({ item, decoy: true }));
      }
      // One chain order for real and cover lookups: the order says nothing beyond the set itself.
      return Object.freeze(steps.sort((a, b) => chainOrder(a.item, b.item)));
    },
    dispose(): void {
      disposed = true;
      coverKey.fill(0);
    },
  });
}
