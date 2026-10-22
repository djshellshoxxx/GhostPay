import { ScanSourceError, requireArg } from './errors.js';
import type { FetchRequest, FetchResult, PublicLogSource } from './types.js';
import { setHash } from './validate.js';

/**
 * Quorum source: queries every source, needs at least `k` (>= 2) to answer, and fails closed on ANY disagreement
 * among the answers (NP-S-6). Results are compared on the intersection of all coverages: same announcement set
 * hash, and same hash for heads with the same number. Never picks a winner.
 *
 * @security Protects against a single lying source, not against all of them. Does NOT hide anything: every
 * source sees the request. Querying k sources multiplies what is exposed.
 * @throws ScanSourceError `QUORUM_UNAVAILABLE`, `SOURCE_DISAGREE`.
 */
export function createQuorumSource(sources: readonly PublicLogSource[], k: number): PublicLogSource {
  requireArg(Number.isInteger(k) && k >= 2 && k <= sources.length, 'k must be between 2 and the number of sources');
  return {
    kind: 'quorum',
    integrity: 'quorum',
    async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
      const settled = await Promise.allSettled(sources.map((s) => s.fetch(req, signal)));
      const ok = settled.filter((s): s is PromiseFulfilledResult<FetchResult> => s.status === 'fulfilled').map((s) => s.value);
      if (ok.length < k) throw new ScanSourceError('QUORUM_UNAVAILABLE', 'not enough sources answered');
      const from = ok.reduce((m, r) => (r.coverage.fromBlock > m ? r.coverage.fromBlock : m), 0n);
      const to = ok.reduce((m, r) => (r.coverage.toBlock < m ? r.coverage.toBlock : m), ok[0]?.coverage.toBlock ?? 0n);
      if (from > to) throw new ScanSourceError('SOURCE_DISAGREE', 'sources cover disjoint windows');
      const views = ok.map((r) => r.announcements.filter((a) => a.blockNumber >= from && a.blockNumber <= to));
      const refHash = setHash(views[0] ?? []);
      for (const v of views) {
        if (setHash(v) !== refHash) throw new ScanSourceError('SOURCE_DISAGREE', 'sources disagree on the announcement set');
      }
      const first = ok[0] as FetchResult;
      for (const r of ok) {
        if (r.head.number === first.head.number && r.head.hash !== first.head.hash) {
          throw new ScanSourceError('SOURCE_DISAGREE', 'sources disagree on the head hash');
        }
      }
      const best = ok.reduce((m, r) => (r.head.number > m.head.number ? r : m), first);
      return {
        announcements: views[0] ?? [],
        head: best.head,
        coverage: { fromBlock: from, toBlock: to },
        skipped: ok.reduce((n, r) => n + r.skipped, 0),
      };
    },
  };
}
