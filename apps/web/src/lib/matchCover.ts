import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Cover lookups for matched router payments (owner-approved, off by default).
 *
 * Verifying a matched router payment asks the RPC (and a configured second provider) for that announcement's block,
 * receipt and transaction; a non-matching announcement gets none of these, so the provider learns which public
 * announcements matched the seller's keys (docs/research/privacy-rpc-call-graph.md, items 2 and 3). With cover on,
 * each matched payment is looked up together with `size - 1` other router announcements from the same scan page, in a
 * random order and through exactly the same verification path, so the provider sees `size` identical lookups and
 * cannot tell which one is the payment. Verification of the real payment is unchanged; decoy results are discarded.
 *
 * Decoys are chosen deterministically from a key derived from the viewing key: a reorg or a later rescan that
 * verifies the same payment again picks the same decoys, so comparing two lookup sets does not single it out. The key
 * never leaves memory and cannot be computed from public data (the viewing *public* key or the meta-address).
 *
 * What it does not hide: that some payment matched in that page, and how many (lookups come in groups of `size`);
 * the IP address and timing; anything sent to the wallet or a relayer. A page with fewer other router announcements
 * than needed gives a smaller cover set.
 */

/** Lookups per matched router payment when cover is on: the payment itself and three other router announcements. */
export const MATCH_COVER_SIZE = 4;
/** Upper bound on the size accepted from callers, to keep the extra RPC load bounded. */
export const MAX_MATCH_COVER_SIZE = 16;
/**
 * Decoys come from the same fixed block window as the payment, so a rescan whose pages start elsewhere still draws
 * from the same candidates (the scan's own log windows are grid-aligned too, but configurable).
 */
export const COVER_WINDOW_BLOCKS = 1000n;

/** The fixed cover window of a block, as a string key for {@link MatchCover.plan}'s `group`. */
export function coverWindow(blockNumber: bigint): string {
  return (blockNumber / COVER_WINDOW_BLOCKS).toString();
}

/** One verification lookup to run, in order. `decoy` results must be discarded. */
export interface CoverStep<T> {
  readonly item: T;
  readonly decoy: boolean;
}

export interface MatchCover {
  readonly size: number;
  /**
   * Every item of `ordered` exactly once and in its original order (verification order decides which of two claims
   * sharing one transfer is credited), plus up to `size - 1` decoys for each item that `covered` selects, drawn from
   * `candidates` in the same `group`. Items of `ordered` are never decoys and a decoy appears at most once. Decoys
   * are placed at uniformly random positions among the ordered items.
   */
  plan<T extends { readonly announcement: { readonly id: string } }>(ordered: readonly T[], candidates: readonly T[], options?: {
    readonly covered?: (item: T) => boolean;
    readonly group?: (item: T) => string;
  }): readonly CoverStep<T>[];
}

const DOMAIN = utf8ToBytes('ghostpay/match-cover/v1');

/** Uniform integer in [0, n) from the platform CSPRNG (rejection sampling, no modulo bias). */
function cryptoIndex(n: number): number {
  if (!Number.isSafeInteger(n) || n <= 0 || n > 0xffffffff) throw new RangeError('index bound');
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const word = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(word);
    const value = word[0]!;
    if (value < limit) return value % n;
  }
}

/**
 * The cover planner for one scan, or `undefined` when cover is off (`size` absent or below 2).
 * Call it before the viewing key is handed to the scan worker, which zeroizes it.
 * @param random Injectable uniform index source (tests); defaults to the platform CSPRNG.
 */
export function createMatchCover(size: number | undefined, viewingKey: Uint8Array, random: (n: number) => number = cryptoIndex): MatchCover | undefined {
  if (size === undefined) return undefined;
  if (!Number.isSafeInteger(size) || size < 2) return undefined;
  if (!(viewingKey instanceof Uint8Array) || viewingKey.length === 0) throw new Error('match cover needs the viewing key');
  const k = Math.min(size, MAX_MATCH_COVER_SIZE);
  // One-way and domain-separated: knowing this key does not reveal the viewing key, and nothing public derives it.
  const coverKey = hmac(sha256, viewingKey, DOMAIN);
  const score = (realId: string, candidateId: string): string => bytesToHex(hmac(sha256, coverKey, utf8ToBytes(`${realId}\n${candidateId}`)));
  return Object.freeze({
    size: k,
    plan<T extends { readonly announcement: { readonly id: string } }>(ordered: readonly T[], candidates: readonly T[], options: {
      readonly covered?: (item: T) => boolean;
      readonly group?: (item: T) => string;
    } = {}): readonly CoverStep<T>[] {
      const own = new Set(ordered.map((r) => r.announcement.id));
      const pool = new Map<string, T>();
      for (const c of candidates) {
        const id = c.announcement.id;
        if (!own.has(id) && !pool.has(id)) pool.set(id, c);
      }
      const chosen = new Map<string, T>();
      for (const r of ordered) {
        if (options.covered !== undefined && !options.covered(r)) continue;
        // The k - 1 candidates with the lowest keyed score for this payment: stable across rescans of the window.
        const home = options.group?.(r);
        const ranked = [...pool.values()]
          .filter((c) => home === undefined || options.group?.(c) === home)
          .map((c) => ({ c, s: score(r.announcement.id, c.announcement.id) }))
          .sort((x, y) => (x.s < y.s ? -1 : x.s > y.s ? 1 : 0));
        for (const { c } of ranked.slice(0, k - 1)) chosen.set(c.announcement.id, c);
      }
      // Fisher-Yates over slot kinds with an unbiased CSPRNG index, then the ordered items fill the real slots in
      // their original order and the decoys fill the rest: decoy positions are uniform, real order is kept.
      const slots: boolean[] = [...ordered.map(() => false), ...[...chosen.values()].map(() => true)];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = random(i + 1);
        const tmp = slots[i]!;
        slots[i] = slots[j]!;
        slots[j] = tmp;
      }
      const decoys = [...chosen.values()];
      for (let i = decoys.length - 1; i > 0; i--) {
        const j = random(i + 1);
        const tmp = decoys[i]!;
        decoys[i] = decoys[j]!;
        decoys[j] = tmp;
      }
      let nextReal = 0;
      let nextDecoy = 0;
      return Object.freeze(slots.map((decoy) => Object.freeze(decoy ? { item: decoys[nextDecoy++]!, decoy: true } : { item: ordered[nextReal++]!, decoy: false })));
    },
  });
}
