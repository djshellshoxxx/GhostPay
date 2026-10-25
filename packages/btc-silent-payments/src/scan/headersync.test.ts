import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from '../errors.js';
import { parseHeader } from '../header.js';
import { REGTEST_GENESIS, extend, regtestChain } from '../headers.testutil.js';
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
