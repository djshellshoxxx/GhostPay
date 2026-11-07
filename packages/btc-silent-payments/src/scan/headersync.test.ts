import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from '../errors.js';
import { parseHeader } from '../header.js';
import { REGTEST_GENESIS, extend, mine, regtestChain } from '../headers.testutil.js';
import { CHAIN_PARAMS, HeaderChain, type ChainParams } from '../headerchain.js';
import { HeaderAnchoredTweakSource, syncHeaderChain, syncHeaderChainFromSources, type HeaderSource } from './headersync.js';
import type { BlockOutputs, BlockTweaks, TweakSource } from './types.js';

/** Serves a fixed list of headers (index = height). Records every request. */
class ListHeaderSource implements HeaderSource {
  public readonly calls: string[] = [];
  public constructor(private readonly headers: readonly string[], private readonly tip = headers.length - 1) {}
  public getTipHeight(): Promise<number> {
    this.calls.push('tip');
    return Promise.resolve(this.tip);
  }
  public getHeaders(from: number, count: number): Promise<readonly string[]> {
    this.calls.push(`${String(from)}+${String(count)}`);
    return Promise.resolve(this.headers.slice(from, from + count));
  }
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
};

const MAIN = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 30, 600, 0x207fffff, 1)];

describe('syncHeaderChain', () => {
  it('downloads and validates headers up to the source tip in batches', async () => {
    const c = regtestChain();
    const src = new ListHeaderSource(MAIN);
    const r = await syncHeaderChain(c, src, { batchSize: 8 });
    expect(r).toMatchObject({ adopted: true, reorg: false, forkHeight: 0, tipHeight: 30 });
    expect(c.tipHash).toBe(parseHeader(MAIN[30]!).hash);
    expect(src.calls).toEqual(['tip', '0+1', '1+8', '9+8', '17+8', '25+6']);
    // Already synced: one probe, nothing adopted.
    const again = await syncHeaderChain(c, src);
    expect(again).toMatchObject({ adopted: false, tipHeight: 30, fetched: 1 });
  });
  it('finds the fork point and reorgs to a heavier branch from another source', async () => {
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(MAIN.slice(0, 21)));
    const side = [...MAIN.slice(0, 13), ...extend(MAIN[12]!, 12, 601, 0x207fffff, 9)]; // fork after 12, tip 24
    const r = await syncHeaderChain(c, new ListHeaderSource(side));
    expect(r).toMatchObject({ adopted: true, reorg: true, forkHeight: 12, tipHeight: 24 });
    expect(c.hashAt(13)).toBe(parseHeader(side[13]!).hash);
  });
  it('keeps the heavier chain when a source serves a lighter branch (most-work selection across sources)', async () => {
    const c = regtestChain();
    const light = [...MAIN.slice(0, 6), ...extend(MAIN[5]!, 4, 601, 0x207fffff, 7)]; // tip 9
    const results = await syncHeaderChainFromSources(c, [new ListHeaderSource(light), new ListHeaderSource(MAIN), new ListHeaderSource(light)]);
    expect(results.map((x) => x.ok && x.result.adopted)).toEqual([true, true, false]);
    expect(c.tipHeight).toBe(30);
  });
  it('reports a failing source without aborting the others', async () => {
    const c = regtestChain();
    const broken: HeaderSource = { getTipHeight: () => Promise.resolve(5), getHeaders: () => Promise.resolve(['00']) };
    const results = await syncHeaderChainFromSources(c, [broken, new ListHeaderSource(MAIN)]);
    expect(results[0]).toEqual({ ok: false, code: 'INVALID_RESPONSE' });
    expect(results[1]?.ok).toBe(true);
    const thrower: HeaderSource = { getTipHeight: () => Promise.reject(new Error('x')), getHeaders: () => Promise.resolve([]) };
    expect((await syncHeaderChainFromSources(c, [thrower]))[0]).toEqual({ ok: false, code: 'TRANSPORT_FAILURE' });
  });
  it('fails closed on a source from another chain, short or malformed responses, bad tips and abort', async () => {
    const malformed = [REGTEST_GENESIS, 'zz', ...MAIN.slice(2)];
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(malformed)))).toBe('INVALID_RESPONSE');
    const otherGenesis = [`${REGTEST_GENESIS.slice(0, 152)}03000000`, ...MAIN.slice(1)];
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(otherGenesis)))).toBe('INVALID_HEADER');
    const wrongGenesisChain = extend(MAIN[3]!, 5, 600, 0x207fffff, 3); // heights reported from 0: genesis mismatch
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(wrongGenesisChain)))).toBe('INVALID_HEADER');
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(MAIN, 40)))).toBe('INVALID_RESPONSE');
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(MAIN, -1)))).toBe('INVALID_RESPONSE');
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(MAIN), { batchSize: 0 }))).toBe('INVALID_INPUT');
    const ac = new AbortController();
    ac.abort();
    expect(await codeOf(syncHeaderChain(regtestChain(), new ListHeaderSource(MAIN), { signal: ac.signal }))).toBe('ABORTED');
  });
  it('caps one call at maxHeaders and resumes on the next call', async () => {
    const c = regtestChain();
    expect((await syncHeaderChain(c, new ListHeaderSource(MAIN), { maxHeaders: 10 })).tipHeight).toBe(10);
    expect((await syncHeaderChain(c, new ListHeaderSource(MAIN), { maxHeaders: 10, toHeight: 15 })).tipHeight).toBe(15);
  });
  it('evaluates a heavier fork deeper than maxHeaders in full and adopts it (the probe can overshoot)', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    for (const depth of [31, 35, 39]) {
      const c = regtestChain();
      await syncHeaderChain(c, new ListHeaderSource(LONG));
      const forkAt = 60 - depth;
      const heavier = [...LONG.slice(0, forkAt + 1), ...extend(LONG[forkAt]!, depth + 1, 601, 0x207fffff, 5)];
      const r = await syncHeaderChain(c, new ListHeaderSource(heavier), { maxHeaders: 40 });
      expect(r, `depth ${String(depth)}`).toMatchObject({ adopted: true, reorg: true, forkHeight: forkAt, tipHeight: 61 });
      expect(c.tipHash).toBe(parseHeader(heavier[61]!).hash);
    }
  });
  it('compares a lighter fork against the whole source chain before calling it lighter', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const lighter = [...LONG.slice(0, 26), ...extend(LONG[25]!, 30, 601, 0x207fffff, 6)]; // tip 55
    const src = new ListHeaderSource(lighter);
    const r = await syncHeaderChain(c, src, { maxHeaders: 10 });
    expect(r).toMatchObject({ adopted: false, reorg: false, tipHeight: 60 });
    // Every header of the competing branch up to the source tip was read.
    expect(r.fetched).toBeGreaterThanOrEqual(30);
    expect(c.tipHash).toBe(parseHeader(LONG[60]!).hash);
  });
  it('follows a shallow reorg even when the source is far ahead (the fork budget bounds what is replaced)', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    // One-block reorg at 59, and the source is 50 blocks further on (more than maxForkHeaders past the fork).
    const ahead = [...LONG.slice(0, 60), ...extend(LONG[59]!, 51, 601, 0x207fffff, 8)];
    const src = new ListHeaderSource(ahead);
    const r = await syncHeaderChain(c, src, { maxForkHeaders: 30, batchSize: 4 });
    expect(r).toMatchObject({ adopted: true, reorg: true, forkHeight: 59 });
    // Streamed: it stopped downloading once the branch had more work, and the next call extends normally.
    expect(r.tipHeight).toBeLessThan(110);
    expect(r.fetched).toBeLessThan(40);
    expect((await syncHeaderChain(c, src, { maxForkHeaders: 30 })).tipHeight).toBe(110);
    expect(c.tipHash).toBe(parseHeader(ahead[110]!).hash);
  });
  it('stops at the first invalid header of a competing branch', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const side = [...LONG.slice(0, 41), ...extend(LONG[40]!, 40, 601, 0x207fffff, 9)];
    side[45] = `${side[45]!.slice(0, 8)}${'ab'.repeat(32)}${side[45]!.slice(72)}`; // broken linkage at 45
    const src = new ListHeaderSource(side);
    expect(await codeOf(syncHeaderChain(c, src, { batchSize: 4 }))).toMatch(/INVALID_HEADER|INVALID_RESPONSE/);
    // Nothing past the bad header's batch was requested.
    expect(src.calls.filter((x) => /^\d+\+\d+$/.test(x) && x.split('+')[1] !== '1' && Number(x.split('+')[0]) > 48)).toEqual([]);
    expect(c.tipHash).toBe(parseHeader(LONG[60]!).hash);
  });
  it('F4: a source that answers the probe correctly but serves a branch from below the tip is refused', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 100, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const alt = extend(LONG[95]!, 10, 601, 0x207fffff, 4); // heights 96..105, heavier
    const tricky: HeaderSource = {
      getTipHeight: () => Promise.resolve(105),
      getHeaders: (from, n) => Promise.resolve(from === 100 && n === 1 ? [LONG[100]!] : alt.slice(0, n)),
    };
    expect(await codeOf(syncHeaderChain(c, tricky))).toBe('INVALID_HEADER');
    expect(c.tipHash).toBe(parseHeader(LONG[100]!).hash);
  });
  it('F4: a longer off-tip chunk (which connect would adopt as a reorg) is refused before it is connected', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 100, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const alt = extend(LONG[95]!, 20, 601, 0x207fffff, 4); // heights 96..115: more work than ours
    const tricky: HeaderSource = {
      getTipHeight: () => Promise.resolve(115),
      getHeaders: (from, n) => Promise.resolve(from === 100 && n === 1 ? [LONG[100]!] : alt.slice(0, n)),
    };
    expect(await codeOf(syncHeaderChain(c, tricky))).toBe('INVALID_HEADER');
    expect(c.tipHash).toBe(parseHeader(LONG[100]!).hash);
  });
  it('L-b: an adopted prefix before an invalid header is reported with the failure', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const side = [...LONG.slice(0, 51), ...extend(LONG[50]!, 20, 601, 0x207fffff, 6)];
    side[65] = `${side[65]!.slice(0, 8)}${'ab'.repeat(32)}${side[65]!.slice(72)}`;
    const [r] = await syncHeaderChainFromSources(c, [new ListHeaderSource(side)], { batchSize: 100 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_HEADER', adopted: { adopted: true, reorg: true, forkHeight: 50, tipHeight: 64 } });
  });
  it('L2: finds the fork point exactly, so the budget counts the real depth', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    // Fork after 40: depth 20. The doubling probe lands at 29 (31 deep); a binary search narrows it to 40.
    const heavier = [...LONG.slice(0, 41), ...extend(LONG[40]!, 21, 601, 0x207fffff, 2)];
    expect((await syncHeaderChain(c, new ListHeaderSource(heavier), { maxForkHeaders: 20 })).adopted).toBe(true);
  });
  it('L2: a longer but lighter branch that has not overtaken within maxHeaders is FORK_UNRESOLVED, not "too deep"', async () => {
    // Tiny retarget periods: fast blocks make our chain harder (more work each), slow blocks make the branch easier.
    const TINY: ChainParams = { ...CHAIN_PARAMS.regtest, interval: 4, targetSpacing: 1, targetTimespan: 4, allowMinDifficultyBlocks: false, noRetargeting: false };
    const genesis = mine('0'.repeat(64), 1_700_000_000, 0x200fffff, { version: 1 });
    const fresh = (): HeaderChain =>
      HeaderChain.create({ params: TINY, checkpoint: { height: 0, hash: parseHeader(genesis).hash, headerHex: genesis }, now: () => 2_000_000_000 });
    const grow = (n: number, spacing: number, tag: number): string[] => {
      const g = fresh();
      const out = [genesis];
      for (let i = 0; i < n; i++) {
        const tip = g.headerAt(g.tipHeight)!;
        const hex = mine(tip.hash, tip.time + spacing, g.nextBits(tip.time + spacing), { tag });
        g.connect([hex]);
        out.push(hex);
      }
      return out;
    };
    const ours = grow(12, 1, 1);
    const lighter = grow(30, 100, 2);
    const c = fresh();
    await syncHeaderChain(c, new ListHeaderSource(ours));
    expect(await codeOf(syncHeaderChain(c, new ListHeaderSource(lighter), { maxHeaders: 2 }))).toBe('FORK_UNRESOLVED');
    expect(c.tipHash).toBe(parseHeader(ours[12]!).hash);
    // Compared to the source tip, it is simply lighter.
    expect(await syncHeaderChain(c, new ListHeaderSource(lighter), { maxHeaders: 100 })).toMatchObject({ adopted: false, tipHeight: 12 });
  });
  it('L7: a valid prefix that already has more work is adopted before an invalid header is reported', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const side = [...LONG.slice(0, 51), ...extend(LONG[50]!, 20, 601, 0x207fffff, 6)]; // fork after 50, tip 70
    side[65] = `${side[65]!.slice(0, 8)}${'ab'.repeat(32)}${side[65]!.slice(72)}`; // broken at 65
    expect(await codeOf(syncHeaderChain(c, new ListHeaderSource(side), { batchSize: 100 }))).toMatch(/INVALID_HEADER|INVALID_RESPONSE/);
    expect(c.tipHeight).toBe(64);
    expect(c.tipHash).toBe(parseHeader(side[64]!).hash);
  });
  it('refuses to judge a fork deeper than maxForkHeaders (FORK_TOO_DEEP), changing nothing', async () => {
    const LONG = [REGTEST_GENESIS, ...extend(REGTEST_GENESIS, 60, 600, 0x207fffff, 1)];
    const c = regtestChain();
    await syncHeaderChain(c, new ListHeaderSource(LONG));
    const heavier = [...LONG.slice(0, 21), ...extend(LONG[20]!, 45, 601, 0x207fffff, 7)];
    expect(await codeOf(syncHeaderChain(c, new ListHeaderSource(heavier), { maxForkHeaders: 30 }))).toBe('FORK_TOO_DEEP');
    expect(c.tipHash).toBe(parseHeader(LONG[60]!).hash);
    expect(await codeOf(syncHeaderChain(c, new ListHeaderSource(heavier), { maxForkHeaders: 0 }))).toBe('INVALID_INPUT');
    // The binary search finds the fork at 20 exactly: 40 active headers would be replaced.
    expect(await codeOf(syncHeaderChain(c, new ListHeaderSource(heavier), { maxForkHeaders: 39 }))).toBe('FORK_TOO_DEEP');
    expect((await syncHeaderChain(c, new ListHeaderSource(heavier), { maxForkHeaders: 40 })).adopted).toBe(true);
  });
});

