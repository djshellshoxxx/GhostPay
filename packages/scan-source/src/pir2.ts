import { PirClient, PirError, createHttpLink, pagesForRange, type RandomBytes } from '@ghostpay/pir-two-server';
import { ScanSourceError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import type { FetchRequest, FetchResult, HttpTransport, PublicLogSource } from './types.js';
import { normalizeSet, parseAnnouncement } from './validate.js';
import { padWindow } from './window.js';

/** Epoch policy: pages fetched per scan epoch, real plus dummy (NP-P-4). */
export interface EpochPolicy {
  /** At least 4; the real page count of any single fetch must be smaller. Default 8. */
  readonly pagesPerEpoch: number;
}

/** Options for {@link createPir2Source}. */
export interface Pir2SourceOptions {
  readonly chainId: number;
  /** Base URLs of the two PIR servers (different operators/domains). */
  readonly servers: readonly [string, string];
  /** One transport per server (use distinct isolation labels / circuits). */
  readonly transport: readonly [HttpTransport, HttpTransport];
  readonly epoch?: EpochPolicy;
  /** Hash of block `n` from a source other than the two servers (NP-P-6). Required. */
  readonly thirdSourceBlockHash: (n: bigint) => Promise<string>;
  readonly align?: number;
  readonly minSpan?: number;
  readonly rand?: RandomBytes;
  /** Testing only: accept two servers of one operator (no privacy). */
  readonly allowSameOperatorNoPrivacy?: boolean;
  readonly schemeId?: bigint;
}

/**
 * Two-server PIR source (`scanMode = pir2`). Maps the padded window to the shard pages that intersect it,
 * fetches those pages privately (padded with dummy pages to a fixed per-epoch count), verifies each against the
 * manifest leaf hashes, and revalidates every record.
 *
 * @security Hides which pages you read from each single server IF the two servers do not collude. Does NOT hide:
 * your IP (use a network profile), that you use PIR, timing, or anything if the servers collude / are one operator;
 * a lying server is detected and rejected, not corrected. Pages are public data; scanning stays local.
 * The mapping window -> pages is public (manifest page ranges), so the page SET reveals the window only to a
 * colluding pair. A window needing >= `pagesPerEpoch` pages throws `PIR_FAILED`: raise it or shrink the window.
 * @throws ScanSourceError `TESTNET_ONLY`, `PIR_INTEGRITY`, `PIR_FAILED`, `OUT_OF_RANGE`, `HEAD_MISMATCH`.
 */
export function createPir2Source(o: Pir2SourceOptions): PublicLogSource {
  assertTestnetChainId(o.chainId);
  const align = o.align ?? 1000;
  const minSpan = o.minSpan ?? 1000;
  const scheme = o.schemeId ?? 1n;
  padWindow(0n, 0n, align, minSpan);
  requireArg(o.servers.length === 2 && o.transport.length === 2, 'exactly two servers and two transports');

  return {
    kind: 'pir2',
    integrity: 'unverified',
    async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
      assertTestnetChainId(req.chainId);
      if (req.chainId !== o.chainId) throw new ScanSourceError('INVALID_ARGUMENT', 'chain id mismatch');
      const padded = padWindow(req.fromBlock, req.toBlock, align, minSpan);
      try {
        const link = (i: 0 | 1) => createHttpLink(o.servers[i], o.chainId, o.transport[i], signal ? { signal } : {});
        const client = await PirClient.open({
          chainId: o.chainId,
          links: [link(0), link(1)],
          thirdSourceBlockHash: o.thirdSourceBlockHash,
          ...(o.epoch ? { pagesPerEpoch: o.epoch.pagesPerEpoch } : {}),
          ...(o.rand ? { rand: o.rand } : {}),
          ...(o.allowSameOperatorNoPrivacy === true ? { allowSameOperatorNoPrivacy: true } : {}),
        });
        const m = client.manifest;
        const from = padded.from > BigInt(m.fromBlock) ? padded.from : BigInt(m.fromBlock);
        const to = padded.to < BigInt(m.toBlock) ? padded.to : BigInt(m.toBlock);
        if (from > to) throw new ScanSourceError('OUT_OF_RANGE', 'window outside the PIR shard');
        const pages = await client.fetchRecords(pagesForRange(m, from, to));
        const parsed = [];
        let skipped = 0;
        for (const recs of pages.values()) {
          for (const r of recs) {
            const a = parseAnnouncement(r, scheme);
            if (a === undefined) skipped++;
            else parsed.push(a);
          }
        }
        const norm = normalizeSet(parsed, from, to);
        // headHash is non-null here: the third-source check in open() requires it
        return {
          announcements: norm.announcements,
          head: { number: BigInt(m.toBlock), hash: m.headHash as `0x${string}` },
          coverage: { fromBlock: from, toBlock: to },
          skipped: skipped + norm.dropped,
        };
      } catch (e) {
        if (e instanceof ScanSourceError) throw e;
        if (e instanceof PirError) {
          if (e.code === 'TESTNET_ONLY') throw new ScanSourceError('TESTNET_ONLY', 'chain id is not an allowed testnet');
          if (e.code === 'PIR_INTEGRITY' || e.code === 'MANIFEST_MISMATCH' || e.code === 'BAD_PAGE') {
            throw new ScanSourceError('PIR_INTEGRITY', 'PIR data failed verification');
          }
        }
        throw new ScanSourceError('PIR_FAILED', 'PIR fetch failed');
      }
    },
  };
}
