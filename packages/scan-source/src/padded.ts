import { ScanSourceError, requireArg } from './errors.js';
import { padWindow } from './window.js';

/** Largest padded span {@link padRange} returns by default (blocks): a bound on one fetch, not a privacy knob. */
export const DEFAULT_MAX_PADDED_SPAN = 1_000_000;

/** Options for {@link padRange} and {@link fetchPadded}. */
export interface PadOptions {
  /** Grid: the padded start is a multiple of it and the padded end + 1 is a multiple of it. */
  readonly align: number;
  /** Minimum padded span (default `align`). */
  readonly minSpan?: number;
  /** Extra blocks added on both sides of the request before it is rounded to the grid (default 0). */
  readonly padBlocks?: number;
  /** Refuse a padded span above this many blocks (default {@link DEFAULT_MAX_PADDED_SPAN}). */
  readonly maxSpan?: number;
}

/**
 * Pads the inclusive range `[from, to]` so the exact range is not revealed: `padBlocks` are added on both sides, then
 * the result is rounded out to the `align` grid with at least `minSpan` blocks (see {@link padWindow}). With `head` the
 * end is clamped to it; a window that starts beyond it is refused. The padded range always covers the request.
 *
 * @security Hides the exact first/last block and the true need from the server. Does NOT hide that this client scans
 * GhostPay announcements, nor the (coarse) window, its timing or the IP. The window holding the head is clamped to it,
 * which shows roughly where the head is (public).
 * @throws ScanSourceError `INVALID_ARGUMENT` (bad range or options, span above `maxSpan`), `OUT_OF_RANGE` (starts beyond `head`).
 */
export function padRange(from: bigint, to: bigint, o: PadOptions, head?: bigint): { from: bigint; to: bigint } {
  const pad = o.padBlocks ?? 0;
  const maxSpan = o.maxSpan ?? DEFAULT_MAX_PADDED_SPAN;
  requireArg(from >= 0n && to >= from, 'bad window');
  requireArg(Number.isInteger(pad) && pad >= 0 && pad <= 10_000_000, 'padBlocks out of range');
  requireArg(Number.isInteger(maxSpan) && maxSpan >= 1, 'maxSpan out of range');
  const lo = from > BigInt(pad) ? from - BigInt(pad) : 0n;
  const w = padWindow(lo, to + BigInt(pad), o.align, o.minSpan ?? o.align);
  if (head !== undefined && w.from > head) throw new ScanSourceError('OUT_OF_RANGE', 'window starts beyond the head');
  const end = head !== undefined && w.to > head ? head : w.to;
  if (end - w.from + 1n > BigInt(maxSpan)) throw new ScanSourceError('INVALID_ARGUMENT', 'padded span too large');
  return { from: w.from, to: end };
}

/** Options for {@link fetchPadded}. */
export interface FetchPaddedOptions extends PadOptions {
  /** Blocks per call to `fetchWindow` (the provider's log range limit). */
  readonly windowBlocks: number;
  /** Chain head, when known: the padded range is clamped to it. */
  readonly head?: bigint;
  /** Cap on `fetchWindow` calls (default 50). Exceeding it throws `TRUNCATED` before any call is made. */
  readonly maxRequests?: number;
  /** `random(n)` returns an integer in `[0, n)`. When given, windows are requested in shuffled order. Use a CSPRNG. */
  readonly random?: (n: number) => number;
  /** Return only items inside the requested range (default true). false returns everything in the padded range. */
  readonly exact?: boolean;
}

/**
 * Fetches `[req.fromBlock, req.toBlock]` through `fetchWindow` after padding it with {@link padRange}, split into calls of
 * at most `windowBlocks`. The server sees grid-aligned windows, not the requested range. Items are returned sorted by
 * block number (stable for equal blocks) and, by default, trimmed back to the requested range so callers see what they asked for.
 *
 * Every window is requested even when the request is small; there is no early exit that would depend on the true range.
 * @throws ScanSourceError as {@link padRange}, plus `TRUNCATED` when more than `maxRequests` calls would be needed.
 */
export async function fetchPadded<T extends { readonly blockNumber: bigint }>(
  req: { readonly fromBlock: bigint; readonly toBlock: bigint },
  fetchWindow: (from: bigint, to: bigint, signal?: AbortSignal) => Promise<readonly T[]>,
  o: FetchPaddedOptions,
  signal?: AbortSignal,
): Promise<{ readonly items: readonly T[]; readonly coverage: { readonly fromBlock: bigint; readonly toBlock: bigint } }> {
  requireArg(Number.isInteger(o.windowBlocks) && o.windowBlocks >= 1, 'windowBlocks out of range');
  const maxRequests = o.maxRequests ?? 50;
  requireArg(Number.isInteger(maxRequests) && maxRequests >= 1, 'maxRequests out of range');
  const padded = padRange(req.fromBlock, req.toBlock, o, o.head);
  const W = BigInt(o.windowBlocks);
  const windows: [bigint, bigint][] = [];
  for (let s = padded.from; s <= padded.to; s += W) windows.push([s, s + W - 1n < padded.to ? s + W - 1n : padded.to]);
  if (windows.length > maxRequests) throw new ScanSourceError('TRUNCATED', 'request budget exceeded');
  const random = o.random;
  if (random !== undefined) {
    for (let i = windows.length - 1; i > 0; i--) {
      const j = random(i + 1);
      requireArg(Number.isInteger(j) && j >= 0 && j <= i, 'random out of range');
      [windows[i], windows[j]] = [windows[j] as [bigint, bigint], windows[i] as [bigint, bigint]];
    }
  }
  const all: T[] = [];
  for (const [s, e] of windows) {
    for (const item of await fetchWindow(s, e, signal)) {
      if (item.blockNumber >= s && item.blockNumber <= e) all.push(item);
    }
  }
  const exact = o.exact ?? true;
  const items = all
    .filter((x) => !exact || (x.blockNumber >= req.fromBlock && x.blockNumber <= req.toBlock))
    .sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0));
  return { items, coverage: { fromBlock: padded.from, toBlock: padded.to } };
}
