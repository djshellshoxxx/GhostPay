import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PirError } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import { leafHash, manifestLeaves, manifestsEqual, merkleRoot, parseManifest, verifyPage, type Manifest } from './manifest.js';
import { packPages, unpackPage, type PackableAnnouncement } from './pages.js';
import { randomBelow, shuffle, drawBytes } from './rand.js';
import { fakeAnn, seededRand } from './testutil.js';

const SHARD = { chainId: 84532, fromBlock: 100n, toBlock: 200n };
const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof PirError ? e.code : 'other';
  }
  return undefined;
};

describe('testnet guard', () => {
  it('accepts only 31337, 11155111, 84532', () => {
    for (const ok of [31337, 11155111, 84532]) expect(() => { assertTestnetChainId(ok); }).not.toThrow();
    for (const bad of [1, 8453, 10, 137, 0, -1, 84532.5, Number.NaN]) {
      expect(code(() => { assertTestnetChainId(bad); })).toBe('TESTNET_ONLY');
    }
  });
  it('packPages refuses a mainnet shard', () => {
    expect(code(() => packPages([], { ...SHARD, chainId: 1 }))).toBe('TESTNET_ONLY');
  });
});

describe('packPages / unpackPage', () => {
  it('round trips and is deterministic regardless of input order', () => {
    const anns = [fakeAnn(150, 2), fakeAnn(100, 0), fakeAnn(150, 1, 40), fakeAnn(200, 0)];
    const a = packPages(anns, SHARD, 256);
    const b = packPages([...anns].reverse(), SHARD, 256);
    expect(a.manifest).toEqual(b.manifest);
    const all = a.pages.flatMap((p) => unpackPage(p, 256));
    expect(all.map((r) => [r.blockNumber, r.logIndex])).toEqual([[100n, 0], [150n, 1], [150n, 2], [200n, 0]]);
    expect(all[1]).toEqual(fakeAnn(150, 1, 40));
    expect(a.pages.every((p) => p.length === 256)).toBe(true);
  });
  it('splits over pages, never spans a record, ranges recorded', () => {
    const anns = Array.from({ length: 12 }, (_, i) => fakeAnn(100 + i, 0, 20));
    const { pages, manifest } = packPages(anns, SHARD, 256);
    expect(pages.length).toBeGreaterThan(1);
    expect(manifest.nPages).toBe(pages.length);
    manifest.pageRanges.forEach((r, i) => {
      const recs = unpackPage(pages[i] as Uint8Array, 256);
      expect(r).toEqual([recs[0]?.blockNumber.toString(), recs[recs.length - 1]?.blockNumber.toString()]);
    });
  });
  it('empty shard gives one empty zero page', () => {
    const { pages, manifest } = packPages([], SHARD, 256);
    expect(pages.length).toBe(1);
    expect(manifest.pageRanges).toEqual([null]);
    expect(unpackPage(pages[0] as Uint8Array, 256)).toEqual([]);
  });
  it('property: random announcement sets round trip (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.integer({ min: 100, max: 200 }), fc.integer({ min: 0, max: 30 })), {
          selector: ([b, l]) => `${String(b)}:${String(l)}`,
          maxLength: 80,
        }),
        fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 1 }),
        (ids, [m]) => {
          const anns = ids.map(([b, l]) => fakeAnn(b, l, m));
          const x = packPages(anns, SHARD, 512);
          const y = packPages([...anns].reverse(), SHARD, 512);
          expect(manifestsEqual(x.manifest, y.manifest)).toBe(true);
          const back = x.pages.flatMap((p) => unpackPage(p, 512));
          expect(back.length).toBe(anns.length);
          const want = [...anns].sort((p, q) => Number(p.blockNumber - q.blockNumber) || p.logIndex - q.logIndex);
          expect(back).toEqual(want);
          expect(parseManifest(JSON.parse(JSON.stringify(x.manifest)))).toEqual(x.manifest);
        },
      ),
      { numRuns: 60 },
    );
  });
  it('rejects bad input', () => {
    expect(code(() => packPages([], SHARD, 100))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([], SHARD, 2 ** 21))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([], { ...SHARD, fromBlock: 5n, toBlock: 4n }))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([fakeAnn(99, 0)], SHARD, 256))).toBe('INVALID_ARGUMENT'); // outside shard
    expect(code(() => packPages([fakeAnn(100, 0), fakeAnn(100, 0)], SHARD, 256))).toBe('INVALID_ARGUMENT'); // dup
    expect(code(() => packPages([fakeAnn(100, 0, 200)], SHARD, 256))).toBe('INVALID_ARGUMENT'); // too big
    expect(code(() => packPages([{ ...fakeAnn(100, 0), stealthAddress: '0x12' }], SHARD, 256))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([{ ...fakeAnn(100, 0), metadata: 'zz' }], SHARD, 256))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([{ ...fakeAnn(100, 0), logIndex: -1 }], SHARD, 256))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([{ ...fakeAnn(100, 0), schemeId: -1n }], SHARD, 256))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([{ ...fakeAnn(100, 0), metadata: `0x${'00'.repeat(70_000)}` }], SHARD, 1 << 20))).toBe('INVALID_ARGUMENT');
    expect(code(() => packPages([], { ...SHARD, headHash: '0x12' }, 256))).toBe('INVALID_ARGUMENT');
  });
  it('headHash is carried into the manifest', () => {
    const h = `0x${'ee'.repeat(32)}`;
    expect(packPages([], { ...SHARD, headHash: h }, 256).manifest.headHash).toBe(h);
  });
  it('unpackPage is strict', () => {
    const { pages } = packPages([fakeAnn(100, 0)], SHARD, 256);
    const p = pages[0] as Uint8Array;
    expect(code(() => unpackPage(p, 512))).toBe('BAD_PAGE');
    expect(code(() => unpackPage(new Uint8Array(10)))).toBe('BAD_PAGE');
    const dirty = new Uint8Array(p);
    dirty[255] = 1;
    expect(code(() => unpackPage(dirty, 256))).toBe('BAD_PAGE');
    const overrun = new Uint8Array(256);
    new DataView(overrun.buffer).setUint16(0, 1);
    new DataView(overrun.buffer).setUint16(2, 400);
    expect(code(() => unpackPage(overrun, 256))).toBe('BAD_PAGE');
    const manyCount = new Uint8Array(256);
    new DataView(manyCount.buffer).setUint16(0, 500);
    expect(code(() => unpackPage(manyCount, 256))).toBe('BAD_PAGE');
    const shortRec = new Uint8Array(256);
    new DataView(shortRec.buffer).setUint16(0, 1);
    new DataView(shortRec.buffer).setUint16(2, 10);
    expect(code(() => unpackPage(shortRec, 256))).toBe('BAD_PAGE');
    const lenMismatch = new Uint8Array(p);
    new DataView(lenMismatch.buffer).setUint16(2, 127); // wrong record length vs metadata length
    expect(code(() => unpackPage(lenMismatch, 256))).toBe('BAD_PAGE');
    const noRoomForLen = new Uint8Array(256);
    new DataView(noRoomForLen.buffer).setUint16(0, 2);
    new DataView(noRoomForLen.buffer).setUint16(2, 252);
    expect(code(() => unpackPage(noRoomForLen, 256))).toBe('BAD_PAGE');
  });
});

