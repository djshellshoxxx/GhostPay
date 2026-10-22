import { PirError, requireArg } from './errors.js';
import { csprng, drawBytes, type RandomBytes } from './rand.js';

/** Upper bound on database size accepted by the primitives (queries are `n` bits). */
export const MAX_PAGES = 1 << 20;

/** Bytes in a query bitvector for `n` pages. Bit `i` is `(q[i >> 3] >> (i & 7)) & 1`. */
export function queryBytes(n: number): number {
  requireArg(Number.isInteger(n) && n >= 1 && n <= MAX_PAGES, 'n out of range');
  return (n + 7) >> 3;
}

/** Mask of the valid bits in the last query byte (all other bits must be zero: canonical form). */
function tailMask(n: number): number {
  const r = n & 7;
  return r === 0 ? 0xff : (1 << r) - 1;
}

/**
 * Client side of two-server XOR PIR (Chor, Goldreich, Kushilevitz, Sudan 1995). Samples a uniform subset
 * `S` of `[0, n)`; server A gets `S`, server B gets `S xor {index}`.
 *
 * @security Each single query is uniformly distributed over all `2^n` subsets whatever `index` is (it is
 * a bijective image of the random string), so ONE server learns nothing about `index`. Two servers that
 * compare queries learn it exactly (`qA xor qB = e_index`): the scheme REQUIRES non-collusion.
 * @param n Number of pages (1..2^20).
 * @param index Wanted page, `0 <= index < n`.
 * @param rand CSPRNG byte source (default `crypto.getRandomValues`). Must return exactly the asked length.
 * @returns Canonical bitvectors (`ceil(n/8)` bytes, unused high bits of the last byte zero).
 */
export function pirQuery(n: number, index: number, rand: RandomBytes = csprng): { qA: Uint8Array; qB: Uint8Array } {
  const len = queryBytes(n);
  requireArg(Number.isInteger(index) && index >= 0 && index < n, 'index out of range');
  const qA = new Uint8Array(drawBytes(rand, len)); // copy: never alias the caller's buffer
  const last = len - 1;
  qA[last] = (qA[last] ?? 0) & tailMask(n);
  const qB = new Uint8Array(qA);
  const byte = index >> 3;
  qB[byte] = (qB[byte] ?? 0) ^ (1 << (index & 7));
  return { qA, qB };
}

/**
 * Server side: XOR of the pages selected by `q`. Work is O(n * pageBytes) for every query, independent of
 * the selection (the loop always visits every page; the XOR is branch-free per byte).
 *
 * @security Response length is always `pageBytes` (NP-P-5/17). Rejects non-canonical queries (wrong length
 * or stray tail bits) so a malformed query cannot be used as a covert channel or crash probe.
 * @throws PirError `INVALID_ARGUMENT` on empty db, unequal page sizes, or a malformed query.
 */
export function pirAnswer(pages: readonly Uint8Array[], q: Uint8Array): Uint8Array {
  const n = pages.length;
  const len = queryBytes(n);
  const size = pages[0]?.length ?? 0;
  requireArg(size >= 1, 'page size must be positive');
  requireArg(q.length === len, 'query length mismatch');
  requireArg(((q[len - 1] ?? 0) & ~tailMask(n) & 0xff) === 0, 'query has stray bits');
  const out = new Uint8Array(size);
  for (let i = 0; i < n; i++) {
    const page = pages[i] as Uint8Array;
    requireArg(page.length === size, 'unequal page sizes');
    const sel = (((q[i >> 3] ?? 0) >> (i & 7)) & 1) * 0xff; // 0x00 or 0xff
    for (let b = 0; b < size; b++) out[b] = (out[b] ?? 0) ^ ((page[b] ?? 0) & sel);
  }
  return out;
}

/**
 * Client side: XOR the two answers. Equals page `index` iff both servers answered honestly.
 *
 * @security Not authenticated by itself: callers MUST check the result against a manifest leaf hash
 * ({@link verifyPage}); a wrong answer is detected, not corrected.
 */
export function pirReconstruct(aA: Uint8Array, aB: Uint8Array): Uint8Array {
  if (aA.length !== aB.length || aA.length === 0) throw new PirError('INVALID_ARGUMENT', 'answer length mismatch');
  const out = new Uint8Array(aA.length);
  for (let i = 0; i < out.length; i++) out[i] = (aA[i] ?? 0) ^ (aB[i] ?? 0);
  return out;
}
