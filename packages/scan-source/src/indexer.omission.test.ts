import { describe, expect, it } from 'vitest';
import { ScanSourceError } from './errors.js';
import { createIndexerSource } from './indexer.js';
import { SCAN_MODE_CLAIMS } from './claims.js';
import { createRangeSource } from './range.js';
import { RAW, blockHash, fakeBackend, fakeIndexer, fakeSecond, headOf, inRange, rawAnn, type IndexerTamper } from './testutil.js';
import { setHash } from './validate.js';
import type { Head, HeadSource, Hex, HttpTransport } from './types.js';

// PRIV-04 / PRIV-T01 (+ T03 for the fail-closed cases): adversarial indexer responses. All data synthetic.

interface Doc {
  announcements: Record<string, unknown>[];
  headers: { number: string; hash: string; parentHash: string }[];
  head?: unknown;
}

const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;
/** Padded window for REQ with the default 1000-block grid. */
const PADDED = { from: 1000n, to: 1999n } as const;
/** Fixture truth for the padded window: 23 announcements in 22 distinct blocks (block 1500 holds two). */
const EXPECTED_ANNS = 23;
const EXPECTED_ANN_BLOCKS = 22;

const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : 'other';
  }
  return undefined;
};

/** Serves the honest fake indexer, then lets the test rewrite the decoded document (an adversarial operator). */
function rewriting(mutate: (d: Doc, url: string) => void, t: IndexerTamper = {}): HttpTransport & { urls: string[] } {
  const inner = fakeIndexer(t);
  return {
    urls: inner.urls,
    request: async (r) => {
      const res = await inner.request(r);
      const d = JSON.parse(new TextDecoder().decode(res.body)) as Doc;
      mutate(d, r.url);
      return { status: 200, body: new TextEncoder().encode(JSON.stringify(d)) };
    },
  };
}

/** Second source that records every blockHash lookup. */
function recordingSecond(head: Head = headOf(), override: (n: bigint, callNo: number) => Hex | undefined = () => undefined): HeadSource & { looked: bigint[] } {
  const looked: bigint[] = [];
  return {
    looked,
    head: () => Promise.resolve(head),
    blockHash: (n) => {
      looked.push(n);
      return Promise.resolve(override(n, looked.length) ?? blockHash(n));
    },
  };
}

const mk = (transport: HttpTransport, second: HeadSource = fakeSecond(), extra: Record<string, unknown> = {}) =>
  createIndexerSource({ chainId: 31337, baseUrl: 'https://indexer.example.org', transport, secondSource: second, ...extra });

const FORGED: Hex = `0x${'ee'.repeat(32)}`;

