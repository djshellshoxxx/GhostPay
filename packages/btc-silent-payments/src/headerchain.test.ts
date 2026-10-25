import { describe, expect, it } from 'vitest';
import { parseHeader, targetFromBits } from './header.js';
import { NOW, REGTEST_GENESIS, extend, mine, regtestChain, u32 } from './headers.testutil.js';
import {
  CHAIN_PARAMS,
  HeaderChain,
  blockWork,
  calculateNextWorkRequired,
  compactFromTarget,
  type ChainParams,
} from './headerchain.js';

const MAINNET_GENESIS =
  '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c';
const MAINNET_1 =
  '010000006fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000982051fd1e4ba744bbbe680e1fee14677ba1a3c3540bf7b1cdb606e857233e0e61bc6649ffff001d01e36299';
const MAINNET_1_HASH = '00000000839a8e6886ab5951d76f411475428afc90947ee320161bbf18eb6048';
const MAINNET_2 =
  '010000004860eb18bf1b1620e37e9490fc8a427514416fd75159ab86688e9a8300000000d5fdcc541e25de1c7a5addedf24858b8bb665c9f36ef744ee42c316022c90f9bb0bc6649ffff001d08d2bd61';
const MAINNET_2_HASH = '000000006a625f06636b8bb6ac7b960a8d03705d1ace08b1a19da3fdcc99ddbd';
/** Small retargeting network for tests: 4-block periods, 1 s spacing. Targets stay far below 2^256 / 16. */
const TINY: ChainParams = {
  ...CHAIN_PARAMS.regtest,
  interval: 4,
  targetSpacing: 1,
  targetTimespan: 4,
  allowMinDifficultyBlocks: false,
  noRetargeting: false,
  enforceBip94: false,
};
const TINY_BITS = 0x200fffff;
const tinyGenesis = mine('0'.repeat(64), 1_700_000_000, TINY_BITS, { version: 1 });
const tinyChain = (params: ChainParams = TINY): HeaderChain =>
  HeaderChain.create({ params, checkpoint: { height: 0, hash: parseHeader(tinyGenesis).hash, headerHex: tinyGenesis }, now: NOW });

describe('compact targets and work', () => {
  it('round-trips normalized nBits like arith_uint256::GetCompact', () => {
    for (const bits of [0x1d00ffff, 0x1c05a3f4, 0x207fffff, 0x1b04864c, 0x1e0377ae, 0x03123456, 0x200fffff]) {
      expect(compactFromTarget(targetFromBits(bits))).toBe(bits);
    }
    expect(compactFromTarget(0x80n)).toBe(0x02008000);
    expect(compactFromTarget(0n)).toBe(0);
    expect(CHAIN_PARAMS.mainnet.powLimitBits).toBe(0x1d00ffff);
    expect(CHAIN_PARAMS.regtest.powLimitBits).toBe(0x207fffff);
    expect(CHAIN_PARAMS.signet.powLimitBits).toBe(0x1e0377ae);
  });
  it('computes block proof as 2^256 / (target + 1) (GetBlockProof)', () => {
    expect(blockWork(0x1d00ffff)).toBe(0x100010001n);
    expect(blockWork(0x207fffff)).toBe(2n);
  });
});

describe('calculateNextWorkRequired (Bitcoin Core pow_tests.cpp vectors)', () => {
  const m = CHAIN_PARAMS.mainnet;
  it('get_next_work', () => {
    expect(calculateNextWorkRequired({ lastBits: 0x1d00ffff, lastTime: 1262152739, firstTime: 1261130161, firstBits: 0x1d00ffff }, m)).toBe(0x1d00d86a);
  });
  it('get_next_work_pow_limit', () => {
    expect(calculateNextWorkRequired({ lastBits: 0x1d00ffff, lastTime: 1233061996, firstTime: 1231006505, firstBits: 0x1d00ffff }, m)).toBe(0x1d00ffff);
  });
  it('get_next_work_lower_limit_actual', () => {
    expect(calculateNextWorkRequired({ lastBits: 0x1c05a3f4, lastTime: 1279297671, firstTime: 1279008237, firstBits: 0x1c05a3f4 }, m)).toBe(0x1c0168fd);
  });
  it('get_next_work_upper_limit_actual', () => {
    expect(calculateNextWorkRequired({ lastBits: 0x1c387f6f, lastTime: 1269211443, firstTime: 1263163443, firstBits: 0x1c387f6f }, m)).toBe(0x1d00e1fd);
  });
  it('returns last bits unchanged without retargeting (regtest) and uses first-block bits under BIP-94', () => {
    expect(calculateNextWorkRequired({ lastBits: 0x207fffff, lastTime: 10, firstTime: 0, firstBits: 0x207fffff }, CHAIN_PARAMS.regtest)).toBe(0x207fffff);
    const t4 = CHAIN_PARAMS.testnet4;
    const args = { lastBits: 0x1d00ffff, lastTime: 1262152739, firstTime: 1261130161, firstBits: 0x1c05a3f4 };
    expect(calculateNextWorkRequired(args, t4)).toBe(calculateNextWorkRequired({ ...args, lastBits: 0x1c05a3f4 }, m));
  });
});