describe('manifest', () => {
  const { pages, manifest } = packPages(Array.from({ length: 9 }, (_, i) => fakeAnn(100 + i, 0, 30)), SHARD, 256);

  it('leafHashes determinism and verifyPage', () => {
    expect(packPages(Array.from({ length: 9 }, (_, i) => fakeAnn(100 + i, 0, 30)), SHARD, 256).manifest.leafHashes).toEqual(manifest.leafHashes);
    const leaves = manifestLeaves(manifest);
    pages.forEach((p, i) => { expect(verifyPage(p, i, leaves)).toBe(true); });
    const tampered = new Uint8Array(pages[0] as Uint8Array);
    tampered[100] = (tampered[100] ?? 0) ^ 1;
    expect(verifyPage(tampered, 0, leaves)).toBe(false);
    expect(verifyPage(pages[0] as Uint8Array, 1, leaves)).toBe(false);
    expect(verifyPage(pages[0] as Uint8Array, -1, leaves)).toBe(false);
    expect(verifyPage(pages[0] as Uint8Array, 99, leaves)).toBe(false);
    expect(verifyPage(pages[0] as Uint8Array, 0, [new Uint8Array(3)])).toBe(false);
  });
  it('merkle root: single leaf, odd count, sensitivity, domain separation, bad leaves', () => {
    const l = (b: number): Uint8Array => new Uint8Array(32).fill(b);
    expect(merkleRoot([l(1)])).not.toEqual(l(1)); // leaf is hashed with a 0x00 prefix
    expect(merkleRoot([l(1), l(2), l(3)])).not.toEqual(merkleRoot([l(1), l(2), l(3), l(3)]));
    expect(merkleRoot([l(1), l(2)])).not.toEqual(merkleRoot([l(2), l(1)]));
    expect(code(() => merkleRoot([]))).toBe('INVALID_ARGUMENT');
    expect(code(() => merkleRoot([new Uint8Array(31)]))).toBe('INVALID_ARGUMENT');
    expect(leafHash(new Uint8Array(0)).length).toBe(32);
  });
  it('parseManifest accepts the real manifest and rejects mutations', () => {
    const json = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    expect(parseManifest(json)).toEqual(manifest);
    const mut = (patch: Record<string, unknown>): string | undefined => code(() => parseManifest({ ...json, ...patch }));
    expect(mut({ version: 2 })).toBe('MANIFEST_MISMATCH');
    expect(mut({ chainId: 1 })).toBe('TESTNET_ONLY');
    expect(mut({ chainId: '84532' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageBytes: 10 })).toBe('MANIFEST_MISMATCH');
    expect(mut({ nPages: 0 })).toBe('MANIFEST_MISMATCH');
    expect(mut({ root: `0x${'00'.repeat(32)}` })).toBe('MANIFEST_MISMATCH'); // recomputed root differs
    expect(mut({ root: 'nope' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ leafHashes: [] })).toBe('MANIFEST_MISMATCH');
    expect(mut({ leafHashes: (json['leafHashes'] as string[]).map(() => 'x') })).toBe('MANIFEST_MISMATCH');
    expect(mut({ headHash: 'bad' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ fromBlock: '-1' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ fromBlock: '300' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ toBlock: '18446744073709551616' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: 'x' })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: [] })).toBe('MANIFEST_MISMATCH');
    const n = manifest.nPages;
    expect(mut({ pageRanges: Array.from({ length: n }, () => ['1'] ) })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: Array.from({ length: n }, () => 5 ) })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: Array.from({ length: n }, () => [1, 2]) })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: Array.from({ length: n }, () => ['50', '60']) })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: Array.from({ length: n }, () => ['150', '120']) })).toBe('MANIFEST_MISMATCH');
    expect(mut({ pageRanges: Array.from({ length: n }, () => ['150', '250']) })).toBe('MANIFEST_MISMATCH');
    expect(code(() => parseManifest(null))).toBe('MANIFEST_MISMATCH');
    expect(code(() => parseManifest([]))).toBe('MANIFEST_MISMATCH');
    // null page ranges accepted
    const empty = packPages([], SHARD, 256).manifest;
    expect(parseManifest(JSON.parse(JSON.stringify(empty)))).toEqual(empty);
  });
  it('manifestsEqual detects every field', () => {
    const copy = (p: Partial<Record<keyof Manifest, unknown>>): Manifest => ({ ...manifest, ...p }) as Manifest;
    expect(manifestsEqual(manifest, copy({}))).toBe(true);
    for (const p of [{ chainId: 31337 }, { pageBytes: 512 }, { nPages: 99 }, { root: '0x1' }, { headHash: '0x1' }, { fromBlock: '1' }, { toBlock: '1' }]) {
      expect(manifestsEqual(manifest, copy(p))).toBe(false);
    }
    const lh = [...manifest.leafHashes];
    lh[1] = `0x${'00'.repeat(32)}`;
    expect(manifestsEqual(manifest, copy({ leafHashes: lh }))).toBe(false);
    const pr = [...manifest.pageRanges];
    pr[0] = null;
    expect(manifestsEqual(manifest, copy({ pageRanges: pr }))).toBe(false);
    const pr2 = manifest.pageRanges.map((r) => (r === null ? null : ([r[0], '999'] as const)));
    expect(manifestsEqual(manifest, copy({ pageRanges: pr2 }))).toBe(false);
    const pr3 = manifest.pageRanges.map((r) => (r === null ? null : ([ '0', r[1]] as const)));
    expect(manifestsEqual(manifest, copy({ pageRanges: pr3 }))).toBe(false);
    expect(manifestsEqual(copy({ pageRanges: pr }), manifest)).toBe(false);
  });
});

describe('rand helpers', () => {
  it('randomBelow is in range and unbiased on a small modulus', () => {
    const rand = seededRand('rb');
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 12_000; i++) {
      const v = randomBelow(rand, 6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - 2000)).toBeLessThan(200);
    expect(randomBelow(rand, 1)).toBe(0);
    expect(code(() => randomBelow(rand, 0))).toBe('INVALID_ARGUMENT');
    expect(code(() => randomBelow(rand, 2 ** 33))).toBe('INVALID_ARGUMENT');
  });
  it('randomBelow rejects the biased tail', () => {
    // 0xffffffff >= limit for max=3 (limit = 2^32 - 1): must redraw
    const seq = [Uint8Array.of(255, 255, 255, 255), Uint8Array.of(0, 0, 0, 7)];
    let k = 0;
    expect(randomBelow(() => seq[k++] as Uint8Array, 3)).toBe(1);
  });
  it('shuffle is a permutation', () => {
    const out = shuffle([1, 2, 3, 4, 5, 6], seededRand('s'));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(drawBytes(seededRand('d'), 3).length).toBe(3);
  });
});

export type { PackableAnnouncement };
