import { ScanSourceError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import type { FetchRequest, FetchResult, Head, HeadSource, Hex, HttpTransport, PublicLogSource } from './types.js';
import { normalizeSet, parseAnnouncement } from './validate.js';
import { padWindow } from './window.js';

/** Options for {@link createIndexerSource}. */
export interface IndexerSourceOptions {
  readonly chainId: number;
  /** Indexer base URL. Reach it through a non-direct transport profile to hide your IP; this module cannot check that. */
  readonly baseUrl: string;
  readonly transport: HttpTransport;
  /** Independent source of block hashes (the user's RPC): the indexer is never the only witness (NP-S-7). */
  readonly secondSource: HeadSource;
  readonly windowBlocks?: number;
  readonly align?: number;
  readonly minSpan?: number;
  readonly pageSize?: number;
  readonly timeoutMs?: number;
  /** Response size cap in bytes (default 16 MiB). */
  readonly maxBytes?: number;
  /** Cap on cross-checked announcement blocks per fetch (default 200); more throws `TRUNCATED`. */
  readonly maxCrossChecks?: number;
  readonly schemeId?: bigint;
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DEC = /^(?:0|[1-9][0-9]{0,19})$/;

interface Header {
  readonly number: bigint;
  readonly hash: Hex;
  readonly parentHash: Hex;
}

function bad(): never {
  throw new ScanSourceError('BAD_RESPONSE', 'malformed indexer response');
}

function parseHeaders(raw: unknown): Header[] {
  if (!Array.isArray(raw) || raw.length === 0) return bad();
  return (raw as unknown[]).map((h) => {
    if (typeof h !== 'object' || h === null) return bad();
    const r = h as Record<string, unknown>;
    const n = r['number'];
    const hash = r['hash'];
    const parent = r['parentHash'];
    if (typeof n !== 'string' || !DEC.test(n) || typeof hash !== 'string' || !HEX32.test(hash) || typeof parent !== 'string' || !HEX32.test(parent)) return bad();
    return { number: BigInt(n), hash: hash.toLowerCase() as Hex, parentHash: parent.toLowerCase() as Hex };
  });
}

/**
 * Indexer source (`scanMode = indexer-tor`, roadmap Feature 5 stage 1). `GET /v1/logs?chainId&from&to&pageSize`
 * returns raw public announcements plus the block headers of the window. The client revalidates every record,
 * checks the parent-hash chain is contiguous and complete, and cross-checks the window's first and last block
 * hash and every announcement block hash against `secondSource` (NP-S-7, AT-NP-15). Any gap or mismatch is an error.
 *
 * @security The request carries only chain id, padded window and page size: no key, view tag, address or meta
 * address (NP-S-2). Hides: which announcements are yours (matching is local). Does NOT hide: your IP unless the
 * supplied transport is a non-direct profile; the (padded) range and timing; that you use this indexer. The indexer can
 * still withhold records inside blocks it reports (header contents are not hash-recomputed): integrity is `quorum`-like
 * only for block identity, hence reported as `unverified`.
 * @throws ScanSourceError `TESTNET_ONLY`, `TRANSPORT`, `BAD_RESPONSE`, `CONTINUITY`, `HEAD_MISMATCH`, `TRUNCATED`.
 */
export function createIndexerSource(o: IndexerSourceOptions): PublicLogSource {
  assertTestnetChainId(o.chainId);
  let base: URL;
  try {
    base = new URL(o.baseUrl);
  } catch {
    throw new ScanSourceError('INVALID_ARGUMENT', 'malformed indexer url');
  }
  requireArg(base.protocol === 'https:' || base.protocol === 'http:', 'unsupported url scheme');
  const origin = base.origin + base.pathname.replace(/\/+$/, '');
  const windowBlocks = o.windowBlocks ?? 1000;
  const align = o.align ?? windowBlocks;
  const minSpan = o.minSpan ?? windowBlocks;
  const pageSize = o.pageSize ?? 1000;
  const maxCross = o.maxCrossChecks ?? 200;
  const scheme = o.schemeId ?? 1n;
  requireArg(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100_000, 'pageSize out of range');
  padWindow(0n, 0n, align, minSpan);

  return {
    kind: 'indexer',
    integrity: 'unverified',
    async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
      assertTestnetChainId(req.chainId);
      if (req.chainId !== o.chainId) throw new ScanSourceError('INVALID_ARGUMENT', 'chain id mismatch');
      const padded = padWindow(req.fromBlock, req.toBlock, align, minSpan);
      const second: Head = await o.secondSource.head(signal);
      if (padded.from > second.number) throw new ScanSourceError('OUT_OF_RANGE', 'window starts beyond the head');
      const expectedTo = padded.to < second.number ? padded.to : second.number;

      const url = `${origin}/v1/logs?chainId=${String(o.chainId)}&from=${padded.from.toString()}&to=${padded.to.toString()}&pageSize=${String(pageSize)}`;
      let body: Uint8Array;
      try {
        const r = await o.transport.request({ method: 'GET', url, timeoutMs: o.timeoutMs ?? 30_000, maxBytes: o.maxBytes ?? 16 * 1024 * 1024, signal });
        if (r.status !== 200) throw new ScanSourceError('TRANSPORT', 'indexer request failed');
        body = r.body;
      } catch (e) {
        if (e instanceof ScanSourceError) throw e;
        throw new ScanSourceError('TRANSPORT', 'indexer request failed'); // fixed text: never echo the URL
      }
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(body));
      } catch {
        return bad();
      }
      if (typeof json !== 'object' || json === null) return bad();
      const doc = json as Record<string, unknown>;
      // an indexer ahead of the second source is fine: ignore what lies beyond the window we can check
      const headers = parseHeaders(doc['headers']).filter((h) => h.number <= expectedTo);
      if (headers.length === 0) throw new ScanSourceError('CONTINUITY', 'indexer window is incomplete');
      if (!Array.isArray(doc['announcements'])) return bad();

      // continuity: exact window, contiguous numbers, parent links
      const first = headers[0] as Header;
      const last = headers[headers.length - 1] as Header;
      if (first.number !== padded.from || last.number !== expectedTo || headers.length !== Number(expectedTo - padded.from) + 1) {
        throw new ScanSourceError('CONTINUITY', 'indexer window is incomplete');
      }
      for (let i = 1; i < headers.length; i++) {
        const h = headers[i] as Header;
        const p = headers[i - 1] as Header;
        if (h.number !== p.number + 1n || h.parentHash !== p.hash) throw new ScanSourceError('CONTINUITY', 'indexer parent-hash chain is broken');
      }
      const byNumber = new Map<bigint, Hex>(headers.map((h) => [h.number, h.hash]));

      const parsed = [];
      let skipped = 0;
      for (const raw of doc['announcements'] as unknown[]) {
        const a = parseAnnouncement(raw, scheme);
        if (a === undefined || byNumber.get(a.blockNumber) !== a.blockHash) skipped++;
        else parsed.push(a);
      }
      const norm = normalizeSet(parsed, padded.from, expectedTo);

      // cross-check against the independent source: window ends and every announcement block
      const toCheck = new Set<bigint>([first.number, last.number]);
      for (const a of norm.announcements) toCheck.add(a.blockNumber);
      if (toCheck.size > maxCross) throw new ScanSourceError('TRUNCATED', 'too many blocks to cross-check');
      for (const n of toCheck) {
        const h = await o.secondSource.blockHash(n, signal);
        if (h.toLowerCase() !== byNumber.get(n)) throw new ScanSourceError('HEAD_MISMATCH', 'indexer disagrees with the second source');
      }
      return {
        announcements: norm.announcements,
        head: { number: last.number, hash: last.hash },
        coverage: { fromBlock: padded.from, toBlock: expectedTo },
        skipped: skipped + norm.dropped,
      };
    },
  };
}
