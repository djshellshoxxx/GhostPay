import { ScanSourceError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import type { FetchRequest, FetchResult, PublicLogSource, RangeBackend } from './types.js';
import { normalizeSet, parseAnnouncement } from './validate.js';
import { padRange } from './padded.js';
import { padWindow } from './window.js';

/** Options for {@link createRangeSource}. */
export interface RangeSourceOptions {
  readonly chainId: number;
  readonly backend: RangeBackend;
  /** Blocks per backend call (default 1000 = `getLogsMaxRange` on the testnets). */
  readonly windowBlocks?: number;
  /** Grid for the window start (default `windowBlocks`). */
  readonly align?: number;
  /** Minimum scanned span (default `windowBlocks`). */
  readonly minSpan?: number;
  /** Extra blocks added on both sides of the requested range before it is rounded to the grid (default 0). */
  readonly padBlocks?: number;
  /** Cap on backend calls per fetch (default 50). Exceeding it throws `TRUNCATED`. */
  readonly maxRequests?: number;
  /** Cap on accepted logs per fetch (default 10 000). */
  readonly maxLogs?: number;
  readonly schemeId?: bigint;
}

/**
 * Default scan source (`scanMode = range`): fetches full, grid-aligned announcement ranges and leaves all
 * matching to the local scanner (MH-SCAN-1), so the RPC learns a coarse range, not which announcements are yours.
 *
 * @security Does NOT hide: your IP, the scanned range and timing, that you scan GhostPay announcements.
 * Sends no view tag, key, address or meta-address (the backend interface cannot carry them). Integrity is
 * `unverified`: a lying RPC can hide payments (compose with a quorum or light source).
 * Cancellation stops later windows and discards late results; an already dispatched backend request must still settle.
 * @throws ScanSourceError `TESTNET_ONLY` at creation and on every fetch.
 */
export function createRangeSource(o: RangeSourceOptions): PublicLogSource {
  assertTestnetChainId(o.chainId);
  const windowBlocks = o.windowBlocks ?? 1000;
  const align = o.align ?? windowBlocks;
  const minSpan = o.minSpan ?? windowBlocks;
  const maxRequests = o.maxRequests ?? 50;
  const maxLogs = o.maxLogs ?? 10_000;
  const scheme = o.schemeId ?? 1n;
  requireArg(Number.isInteger(windowBlocks) && windowBlocks >= 1, 'windowBlocks out of range');
  requireArg(Number.isInteger(maxRequests) && maxRequests >= 1 && Number.isInteger(maxLogs) && maxLogs >= 1, 'caps out of range');
  padWindow(0n, 0n, align, minSpan); // validates align/minSpan
  padRange(0n, 0n, { align, minSpan, ...(o.padBlocks === undefined ? {} : { padBlocks: o.padBlocks }) }); // validates padBlocks
  const W = BigInt(windowBlocks);

  return {
    kind: 'range',
    integrity: 'unverified',
    async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
      const assertActive = (): void => { if (signal?.aborted === true) throw new ScanSourceError('TRANSPORT', 'scan cancelled'); };
      assertActive();
      assertTestnetChainId(req.chainId);
      if (req.chainId !== o.chainId) throw new ScanSourceError('INVALID_ARGUMENT', 'chain id mismatch');
      const padded = padRange(req.fromBlock, req.toBlock, { align, minSpan, maxSpan: Number.MAX_SAFE_INTEGER, ...(o.padBlocks === undefined ? {} : { padBlocks: o.padBlocks }) });
      const head = await o.backend.getHead(signal);
      assertActive();
      if (padded.from > head.number) throw new ScanSourceError('OUT_OF_RANGE', 'window starts beyond the head');
      const to = padded.to < head.number ? padded.to : head.number;
      const calls = Number((to - padded.from) / W) + 1;
      if (calls > maxRequests) throw new ScanSourceError('TRUNCATED', 'request budget exceeded');
      const all = [];
      let skipped = 0;
      for (let start = padded.from; start <= to; start += W) {
        assertActive();
        const end = start + W - 1n < to ? start + W - 1n : to;
        const raw = await o.backend.getAnnouncements({ chainId: o.chainId, fromBlock: start, toBlock: end }, signal);
        assertActive();
        for (const r of raw) {
          const a = parseAnnouncement(r, scheme);
          if (a === undefined || a.blockNumber < start || a.blockNumber > end) skipped++;
          else all.push(a);
        }
        if (all.length > maxLogs) throw new ScanSourceError('TRUNCATED', 'log budget exceeded');
      }
      const norm = normalizeSet(all, padded.from, to);
      assertActive();
      return {
        announcements: norm.announcements,
        head,
        coverage: { fromBlock: padded.from, toBlock: to },
        skipped: skipped + norm.dropped,
      };
    },
  };
}
