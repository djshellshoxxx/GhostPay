/**
 * Spec 05: scanner-side spam handling and local anonymity-set telemetry. Pure functions over public announcement data;
 * nothing here is sent anywhere. The cheap prefilter order (length, view tag, point decode, ECDH) lives in core-crypto's
 * `checkAnnouncement` inside the worker.
 */
import { parseMetadata } from '@ghostpay/core-crypto';
import type { ChainConfig, ScannedAnnouncement } from '@ghostpay/chain-adapters';

/** One caller posting more than this many announcements in one block is treated as likely spam (heuristic). */
export const FLOOD_PER_BLOCK = 32;

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

/** Splits one page into the trusted (router) and open lanes and orders the open lane by a local spam score. */
export function splitLanes(anns: readonly ScannedAnnouncement[], router: string): LaneSplit {
  const routerLower = router.toLowerCase();
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
  const clean: ScannedAnnouncement[] = [];
  const suspect: ScannedAnnouncement[] = [];
  for (const a of open) {
    const flagged = (ephCount.get(a.ephemeralPublicKey.toLowerCase()) ?? 0) > 1 ||
      (callerBlock.get(`${a.caller.toLowerCase()}|${a.blockNumber.toString()}`) ?? 0) > FLOOD_PER_BLOCK ||
      !wellFormedMetadata(a.metadata);
    (flagged ? suspect : clean).push(a);
  }
  return { trusted, open: [...clean, ...suspect], suspected: suspect.length };
}

export interface AnonymitySet {
  readonly level: 'low' | 'medium' | 'high';
  readonly count7d: number;
  readonly count30d: number;
  /** The scan did not cover the whole 7-day span, so the counts are lower bounds. */
  readonly partial: boolean;
}

/** Product heuristics, UNVERIFIED: tune with real volume data. */
const MEDIUM_AT = 20;
const HIGH_AT = 200;

/** Router announcement volume near the head, computed from blocks this device scanned. */
export function anonymitySet(o: { readonly chain: ChainConfig; readonly routerBlocks: readonly bigint[]; readonly head: bigint; readonly scannedFrom: bigint }): AnonymitySet {
  const span = (days: number): bigint => BigInt(Math.ceil((days * 86_400_000) / Math.max(1, o.chain.blockTimeMs)));
  const from7 = o.head - span(7) + 1n;
  const from30 = o.head - span(30) + 1n;
  const count7d = o.routerBlocks.filter((b) => b >= from7 && b <= o.head).length;
  const count30d = o.routerBlocks.filter((b) => b >= from30 && b <= o.head).length;
  return { level: count7d >= HIGH_AT ? 'high' : count7d >= MEDIUM_AT ? 'medium' : 'low', count7d, count30d, partial: o.scannedFrom > (from7 > 0n ? from7 : 0n) };
}

/** Banner copy for the seller. Coarse on purpose; states what shrinks the set. */
export function describeAnonymitySet(a: AnonymitySet): string {
  return `Privacy set: ${a.level} (${String(a.count7d)} GhostPay router announcements in about the last 7 days, ${String(a.count30d)} in about 30 days${a.partial ? '; counted over only the blocks scanned this time, so the real number may be higher' : ''}). ` +
    'This is a rough local heuristic, not a guarantee: payments that share your view-tag bucket, unusual amounts and timing make the real set smaller. It is computed on this device and never sent.';
}
