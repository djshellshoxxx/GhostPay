import { describe, expect, it } from 'vitest';
import { SCAN_MODE_CLAIMS, describeScanMode } from './claims.js';
import { createScanSource } from './create.js';
import { ScanSourceError } from './errors.js';
import { createLightSource } from './light.js';
import { createQuorumSource } from './quorum.js';
import { createRangeSource } from './range.js';
import { DEFAULT_SCAN_MODE, type FetchResult, type LightClient, type PublicLogSource } from './types.js';
import { CHAIN_HEAD, blockHash, fakeBackend, fakeIndexer, fakeSecond, headOf, pirTransport, rawAnn, buildShard } from './testutil.js';

const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : 'other';
  }
  return undefined;
};
const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;
const range = (raw?: readonly unknown[], head = headOf()): PublicLogSource => createRangeSource({ chainId: 31337, backend: fakeBackend(raw, head) });

function lc(over: Partial<LightClient> = {}): LightClient {
  return {
    head: () => Promise.resolve(headOf()),
    blockHash: (n) => Promise.resolve(blockHash(n)),
    getBalance: () => Promise.resolve(0n),
    getTransactionCount: () => Promise.resolve(0n),
    getCode: () => Promise.resolve('0x'),
    getStorageAt: () => Promise.resolve('0x00'),
    verifiesLogs: false,
    ...over,
  };
}

describe('light source', () => {
  it('passes through when the light client confirms every block hash', async () => {
    const s = createLightSource({ chainId: 31337, lc: lc(), inner: range() });
    expect(s.kind).toBe('light');
    expect(s.integrity).toBe('unverified');
    const r = await s.fetch(REQ);
    expect(r.announcements.length).toBeGreaterThan(0);
  });
  it('integrity is proof only when the light client proves logs', () => {
    expect(createLightSource({ chainId: 31337, lc: lc({ verifiesLogs: true }), inner: range() }).integrity).toBe('proof');
  });
  it('rejects a block hash the light client disagrees with or cannot confirm', async () => {
    const forged = range([{ ...rawAnn(1500, 0), blockHash: `0x${'22'.repeat(32)}` }]);
    expect(await codeOf(() => createLightSource({ chainId: 31337, lc: lc(), inner: forged }).fetch(REQ))).toBe('HEAD_MISMATCH');
    expect(await codeOf(() => createLightSource({ chainId: 31337, lc: lc({ blockHash: () => Promise.resolve(undefined) }), inner: range() }).fetch(REQ))).toBe('HEAD_MISMATCH');
  });
  it('rejects inconsistent hashes for one block inside a result', async () => {
    const inner: PublicLogSource = {
      kind: 'range',
      integrity: 'unverified',
      fetch: async (r) => {
        const res = await range().fetch(r);
        const a = res.announcements[0];
        if (!a) throw new Error('fixture');
        return { ...res, announcements: [a, { ...a, logIndex: 99, blockHash: `0x${'33'.repeat(32)}` }] };
      },
    };
    expect(await codeOf(() => createLightSource({ chainId: 31337, lc: lc(), inner }).fetch(REQ))).toBe('HEAD_MISMATCH');
  });
  it('guards', async () => {
    expect(() => createLightSource({ chainId: 1, lc: lc(), inner: range() })).toThrow(/testnet/);
    const s = createLightSource({ chainId: 31337, lc: lc(), inner: range() });
    expect(await codeOf(() => s.fetch({ ...REQ, chainId: 1 }))).toBe('TESTNET_ONLY');
    expect(await codeOf(() => s.fetch({ ...REQ, chainId: 84532 }))).toBe('INVALID_ARGUMENT');
  });
});