describe('indexer source: PRIV-T01 omission and PRIV-T03 fail-closed regressions', () => {
  it('case 1: a valid complete response returns every record, exact counts, and still reports unverified integrity', async () => {
    const second = recordingSecond();
    const src = mk(fakeIndexer(), second);
    const r = await src.fetch(REQ);
    expect(src.integrity).toBe('unverified');
    expect(src.kind).toBe('indexer');
    expect(SCAN_MODE_CLAIMS['indexer-tor'].trust).toContain('could still omit records');
    expect(r.announcements).toHaveLength(EXPECTED_ANNS);
    expect(r.announcements).toHaveLength(inRange(PADDED.from, PADDED.to).length);
    expect(r.skipped).toBe(0);
    expect(r.coverage).toEqual({ fromBlock: PADDED.from, toBlock: PADDED.to });
    expect(r.head).toEqual({ number: 1999n, hash: blockHash(1999n) });
    // window ends + each distinct announcement block, nothing else
    expect(second.looked).toHaveLength(EXPECTED_ANN_BLOCKS + 2);
    expect(new Set(second.looked).size).toBe(EXPECTED_ANN_BLOCKS + 2);
    const range = await createRangeSource({ chainId: 31337, backend: fakeBackend() }).fetch(REQ);
    expect(setHash(r.announcements)).toBe(setHash(range.announcements));
  });

  describe('omission inside genuine headers is not detected and integrity stays unverified', () => {
    it('case 2: one of two announcements dropped from an otherwise valid block (1500) returns a normal, smaller result', async () => {
      const second = recordingSecond();
      const src = mk(rewriting((d) => { d.announcements = d.announcements.filter((a) => !(a['blockNumber'] === '1500' && a['logIndex'] === 2)); }), second);
      const r = await src.fetch(REQ); // does not throw: no check can see this
      expect(src.integrity).toBe('unverified');
      expect(r.announcements).toHaveLength(EXPECTED_ANNS - 1);
      expect(r.announcements.filter((a) => a.blockNumber === 1500n).map((a) => a.logIndex)).toEqual([1]);
      expect(r.skipped).toBe(0); // the omission leaves no trace in the result
      expect(r.coverage).toEqual({ fromBlock: PADDED.from, toBlock: PADDED.to }); // coverage still claims the whole window
      // the honest range source for the same window has the record the indexer hid
      const range = await createRangeSource({ chainId: 31337, backend: fakeBackend() }).fetch(REQ);
      expect(range.announcements).toHaveLength(EXPECTED_ANNS);
      expect(setHash(r.announcements)).not.toBe(setHash(range.announcements));
    });

    it('case 2b: every record of a block dropped while its header stays valid: that block is not even cross-checked', async () => {
      const second = recordingSecond();
      const src = mk(rewriting((d) => { d.announcements = d.announcements.filter((a) => a['blockNumber'] !== '1500'); }), second);
      const r = await src.fetch(REQ);
      expect(src.integrity).toBe('unverified');
      expect(r.announcements).toHaveLength(EXPECTED_ANNS - 2);
      expect(r.announcements.some((a) => a.blockNumber === 1500n)).toBe(false);
      expect(r.skipped).toBe(0);
      expect(second.looked).not.toContain(1500n);
      expect(second.looked).toHaveLength(EXPECTED_ANN_BLOCKS - 1 + 2);
    });

    it('case 9: an empty announcements array hides every valid record; only the two window ends are cross-checked', async () => {
      const second = recordingSecond();
      const src = mk(rewriting((d) => { d.announcements = []; }), second);
      const r = await src.fetch(REQ);
      expect(src.integrity).toBe('unverified');
      expect(r.announcements).toEqual([]);
      expect(r.skipped).toBe(0);
      expect(r.coverage).toEqual({ fromBlock: PADDED.from, toBlock: PADDED.to });
      expect(second.looked).toEqual([1000n, 1999n]);
      expect(inRange(PADDED.from, PADDED.to)).toHaveLength(EXPECTED_ANNS); // the records really exist on the fake chain
    });

    it('case 9b: an indexer that honours pageSize by cutting the announcement list short (no cursor, no flag) is equally undetected', async () => {
      const src = mk(rewriting((d, url) => { d.announcements = d.announcements.slice(0, Number(new URL(url).searchParams.get('pageSize')) > 0 ? 5 : 0); }), recordingSecond(), { pageSize: 5 });
      const r = await src.fetch(REQ);
      expect(src.integrity).toBe('unverified');
      expect(r.announcements).toHaveLength(5);
      expect(r.skipped).toBe(0);
      expect(r.announcements.at(-1)?.blockNumber).toBeLessThan(1500n); // the tail of the window silently vanished
    });

    it('a forged hash on an announcement-free middle block is not cross-checked either (sampled block identity)', async () => {
      const second = recordingSecond();
      const src = mk(rewriting((d) => {
        for (const h of d.headers) {
          if (h.number === '1300') h.hash = FORGED;
          if (h.number === '1301') h.parentHash = FORGED;
        }
      }), second);
      const r = await src.fetch(REQ);
      expect(src.integrity).toBe('unverified');
      expect(r.announcements).toHaveLength(EXPECTED_ANNS);
      expect(second.looked).not.toContain(1300n);
    });
  });

  it('case 3: a missing block header (first, middle or last) is CONTINUITY', async () => {
    for (const dropped of ['1000', '1300', '1999']) {
      const src = mk(rewriting((d) => { d.headers = d.headers.filter((h) => h.number !== dropped); }));
      expect(await codeOf(() => src.fetch(REQ)), dropped).toBe('CONTINUITY');
    }
    expect(await codeOf(() => mk(fakeIndexer({ dropHeaderAt: 1300n })).fetch(REQ))).toBe('CONTINUITY');
    // no headers at all is a malformed response, not a window
    expect(await codeOf(() => mk(rewriting((d) => { d.headers = []; })).fetch(REQ))).toBe('BAD_RESPONSE');
  });

  it('case 4: a wrong parent hash breaks the chain (CONTINUITY), also when the number sequence is intact', async () => {
    expect(await codeOf(() => mk(fakeIndexer({ breakParentAt: 1300n })).fetch(REQ))).toBe('CONTINUITY');
    const swapped = mk(rewriting((d) => { const h = d.headers.find((x) => x.number === '1500'); if (h) h.parentHash = blockHash(1498n); }));
    expect(await codeOf(() => swapped.fetch(REQ))).toBe('CONTINUITY');
    const lastBroken = mk(rewriting((d) => { const h = d.headers.at(-1); if (h) h.parentHash = FORGED; }));
    expect(await codeOf(() => lastBroken.fetch(REQ))).toBe('CONTINUITY');
  });

  it('case 5: a block hash that disagrees with the second source is HEAD_MISMATCH (end blocks and announcement blocks)', async () => {
    for (const n of [1000n, 1037n, 1500n, 1999n]) {
      const second = recordingSecond(headOf(), (b) => (b === n ? FORGED : undefined));
      expect(await codeOf(() => mk(fakeIndexer(), second).fetch(REQ)), n.toString()).toBe('HEAD_MISMATCH');
    }
    // whole-chain fork from 1500 on: consistent chain, wrong hashes
    expect(await codeOf(() => mk(fakeIndexer({ forkFrom: 1500n })).fetch(REQ))).toBe('HEAD_MISMATCH');
    // hash comparison is case-insensitive, not a bypass or a false alarm
    const upper = recordingSecond(headOf(), (b) => (b === 1500n ? (`0x${blockHash(1500n).slice(2).toUpperCase()}`) : undefined));
    expect((await mk(fakeIndexer(), upper).fetch(REQ)).announcements).toHaveLength(EXPECTED_ANNS);
  });

  it('case 6: duplicated announcements are collapsed, counted as skipped, and the first copy wins', async () => {
    const original = inRange(1500n, 1500n)[0] as Record<string, unknown>;
    const forgedTwin = { ...original, metadata: `0x${'cd'.repeat(3)}`, blockHash: blockHash(1500n) };
    const src = mk(rewriting((d) => { d.announcements.push({ ...d.announcements[0] }, { ...original }, forgedTwin); }));
    const r = await src.fetch(REQ);
    expect(r.announcements).toHaveLength(EXPECTED_ANNS);
    expect(r.skipped).toBe(3);
    expect(new Set(r.announcements.map((a) => a.id)).size).toBe(EXPECTED_ANNS);
    expect(r.announcements.find((a) => a.id === `${blockHash(1500n)}:${String(original['logIndex'])}`)?.metadata).toBe(original['metadata']);
    expect(setHash(r.announcements)).toBe(setHash((await createRangeSource({ chainId: 31337, backend: fakeBackend() }).fetch(REQ)).announcements));
  });

  it('case 7: too many blocks to cross-check is TRUNCATED, exactly at the cap, before any second-source lookup', async () => {
    const need = EXPECTED_ANN_BLOCKS + 2;
    const atCap = recordingSecond();
    const ok = await mk(fakeIndexer(), atCap, { maxCrossChecks: need }).fetch(REQ);
    expect(ok.announcements).toHaveLength(EXPECTED_ANNS);
    expect(atCap.looked).toHaveLength(need);
    const over = recordingSecond();
    expect(await codeOf(() => mk(fakeIndexer(), over, { maxCrossChecks: need - 1 }).fetch(REQ))).toBe('TRUNCATED');
    expect(over.looked).toEqual([]);
    // a withheld header tail (truncated page of headers) never becomes a shorter "successful" window
    expect(await codeOf(() => mk(fakeIndexer({ truncateTail: 1 })).fetch(REQ))).toBe('CONTINUITY');
    expect(await codeOf(() => mk(fakeIndexer({ truncateTail: 500 })).fetch(REQ))).toBe('CONTINUITY');
  });

  it('case 8: headers that do not cover the padded window exactly are CONTINUITY (start, end, or both)', async () => {
    const cases: [string, (d: Doc) => void][] = [
      ['starts late', (d) => { d.headers = d.headers.filter((h) => Number(h.number) >= 1100); }],
      ['starts early', (d) => { d.headers.unshift({ number: '999', hash: blockHash(999n), parentHash: blockHash(998n) }); }],
      ['ends early', (d) => { d.headers = d.headers.filter((h) => Number(h.number) <= 1700); }],
      ['only the unpadded request', (d) => { d.headers = d.headers.filter((h) => Number(h.number) >= 1200 && Number(h.number) <= 1700); }],
      ['duplicate header', (d) => { d.headers.splice(5, 0, { ...(d.headers[5] as Doc['headers'][number]) }); }],
    ];
    for (const [name, fn] of cases) expect(await codeOf(() => mk(rewriting(fn)).fetch(REQ)), name).toBe('CONTINUITY');
    // the request itself is on the padded grid, not the caller's window
    const t = fakeIndexer();
    await mk(t).fetch(REQ);
    expect(t.urls).toEqual(['https://indexer.example.org/v1/logs?chainId=31337&from=1000&to=1999&pageSize=1000']);
  });

  it('case 8b: records outside the verified window are dropped and counted, never returned', async () => {
    const outside = [rawAnn(999, 0), rawAnn(2000, 0)].map((a, i) => (i === 0 ? { ...a, blockHash: blockHash(999n) } : { ...a, blockHash: blockHash(2000n) }));
    const r = await mk(fakeIndexer({ extraRaw: outside })).fetch(REQ);
    expect(r.announcements).toHaveLength(EXPECTED_ANNS);
    expect(r.announcements.every((a) => a.blockNumber >= PADDED.from && a.blockNumber <= PADDED.to)).toBe(true);
    expect(r.skipped).toBe(2);
  });

  it('case 10: indexer vs independent RPC disagreement is HEAD_MISMATCH; second-source failures propagate, never swallowed', async () => {
    const lying: HeadSource = { head: () => Promise.resolve(headOf()), blockHash: () => Promise.resolve(FORGED) };
    expect(await codeOf(() => mk(fakeIndexer(), lying).fetch(REQ))).toBe('HEAD_MISMATCH');
    const broken: HeadSource = { head: () => Promise.resolve(headOf()), blockHash: () => Promise.reject(new Error('rpc down')) };
    await expect(mk(fakeIndexer(), broken).fetch(REQ)).rejects.toThrow('rpc down');
    const noHead: HeadSource = { head: () => Promise.reject(new Error('no head')), blockHash: (n) => Promise.resolve(blockHash(n)) };
    await expect(mk(fakeIndexer(), noHead).fetch(REQ)).rejects.toThrow('no head');
    // an announcement whose own blockHash contradicts the header it sits in is dropped, not trusted
    const contra = rawAnn(1500, 5);
    const r = await mk(fakeIndexer({ extraRaw: [{ ...contra, blockHash: FORGED }] })).fetch(REQ);
    expect(r.skipped).toBe(1);
    expect(r.announcements).toHaveLength(EXPECTED_ANNS);
  });

  it('case 11: a reorg between calls (second-source hash changes) fails the next fetch with HEAD_MISMATCH', async () => {
    let reorged = false;
    const second: HeadSource = { head: () => Promise.resolve(headOf()), blockHash: (n) => Promise.resolve(reorged && n >= 1500n ? FORGED : blockHash(n)) };
    const src = mk(fakeIndexer(), second);
    expect((await src.fetch(REQ)).announcements).toHaveLength(EXPECTED_ANNS);
    reorged = true;
    expect(await codeOf(() => src.fetch(REQ))).toBe('HEAD_MISMATCH');
  });

  it('case 11b: a reorg in the middle of one fetch (cross-check lookups) is caught on the first changed hash', async () => {
    const second = recordingSecond(headOf(), (n, callNo) => (callNo > 5 ? FORGED : undefined));
    expect(await codeOf(() => mk(fakeIndexer(), second).fetch(REQ))).toBe('HEAD_MISMATCH');
    expect(second.looked).toHaveLength(6); // stops at the first disagreement
  });

  it('case 11c: the indexer switching to a fork between two paginated windows is caught by the second window', async () => {
    let calls = 0;
    const tr: HttpTransport = {
      request: (r) => {
        calls++;
        return fakeIndexer(calls > 1 ? { forkFrom: 2000n } : {}).request(r);
      },
    };
    const src = mk(tr);
    expect((await src.fetch({ chainId: 31337, fromBlock: 1000n, toBlock: 1999n })).coverage.toBlock).toBe(1999n);
    expect(await codeOf(() => src.fetch({ chainId: 31337, fromBlock: 2000n, toBlock: 2999n }))).toBe('HEAD_MISMATCH');
  });

  it('case 12: stale indexer (head behind the second source) is CONTINUITY, never a shorter successful window', async () => {
    const stale = mk(rewriting((d) => { d.headers = d.headers.filter((h) => Number(h.number) <= 1800); }));
    expect(await codeOf(() => stale.fetch(REQ))).toBe('CONTINUITY');
    // stale on every header: the whole window is withheld
    const nothing = mk(rewriting((d) => { d.headers = d.headers.slice(0, 1); }));
    expect(await codeOf(() => nothing.fetch(REQ))).toBe('CONTINUITY');
  });

  it('case 12b: indexer ahead of the second source is clamped to the second-source head; records beyond it are not returned', async () => {
    const second = recordingSecond(headOf(1500n));
    const r = await mk(fakeIndexer(), second).fetch(REQ);
    expect(r.coverage).toEqual({ fromBlock: 1000n, toBlock: 1500n });
    expect(r.head).toEqual({ number: 1500n, hash: blockHash(1500n) });
    const expected = inRange(1000n, 1500n).length;
    expect(r.announcements).toHaveLength(expected);
    expect(r.announcements.every((a) => a.blockNumber <= 1500n)).toBe(true);
    expect(r.skipped).toBe(inRange(1501n, 1999n).length); // beyond-head records are dropped and counted
    expect(Math.max(...second.looked.map(Number))).toBe(1500);
  });

  it('case 12c: second-source head before the padded window start is OUT_OF_RANGE; at exactly the start it covers one block', async () => {
    expect(await codeOf(() => mk(fakeIndexer(), fakeSecond(headOf(999n))).fetch(REQ))).toBe('OUT_OF_RANGE');
    const r = await mk(fakeIndexer(), fakeSecond(headOf(1000n))).fetch(REQ);
    expect(r.coverage).toEqual({ fromBlock: 1000n, toBlock: 1000n });
    expect(r.announcements).toEqual([]);
  });

  it('malformed or hostile transport output never yields a result: non-200, bad JSON, wrong shapes', async () => {
    expect(await codeOf(() => mk(fakeIndexer({ status: 500 })).fetch(REQ))).toBe('TRANSPORT');
    expect(await codeOf(() => mk(fakeIndexer({ rawBody: '{"headers":' })).fetch(REQ))).toBe('BAD_RESPONSE');
    expect(await codeOf(() => mk(rewriting((d) => { (d as unknown as Record<string, unknown>)['announcements'] = null; })).fetch(REQ))).toBe('BAD_RESPONSE');
    // sanity: the fixture really holds 23 records in the window
    expect(RAW.filter((r) => Number(r['blockNumber']) >= 1000 && Number(r['blockNumber']) <= 1999)).toHaveLength(EXPECTED_ANNS);
  });
});
