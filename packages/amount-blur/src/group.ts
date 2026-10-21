import { assertTestnetChain, fail, requireInt } from './errors.js';

/** A payment the seller's scanner found. */
export interface FoundPayment {
  readonly id: string;
  readonly token: string;
  readonly net: bigint;
  /** Block time in seconds. */
  readonly blockTime: number;
}

/** Query for {@link matchSplitGroup}. */
export interface GroupQuery {
  readonly chainId: number;
  readonly token: string;
  readonly expectedNet: bigint;
  readonly toleranceBps: number;
  readonly windowSec: number;
  /** Minimum parts per candidate (default 2: a single payment is an ordinary match, not a group). */
  readonly minParts?: number;
}

/** Result of {@link matchSplitGroup}. */
export interface GroupMatch {
  /** Each candidate is a sorted set of ids. Empty array = no match. All are returned; none is applied. */
  readonly candidates: readonly (readonly string[])[];
  /** More than {@link MAX_GROUP_CANDIDATES} payments: only the most recent were searched. */
  readonly truncated: boolean;
  /** More than {@link MAX_RETURNED_CANDIDATES} matches: the list was cut. */
  readonly capped: boolean;
}

/** Search bound (AB-G1). */
export const MAX_GROUP_CANDIDATES = 16;
/** Largest group size searched. */
export const MAX_GROUP_PARTS = 8;
/** Returned candidate bound. */
export const MAX_RETURNED_CANDIDATES = 256;

/**
 * Proposes sets of found payments that could be the parts of one split invoice.
 *
 * @remarks A set qualifies when: same token, `expectedNet <= sum(net) <= expectedNet*(10000+tol)/10000`,
 * block-time spread `<= windowSec`, and it is minimal (dropping its smallest part would fall below
 * `expectedNet`). With more than 16 payments only the 16 most recent are searched (`truncated`), so the
 * work is at most 2^16 subsets. Ambiguity is returned, never resolved, and no label is ever applied here.
 * @security Matching is by public amounts and times only; it can be wrong. The seller must confirm.
 * @param found Scanner results (unique ids).
 * @param q Query.
 * @returns Candidate id sets.
 * @throws {AmountBlurError} `INVALID_INPUT`, `CHAIN_NOT_ALLOWED`.
 */
export function matchSplitGroup(found: readonly FoundPayment[], q: GroupQuery): GroupMatch {
  assertTestnetChain(q.chainId);
  if (typeof q.expectedNet !== 'bigint' || q.expectedNet < 1n) fail('INVALID_INPUT', 'expectedNet must be positive');
  requireInt(q.toleranceBps, 0, 10_000, 'toleranceBps');
  requireInt(q.windowSec, 0, 365 * 86_400, 'windowSec');
  const minParts = requireInt(q.minParts ?? 2, 1, MAX_GROUP_PARTS, 'minParts');
  const seen = new Set<string>();
  for (const f of found) {
    if (seen.has(f.id)) fail('INVALID_INPUT', 'duplicate payment id');
    seen.add(f.id);
    if (typeof f.net !== 'bigint' || f.net < 0n || !Number.isFinite(f.blockTime)) fail('INVALID_INPUT', 'payment fields');
  }
  const token = q.token.toLowerCase();
  const pool = found
    .filter((f) => f.token.toLowerCase() === token && f.net > 0n)
    .sort((a, b) => b.blockTime - a.blockTime || (a.id < b.id ? -1 : 1));
  const truncated = pool.length > MAX_GROUP_CANDIDATES;
  const cand = pool.slice(0, MAX_GROUP_CANDIDATES);
  const hi = (q.expectedNet * BigInt(10_000 + q.toleranceBps)) / 10_000n;
  const out: string[][] = [];
  const n = cand.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let count = 0;
    let sum = 0n;
    let minNet = -1n;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let i = 0; i < n; i += 1) {
      if ((mask & (1 << i)) === 0) continue;
      const c = cand[i] as FoundPayment;
      count += 1;
      sum += c.net;
      if (minNet < 0n || c.net < minNet) minNet = c.net;
      if (c.blockTime < tMin) tMin = c.blockTime;
      if (c.blockTime > tMax) tMax = c.blockTime;
    }
    if (count < minParts || count > MAX_GROUP_PARTS) continue;
    if (sum < q.expectedNet || sum > hi || tMax - tMin > q.windowSec) continue;
    if (sum - minNet >= q.expectedNet) continue;
    out.push(cand.filter((_, i) => (mask & (1 << i)) !== 0).map((c) => c.id).sort());
  }
  out.sort((a, b) => a.length - b.length || a.join('\u0000').localeCompare(b.join('\u0000')));
  const capped = out.length > MAX_RETURNED_CANDIDATES;
  return { candidates: capped ? out.slice(0, MAX_RETURNED_CANDIDATES) : out, truncated, capped };
}