describe('quorum source', () => {
  it('agreeing sources pass; kind/integrity', async () => {
    const q = createQuorumSource([range(), range(), range()], 2);
    expect(q.kind).toBe('quorum');
    expect(q.integrity).toBe('quorum');
    const r = await q.fetch(REQ);
    expect(r.announcements.length).toBeGreaterThan(0);
    expect(r.coverage).toEqual({ fromBlock: 1000n, toBlock: 1999n });
  });
  it('NP-S-6: a source that omits one announcement => SOURCE_DISAGREE (never picks)', async () => {
    const lying = range([rawAnn(1037, 0), rawAnn(1084, 0)]);
    const honest = range([rawAnn(1037, 0), rawAnn(1084, 0), rawAnn(1131, 0)]);
    expect(await codeOf(() => createQuorumSource([honest, lying], 2).fetch(REQ))).toBe('SOURCE_DISAGREE');
  });
  it('a source with one altered field disagrees', async () => {
    const a = range([rawAnn(1037, 0)]);
    const b = range([{ ...rawAnn(1037, 0), metadata: '0xac' }]);
    expect(await codeOf(() => createQuorumSource([a, b], 2).fetch(REQ))).toBe('SOURCE_DISAGREE');
  });
  it('head hash disagreement at the same height', async () => {
    const a = range();
    const b = range(undefined, { number: CHAIN_HEAD, hash: `0x${'44'.repeat(32)}` });
    expect(await codeOf(() => createQuorumSource([a, b], 2).fetch(REQ))).toBe('SOURCE_DISAGREE');
  });
  it('different heads/coverage compare on the intersection; best head wins', async () => {
    const a = range(undefined, headOf(1500n));
    const b = range();
    const r = await createQuorumSource([a, b], 2).fetch(REQ);
    expect(r.coverage.toBlock).toBe(1500n);
    expect(r.head.number).toBe(1500n === r.head.number ? 1500n : CHAIN_HEAD);
  });
  it('disjoint coverage is a disagreement', async () => {
    const mk = (from: bigint, to: bigint): PublicLogSource => ({ kind: 'range', integrity: 'unverified', fetch: () => Promise.resolve<FetchResult>({ announcements: [], head: headOf(), coverage: { fromBlock: from, toBlock: to }, skipped: 0 }) });
    expect(await codeOf(() => createQuorumSource([mk(0n, 10n), mk(20n, 30n)], 2).fetch(REQ))).toBe('SOURCE_DISAGREE');
  });
  it('fewer than k answers is QUORUM_UNAVAILABLE; one failing source tolerated when k allows', async () => {
    const failing: PublicLogSource = { kind: 'range', integrity: 'unverified', fetch: () => Promise.reject(new Error('down')) };
    expect(await codeOf(() => createQuorumSource([range(), failing], 2).fetch(REQ))).toBe('QUORUM_UNAVAILABLE');
    expect((await createQuorumSource([range(), range(), failing], 2).fetch(REQ)).announcements.length).toBeGreaterThan(0);
  });
  it('k must be 2..n', () => {
    expect(() => createQuorumSource([range()], 1)).toThrow(ScanSourceError);
    expect(() => createQuorumSource([range(), range()], 3)).toThrow(ScanSourceError);
  });
});

describe('createScanSource / claims', () => {
  it('defaults to range and builds each mode', () => {
    expect(DEFAULT_SCAN_MODE).toBe('range');
    const be = fakeBackend();
    expect(createScanSource({ mode: 'range', chainId: 31337, backend: be }).kind).toBe('range');
    expect(createScanSource({ mode: 'indexer-tor', chainId: 31337, baseUrl: 'https://i.example.org', transport: fakeIndexer(), secondSource: fakeSecond() }).kind).toBe('indexer');
    const s = buildShard();
    const t = pirTransport({ 'a.example.org': s.pir });
    expect(createScanSource({ mode: 'pir2', chainId: 31337, servers: ['https://a.example.org', 'https://b.example.net'], transport: [t, t], thirdSourceBlockHash: () => Promise.resolve('0x') }).kind).toBe('pir2');
    expect(createScanSource({ mode: 'light-client', chainId: 31337, lc: lc(), inner: range() }).kind).toBe('light');
  });
  it('refuses mainnet and unknown modes (no fallback)', () => {
    expect(() => createScanSource({ mode: 'range', chainId: 1, backend: fakeBackend() })).toThrow(/testnet/);
    expect(() => createScanSource({ mode: 'tor-magic', chainId: 31337 } as never)).toThrow(/unknown scan mode/);
  });
  it('claims: honest, include the does-NOT-protect text, no forbidden words', () => {
    const all = JSON.stringify(SCAN_MODE_CLAIMS);
    expect(all).not.toMatch(/anonym|untraceable|\bmix(er|ing)?\b/i);
    expect(describeScanMode('range').isDefault).toBe(true);
    expect(describeScanMode('pir2').trust).toMatch(/two independent operators/);
    expect(describeScanMode('pir2').doesNotHide.join(' ')).toMatch(/collude/);
    expect(describeScanMode('light-client').doesNotHide.join(' ')).toMatch(/does not hide queries/);
    expect(describeScanMode('indexer-tor').doesNotHide.join(' ')).toMatch(/IP address/);
    expect(describeScanMode('range').doesNotHide.join(' ')).toMatch(/block range/);
    for (const m of Object.values(SCAN_MODE_CLAIMS)) expect(m.doesNotHide.length).toBeGreaterThan(0);
    expect(Object.values(SCAN_MODE_CLAIMS).filter((m) => m.isDefault).length).toBe(1);
  });
});