describe('HeaderAnchoredTweakSource', () => {
  const hashes = MAIN.map((h) => parseHeader(h).hash);
  const inner = (hashAt: (h: number) => string, tip = 30): TweakSource => ({
    getTipHeight: () => Promise.resolve(tip),
    getTweaks: (height): Promise<BlockTweaks> => Promise.resolve({ height, blockHash: hashAt(height), tweaks: [] }),
    getOutputs: (height): Promise<BlockOutputs> => Promise.resolve({ height, blockHash: hashAt(height), outputs: [] }),
  });
  it('passes through blocks on the verified best chain and caps the tip at the verified height', async () => {
    const c = regtestChain();
    c.connect(MAIN.slice(1, 21));
    const s = new HeaderAnchoredTweakSource(inner((h) => hashes[h]!), c);
    expect(await s.getTipHeight()).toBe(20);
    expect((await s.getTweaks(5)).blockHash).toBe(hashes[5]);
    expect((await s.getOutputs(20)).blockHash).toBe(hashes[20]);
    expect(await new HeaderAnchoredTweakSource(inner((h) => hashes[h]!), c, { minConfirmations: 6 }).getTipHeight()).toBe(15);
    expect(await new HeaderAnchoredTweakSource(inner((h) => hashes[h]!, 7), c).getTipHeight()).toBe(7);
  });
  it('refuses blocks that are not on the verified chain or above its tip', async () => {
    const c = regtestChain();
    c.connect(MAIN.slice(1, 21));
    const s = new HeaderAnchoredTweakSource(inner((h) => (h === 5 ? 'ab'.repeat(32) : hashes[h]!)), c);
    expect(await codeOf(s.getTweaks(5))).toBe('REORG_DETECTED');
    expect(await codeOf(s.getOutputs(5))).toBe('REORG_DETECTED');
    expect(await codeOf(s.getTweaks(21))).toBe('INVALID_INPUT');
    expect(() => new HeaderAnchoredTweakSource(inner((h) => hashes[h]!), c, { minConfirmations: 0 })).toThrow(/invalid input/);
  });
});
