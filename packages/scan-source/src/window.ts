import { requireArg } from './errors.js';

const MAX_PARAM = 10_000_000;

/**
 * Pads an inclusive block window to a grid (NP-S-3, MH-SCAN-2): `from` is rounded down to a multiple of
 * `align`, `to` is rounded up so that `to + 1` is a multiple of `align`, and the span is at least `minSpan`.
 * A fresh install and a one-block catch-up therefore send identical-size requests.
 *
 * @security Hides the exact "last scanned" block and the true need from the server. Does NOT hide that
 * this IP scans GhostPay announcements, nor the (coarse) window itself.
 * @returns `{ from, to }`: inclusive, `from % align == 0`, `(to + 1) % align == 0`, `to - from + 1 >= minSpan`, covers the request.
 */
export function padWindow(from: bigint, to: bigint, align: number, minSpan: number): { from: bigint; to: bigint } {
  requireArg(from >= 0n && to >= from, 'bad window');
  requireArg(Number.isInteger(align) && align >= 1 && align <= MAX_PARAM, 'align out of range');
  requireArg(Number.isInteger(minSpan) && minSpan >= 1 && minSpan <= MAX_PARAM, 'minSpan out of range');
  const a = BigInt(align);
  const start = from - (from % a);
  let end = ((to + 1n + a - 1n) / a) * a;
  while (end - start < BigInt(minSpan)) end += a;
  return { from: start, to: end - 1n };
}
