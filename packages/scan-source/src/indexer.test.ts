import { describe, expect, it } from 'vitest';
import { ScanSourceError } from './errors.js';
import { createIndexerSource } from './indexer.js';
import { createRangeSource } from './range.js';
import { CHAIN_HEAD, blockHash, fakeBackend, fakeIndexer, fakeSecond, headOf, rawAnn, type IndexerTamper } from './testutil.js';
import { setHash } from './validate.js';
import type { HttpTransport } from './types.js';

const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : 'other';
  }
  return undefined;
};
const mk = (t: IndexerTamper = {}, second = fakeSecond(), extra: Record<string, unknown> = {}) => {
  const tr = fakeIndexer(t);
  return { tr, src: createIndexerSource({ chainId: 31337, baseUrl: 'https://indexer.example.org/api/', transport: tr, secondSource: second, ...extra }) };
};
const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;

describe('indexer source', () => {
  it('returns the same announcement set as the range source (hash equality)', async () => {
    const { src } = mk();
    const a = await src.fetch(REQ);
    const b = await createRangeSource({ chainId: 31337, backend: fakeBackend() }).fetch(REQ);
    expect(a.coverage).toEqual(b.coverage);
    expect(setHash(a.announcements)).toBe(setHash(b.announcements));
    expect(a.announcements.length).toBeGreaterThan(3);
    expect(a.head).toEqual({ number: 1999n, hash: blockHash(1999n) });
    expect(src.kind).toBe('indexer');
  });
  it('AT-NP-13: the request URL has only chainId, padded window and pageSize (no key/tag/address)', async () => {
    const { src, tr } = mk();
    await src.fetch(REQ);
    expect(tr.urls).toEqual(['https://indexer.example.org/api/v1/logs?chainId=31337&from=1000&to=1999&pageSize=1000']);
    for (const u of tr.urls) expect(u).toMatch(/^https:\/\/[^?]+\?chainId=\d+&from=\d+&to=\d+&pageSize=\d+$/);
  });
  it('clamps to the second-source head', async () => {
    const { src } = mk({}, fakeSecond(headOf(1500n)));
    const r = await src.fetch(REQ);
    expect(r.coverage).toEqual({ fromBlock: 1000n, toBlock: 1500n });
    expect(r.head.number).toBe(1500n);
    expect(await codeOf(() => mk({}, fakeSecond(headOf(500n))).src.fetch(REQ))).toBe('OUT_OF_RANGE');
  });
  it('AT-NP-15: forked indexer (different hashes from block 1500) is rejected', async () => {
    expect(await codeOf(() => mk({ forkFrom: 1500n }).src.fetch(REQ))).toBe('HEAD_MISMATCH');
  });
  it('fork only in the middle with intact ends is caught via announcement-block cross-check', async () => {
    const tr: HttpTransport = {
      request: async (r) => {
        const res = await fakeIndexer().request(r);
        const j = JSON.parse(new TextDecoder().decode(res.body)) as { announcements: { blockNumber: string; blockHash: string }[]; headers: { number: string; hash: string; parentHash: string }[] };
        // rewrite block 1500 hash consistently in headers and announcements (parent of 1501 follows)
        const fake = `0x${'ee'.repeat(32)}`;
        for (const h of j.headers) {
          if (h.number === '1500') h.hash = fake;
          if (h.number === '1501') h.parentHash = fake;
        }
        for (const a of j.announcements) if (a.blockNumber === '1500') a.blockHash = fake;
        return { status: 200, body: new TextEncoder().encode(JSON.stringify(j)) };
      },
    };
    const src = createIndexerSource({ chainId: 31337, baseUrl: 'https://i.example.org', transport: tr, secondSource: fakeSecond() });
    expect(await codeOf(() => src.fetch(REQ))).toBe('HEAD_MISMATCH');
  });
  it('gap, broken parent chain, withheld tail are continuity errors', async () => {
    expect(await codeOf(() => mk({ dropHeaderAt: 1300n }).src.fetch(REQ))).toBe('CONTINUITY');
    expect(await codeOf(() => mk({ breakParentAt: 1300n }).src.fetch(REQ))).toBe('CONTINUITY');
    expect(await codeOf(() => mk({ truncateTail: 10 }).src.fetch(REQ))).toBe('CONTINUITY');
  });
  it('announcement whose blockHash is not in the headers is dropped, not trusted', async () => {
    const { src } = mk({ extraRaw: [{ ...rawAnn(1300, 0), blockHash: `0x${'11'.repeat(32)}` }, { junk: 1 }] });
    const r = await src.fetch(REQ);
    expect(r.skipped).toBe(2);
    expect(r.announcements.every((a) => a.blockHash === blockHash(a.blockNumber))).toBe(true);
  });
  it('malformed bodies are BAD_RESPONSE', async () => {
    for (const rawBody of ['not json', 'null', '[]', '{"headers":[]}', '{"headers":[{"number":"1"}],"announcements":[]}', '{"headers":5,"announcements":[]}', JSON.stringify({ headers: [{ number: '1000', hash: blockHash(1000n), parentHash: blockHash(999n) }], announcements: 'x' }), '{"headers":[null],"announcements":[]}']) {
      expect(await codeOf(() => mk({ rawBody }).src.fetch(REQ)), rawBody).toBe('BAD_RESPONSE');
    }
  });
  it('transport failures have fixed text with no URL; non-200 is TRANSPORT', async () => {
    const boom: HttpTransport = { request: () => Promise.reject(new Error('failed https://indexer.example.org/secret')) };
    const src = createIndexerSource({ chainId: 31337, baseUrl: 'https://indexer.example.org', transport: boom, secondSource: fakeSecond() });
    try {
      await src.fetch(REQ);
      expect.unreachable();
    } catch (e) {
      expect((e as ScanSourceError).code).toBe('TRANSPORT');
      expect((e as Error).message).not.toContain('indexer.example.org');
    }
    expect(await codeOf(() => mk({ status: 503 }).src.fetch(REQ))).toBe('TRANSPORT');
  });
  it('too many cross-check blocks is TRUNCATED', async () => {
    expect(await codeOf(() => mk({}, fakeSecond(), { maxCrossChecks: 2 }).src.fetch({ chainId: 31337, fromBlock: 0n, toBlock: CHAIN_HEAD }))).toBe('TRUNCATED');
  });
  it('guards and options', async () => {
    const tr = fakeIndexer();
    expect(() => createIndexerSource({ chainId: 1, baseUrl: 'https://i.example.org', transport: tr, secondSource: fakeSecond() })).toThrow(/testnet/);
    expect(() => createIndexerSource({ chainId: 31337, baseUrl: 'nope', transport: tr, secondSource: fakeSecond() })).toThrow(ScanSourceError);
    expect(() => createIndexerSource({ chainId: 31337, baseUrl: 'ftp://i.example.org', transport: tr, secondSource: fakeSecond() })).toThrow(ScanSourceError);
    expect(() => createIndexerSource({ chainId: 31337, baseUrl: 'https://i.example.org', transport: tr, secondSource: fakeSecond(), pageSize: 0 })).toThrow(ScanSourceError);
    const { src } = mk();
    expect(await codeOf(() => src.fetch({ ...REQ, chainId: 1 }))).toBe('TESTNET_ONLY');
    expect(await codeOf(() => src.fetch({ ...REQ, chainId: 84532 }))).toBe('INVALID_ARGUMENT');
  });
});
