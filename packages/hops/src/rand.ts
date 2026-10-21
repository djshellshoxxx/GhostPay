import type { CryptoLike } from './types.js';

/**
 * Uniform integer in [minMs, maxMs] via CSPRNG rejection sampling (no modulo bias, no Math.random).
 * Same algorithm as `apps/web/src/lib/jitter.ts` (copied: a package may not import app code).
 *
 * @param minMs Inclusive lower bound.
 * @param maxMs Inclusive upper bound.
 * @param rng Random source.
 * @returns Delay in ms.
 * @throws {RangeError} On invalid range or a failing random source.
 */
export function randomDelayMs(minMs: number, maxMs: number, rng: CryptoLike = crypto): number {
  if (!Number.isSafeInteger(minMs) || !Number.isSafeInteger(maxMs) || minMs < 0 || maxMs < minMs) {
    throw new RangeError('Invalid delay range');
  }
  const span = maxMs - minMs + 1;
  const range = 0x1_0000_0000;
  if (span > range) throw new RangeError('Invalid delay range');
  const limit = range - (range % span);
  const sample = new Uint32Array(1);
  for (let attempts = 0; attempts < 1000; attempts++) {
    rng.getRandomValues(sample);
    const v = sample[0] as number;
    if (v < limit) return minMs + (v % span);
  }
  throw new RangeError('Random source failed');
}

/**
 * Draws one independent delay per leg. The cap `maxTotalMs` is enforced by shrinking the upper
 * bound of later draws only when it would otherwise be exceeded (never binds with default settings).
 *
 * @param hops Number of legs.
 * @param delay Bounds.
 * @param rng Random source.
 * @returns Delays in ms.
 * @throws {RangeError} When `hops * minMs > maxTotalMs`.
 */
export function drawDelays(
  hops: number,
  delay: { readonly minMs: number; readonly maxMs: number; readonly maxTotalMs: number },
  rng: CryptoLike,
): number[] {
  if (hops * delay.minMs > delay.maxTotalMs) throw new RangeError('delay minimum exceeds total cap');
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < hops; i++) {
    const remainingAfter = hops - i - 1;
    const room = delay.maxTotalMs - used - remainingAfter * delay.minMs;
    const d = randomDelayMs(delay.minMs, Math.min(delay.maxMs, room), rng);
    out.push(d);
    used += d;
  }
  return out;
}

/**
 * Random uint256 for an unordered sweep nonce.
 *
 * @param rng Random source.
 * @returns 256-bit value.
 */
export function randomUint256(rng: CryptoLike): bigint {
  const b = new Uint8Array(32);
  rng.getRandomValues(b);
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}