describe('HeaderChain on real mainnet headers', () => {
  it('accepts genesis -> 1 -> 2 and reports cumulative work', () => {
    const c = HeaderChain.create({
      params: CHAIN_PARAMS.mainnet,
      checkpoint: { height: 0, hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', headerHex: MAINNET_GENESIS },
      now: NOW,
    });
    const r = c.connect([MAINNET_1, MAINNET_2]);
    expect(r).toEqual({ adopted: true, reorg: false, forkHeight: 0, tipHeight: 2 });
    expect(c.hashAt(1)).toBe(MAINNET_1_HASH);
    expect(c.tipHash).toBe(MAINNET_2_HASH);
    expect(c.tipWork).toBe(3n * 0x100010001n);
  });
  it('refuses headers out of order or a pinned hash that does not match', () => {
    const cp = { height: 0, hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', headerHex: MAINNET_GENESIS };
    const c = HeaderChain.create({ params: CHAIN_PARAMS.mainnet, checkpoint: cp, now: NOW });
    expect(() => c.connect([MAINNET_2])).toThrow(/header-chain rule/);
    expect(() => HeaderChain.create({ params: CHAIN_PARAMS.mainnet, checkpoint: { ...cp, hash: MAINNET_1_HASH } })).toThrow(/header-chain rule/);
    expect(c.tipHeight).toBe(0);
  });
});

describe('HeaderChain contextual rules', () => {
  it('extends a regtest chain', () => {
    const c = regtestChain();
    const hs = extend(REGTEST_GENESIS, 12, 600, 0x207fffff);
    expect(c.connect(hs).tipHeight).toBe(12);
    expect(c.headerAt(12)?.hash).toBe(parseHeader(hs[11]!).hash);
    expect(c.hashAt(13)).toBeUndefined();
    expect(c.hashAt(-1)).toBeUndefined();
  });
  it('refuses nBits that differ from the required value', () => {
    const c = regtestChain();
    const g = parseHeader(REGTEST_GENESIS);
    expect(() => c.connect([mine(g.hash, g.time + 600, 0x2000ffff)])).toThrow(/header-chain rule/);
  });
  it('refuses a header that does not meet its own target', () => {
    const c = regtestChain();
    const ok = extend(REGTEST_GENESIS, 1, 600, 0x207fffff)[0]!;
    // Flip nonces until the hash misses the target.
    let bad = ok;
    for (let n = 1; ; n++) {
      bad = `${ok.slice(0, 152)}${u32(n)}`;
      if (BigInt(`0x${parseHeader(bad).hash}`) > targetFromBits(0x207fffff)) break;
    }
    expect(() => c.connect([bad])).toThrow();
  });
  it('enforces median-time-past and the two-hour future limit', () => {
    const c = regtestChain();
    const hs = extend(REGTEST_GENESIS, 11, 600, 0x207fffff);
    c.connect(hs);
    const tip = parseHeader(hs[10]!);
    // MTP of the last 11 = time of hs[5] (genesis excluded by window); a header at MTP is too old.
    const mtp = parseHeader(hs[5]!).time;
    expect(() => c.connect([mine(tip.hash, mtp, 0x207fffff)])).toThrow(/header-chain rule/);
    expect(c.connect([mine(tip.hash, mtp + 1, 0x207fffff)]).tipHeight).toBe(12);
    expect(() => c.connect([mine(c.tipHash, NOW() + 7201, 0x207fffff)])).toThrow(/header-chain rule/);
    expect(c.connect([mine(c.tipHash, NOW() + 7200, 0x207fffff)]).tipHeight).toBe(13);
  });
  it('enforces BIP-34/66/65 minimum versions from their activation heights', () => {
    const c = regtestChain();
    const g = parseHeader(REGTEST_GENESIS);
    expect(() => c.connect([mine(g.hash, g.time + 1, 0x207fffff, { version: 3 })])).toThrow(/header-chain rule/);
    expect(c.connect([mine(g.hash, g.time + 1, 0x207fffff, { version: 4 })]).tipHeight).toBe(1);
  });
  it('retargets at period boundaries and refuses stale bits', () => {
    const c = tinyChain();
    const period = extend(tinyGenesis, 3, 1, TINY_BITS); // heights 1..3, 1 s apart: actual timespan 3 of 4
    c.connect(period);
    const last = parseHeader(period[2]!);
    const expected = calculateNextWorkRequired({ lastBits: TINY_BITS, lastTime: last.time, firstTime: parseHeader(tinyGenesis).time, firstBits: TINY_BITS }, TINY);
    expect(targetFromBits(expected)).toBe(compactTarget((targetFromBits(TINY_BITS) * 3n) / 4n));
    expect(() => c.connect([mine(last.hash, last.time + 1, TINY_BITS)])).toThrow(/header-chain rule/);
    expect(c.connect([mine(last.hash, last.time + 1, expected)]).tipHeight).toBe(4);
    expect(() => c.connect([mine(c.tipHash, last.time + 2, TINY_BITS)])).toThrow(/header-chain rule/);
  });
  it('allows min-difficulty blocks only after a 2x spacing gap and walks back past them (testnet rule)', () => {
    const p: ChainParams = { ...TINY, allowMinDifficultyBlocks: true, powLimit: targetFromBits(0x207fffff), powLimitBits: 0x207fffff };
    const c = tinyChain(p);
    const g = parseHeader(tinyGenesis);
    expect(() => c.connect([mine(g.hash, g.time + 2, 0x207fffff)])).toThrow(/header-chain rule/); // gap 2 = 2x spacing: not enough
    const minBlock = mine(g.hash, g.time + 3, 0x207fffff);
    c.connect([minBlock]);
    const mb = parseHeader(minBlock);
    // Next block without a gap must carry the last non-min-difficulty bits (genesis's), not powLimit.
    expect(() => c.connect([mine(mb.hash, mb.time + 1, 0x207fffff)])).toThrow(/header-chain rule/);
    expect(c.connect([mine(mb.hash, mb.time + 1, TINY_BITS)]).tipHeight).toBe(2);
  });
  it('enforces the BIP-94 timewarp rule on the first block of a period', () => {
    const p: ChainParams = { ...TINY, enforceBip94: true };
    const c = tinyChain(p);
    const hs = extend(tinyGenesis, 3, 700, TINY_BITS);
    c.connect(hs);
    const last = parseHeader(hs[2]!);
    const g = parseHeader(tinyGenesis);
    const bits = calculateNextWorkRequired({ lastBits: TINY_BITS, lastTime: last.time, firstTime: g.time, firstBits: TINY_BITS }, p);
    // last.time - 601 is above MTP (genesis..h3 median = h1) but violates the 600 s timewarp limit.
    expect(() => c.connect([mine(last.hash, last.time - 601, bits)])).toThrow(/header-chain rule/);
    expect(c.connect([mine(last.hash, last.time - 600, bits)]).tipHeight).toBe(4);
  });
});

function compactTarget(t: bigint): bigint {
  return targetFromBits(compactFromTarget(t));
}

describe('best-chain selection', () => {
  it('reorgs to a branch with more work and reports the fork height', () => {
    const c = regtestChain();
    const main = extend(REGTEST_GENESIS, 5, 600, 0x207fffff, 1);
    c.connect(main);
    const side = extend(main[1]!, 4, 601, 0x207fffff, 2); // fork after height 2: 2 + 4 = 6 > 5
    const r = c.connect(side);
    expect(r).toEqual({ adopted: true, reorg: true, forkHeight: 2, tipHeight: 6 });
    expect(c.hashAt(3)).toBe(parseHeader(side[0]!).hash);
    expect(c.hashAt(2)).toBe(parseHeader(main[1]!).hash);
  });
  it('keeps the active chain against an equal- or lower-work branch', () => {
    const c = regtestChain();
    const main = extend(REGTEST_GENESIS, 5, 600, 0x207fffff, 1);
    c.connect(main);
    const tip = c.tipHash;
    expect(c.connect(extend(main[1]!, 3, 601, 0x207fffff, 3))).toEqual({ adopted: false, reorg: false, forkHeight: 2, tipHeight: 5 });
    expect(c.connect(extend(main[1]!, 2, 601, 0x207fffff, 4)).adopted).toBe(false);
    expect(c.tipHash).toBe(tip);
  });
  it('skips headers already in the active chain and treats a pure extension as no reorg', () => {
    const c = regtestChain();
    const main = extend(REGTEST_GENESIS, 5, 600, 0x207fffff, 1);
    c.connect(main.slice(0, 3));
    expect(c.connect(main)).toEqual({ adopted: true, reorg: false, forkHeight: 3, tipHeight: 5 });
    expect(c.connect(main.slice(0, 2))).toEqual({ adopted: false, reorg: false, forkHeight: 2, tipHeight: 5 });
  });
  it('validates a whole branch before switching (an invalid header anywhere leaves the chain untouched)', () => {
    const c = regtestChain();
    const main = extend(REGTEST_GENESIS, 3, 600, 0x207fffff, 1);
    c.connect(main);
    const side = extend(main[0]!, 3, 601, 0x207fffff, 5);
    const last = parseHeader(side[2]!);
    const bad = mine(last.hash, last.time + 1, 0x2000ffff);
    expect(() => c.connect([...side, bad])).toThrow(/header-chain rule/);
    expect(c.hashAt(3)).toBe(parseHeader(main[2]!).hash);
  });
  it('refuses empty, oversized or malformed batches', () => {
    const c = regtestChain();
    expect(() => c.connect([])).toThrow(/invalid input/);
    expect(() => c.connect(['zz'])).toThrow(/invalid response/);
  });
});

describe('checkpoints and serialization', () => {
  it('requires a checkpoint on a retarget boundary and verifies MTP context by hash linkage', () => {
    const c = tinyChain();
    const hs: string[] = [];
    for (let h = 1; h <= 8; h++) {
      const tip = parseHeader(h === 1 ? tinyGenesis : hs[hs.length - 1]!);
      const hex = mine(tip.hash, tip.time + 1, c.nextBits(tip.time + 1));
      c.connect([hex]);
      hs.push(hex);
    }
    const cp8 = { height: 8, hash: parseHeader(hs[7]!).hash, headerHex: hs[7]! };
    const fromCp = HeaderChain.create({ params: TINY, checkpoint: { ...cp8, previousHeaders: hs.slice(0, 7) }, now: NOW });
    expect(fromCp.tipHeight).toBe(8);
    expect(fromCp.mtpContextComplete).toBe(false); // 7 of 10 previous headers
    const full = HeaderChain.create({ params: TINY, checkpoint: { ...cp8, previousHeaders: [tinyGenesis, ...hs.slice(0, 7)].slice(-8) }, now: NOW });
    expect(full.mtpContextComplete).toBe(true); // height 8 needs only 8 previous
    expect(() => HeaderChain.create({ params: TINY, checkpoint: { height: 3, hash: parseHeader(hs[2]!).hash, headerHex: hs[2]! } })).toThrow(/header-chain rule/);
    expect(() =>
      HeaderChain.create({ params: TINY, checkpoint: { ...cp8, previousHeaders: [hs[0]!, hs[2]!] } }),
    ).toThrow(/header-chain rule/);
  });
  it('round-trips through JSON and re-validates every header on load', () => {
    const c = regtestChain();
    c.connect(extend(REGTEST_GENESIS, 4, 600, 0x207fffff));
    const json = c.toJSON();
    const back = HeaderChain.fromJSON(JSON.parse(JSON.stringify(json)) as typeof json, { now: NOW });
    expect(back.tipHash).toBe(c.tipHash);
    expect(back.tipWork).toBe(c.tipWork);
    const tampered = { ...json, headers: [...json.headers.slice(0, 2), json.headers[3]!, json.headers[2]!] };
    expect(() => HeaderChain.fromJSON(tampered, { now: NOW })).toThrow(/header-chain rule/);
    expect(() => HeaderChain.fromJSON({ ...json, network: 'litecoin' } as never)).toThrow(/invalid input/);
    expect(() => HeaderChain.fromJSON(null as never)).toThrow(/invalid input/);
  });
});
