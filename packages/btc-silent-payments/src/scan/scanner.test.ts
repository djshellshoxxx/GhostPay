import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from '../errors.js';
import { toHex } from '../ecc.js';
import { generateSilentPaymentKeys } from '../keys.js';
import { changeAddress, createLabelTable, labeledAddress, silentPaymentAddress } from '../labels.js';
import { spendPrivateKey } from '../receiver.js';
import { seededRng } from '../rng.testutil.js';
import { blockHashOf, makeBlock, p2trInput, p2wpkhInput } from '../fixtures.testutil.js';
import { InMemoryTweakSource } from './memory.js';
import { MAX_SPENDS_PER_BLOCK, scanBlocks, type ReceivedOutput, type SpendEvent } from './scanner.js';
import type { BlockOutputs, BlockSpend, BlockSpends, BlockTweaks, TweakSource } from './types.js';
import { fakeTxid } from '../fixtures.testutil.js';

const alice = generateSilentPaymentKeys(seededRng('scan-alice'));
const bob = generateSilentPaymentKeys(seededRng('scan-bob'));
const aliceAddr = silentPaymentAddress(alice, 'mainnet');
const bobAddr = silentPaymentAddress(bob, 'mainnet');

function codeOf(e: unknown): string | undefined {
  return e instanceof SilentPaymentError ? e.code : 'OTHER';
}

async function collect(it: AsyncIterable<ReceivedOutput>): Promise<ReceivedOutput[]> {
  const out: ReceivedOutput[] = [];
  for await (const r of it) out.push(r);
  return out;
}

function chain(last = makeBlock(103, [])): InMemoryTweakSource {
  const decoy = new Uint8Array(32).fill(0x42);
  return new InMemoryTweakSource([
    makeBlock(100, [{ inputs: [p2wpkhInput('a')], recipients: [bobAddr], decoys: [decoy] }]),
    makeBlock(101, [
      { inputs: [p2wpkhInput('b')], recipients: [aliceAddr, labeledAddress(alice, 'mainnet', 3)] },
      { inputs: [p2trInput('c')], recipients: [bobAddr, aliceAddr] },
    ]),
    makeBlock(102, [{ inputs: [p2wpkhInput('d')], recipients: [changeAddress(alice, 'mainnet')] }]),
    last,
  ]);
}

const keys = { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey };

describe('scanBlocks', () => {
  it("finds exactly the receiver's outputs with their chain positions, in block order", async () => {
    const found = await collect(
      scanBlocks({
        source: chain(),
        keys: { ...keys, labels: createLabelTable(alice.scanSecret, [3]) },
        fromHeight: 100,
      }),
    );
    expect(found.map((f) => [f.height, f.k, f.label])).toEqual([
      [101, 0, null],
      [101, 1, 3],
      [101, 0, null],
      [102, 0, 0],
    ]);
    for (const f of found) {
      expect(f.blockHash).toBe(blockHashOf(f.height));
      expect(f.txid).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof f.vout).toBe('number');
      expect(f.amountSats).toBeGreaterThan(0n);
      expect(toHex(spendPrivateKey(alice.spendSecret, f.spendTweak).xOnlyPublicKey)).toBe(
        toHex(f.xOnlyPublicKey),
      );
    }
  });

  it('without the label, only unlabeled and change payments are found', async () => {
    const found = await collect(scanBlocks({ source: chain(), keys, fromHeight: 100, toHeight: 102 }));
    expect(found.map((f) => [f.height, f.label])).toEqual([
      [101, null],
      [101, null],
      [102, 0],
    ]);
  });

  it('honours the range, defaults toHeight to the tip and allows an empty range', async () => {
    expect(await collect(scanBlocks({ source: chain(), keys, fromHeight: 102 }))).toHaveLength(1);
    expect(await collect(scanBlocks({ source: chain(), keys, fromHeight: 100, toHeight: 100 }))).toHaveLength(
      0,
    );
    expect(await collect(scanBlocks({ source: chain(), keys, fromHeight: 5, toHeight: 4 }))).toHaveLength(0);
  });

  it('stops quietly when aborted before or during the scan', async () => {
    const pre = new AbortController();
    pre.abort();
    expect(await collect(scanBlocks({ source: chain(), keys, fromHeight: 100, signal: pre.signal }))).toEqual(
      [],
    );
    const ctl = new AbortController();
    const got: ReceivedOutput[] = [];
    for await (const r of scanBlocks({ source: chain(), keys, fromHeight: 100, signal: ctl.signal })) {
      got.push(r);
      ctl.abort();
    }
    expect(got).toHaveLength(1);
  });

  it('aborts during the tweak loop and between blocks', async () => {
    const ctl = new AbortController();
    const src: TweakSource = {
      getTipHeight: () => Promise.resolve(101),
      getTweaks: (h) => {
        ctl.abort();
        return chain().getTweaks(h);
      },
      getOutputs: (h) => chain().getOutputs(h),
    };
    expect(await collect(scanBlocks({ source: src, keys, fromHeight: 100, signal: ctl.signal }))).toEqual([]);
  });

  it('fails closed on inconsistent block data (reorg between the two requests)', async () => {
    const base = chain();
    const hashSwap: TweakSource = {
      getTipHeight: () => base.getTipHeight(),
      getTweaks: (h) => base.getTweaks(h),
      getOutputs: async (h): Promise<BlockOutputs> => ({
        ...(await base.getOutputs(h)),
        blockHash: 'f'.repeat(64),
      }),
    };
    await expect(
      collect(scanBlocks({ source: hashSwap, keys, fromHeight: 100, toHeight: 100 })),
    ).rejects.toSatisfy((e) => codeOf(e) === 'REORG_DETECTED');
    const heightSwap: TweakSource = {
      getTipHeight: () => base.getTipHeight(),
      getTweaks: async (h): Promise<BlockTweaks> => ({ ...(await base.getTweaks(h)), height: h + 1 }),
      getOutputs: (h) => base.getOutputs(h),
    };
    await expect(
      collect(scanBlocks({ source: heightSwap, keys, fromHeight: 100, toHeight: 100 })),
    ).rejects.toSatisfy((e) => codeOf(e) === 'REORG_DETECTED');
  });

  it('rejects invalid ranges and surfaces missing blocks as transport failures', async () => {
    await expect(collect(scanBlocks({ source: chain(), keys, fromHeight: -1 }))).rejects.toSatisfy(
      (e) => codeOf(e) === 'INVALID_INPUT',
    );
    await expect(collect(scanBlocks({ source: chain(), keys, fromHeight: 1.5 }))).rejects.toSatisfy(
      (e) => codeOf(e) === 'INVALID_INPUT',
    );
    await expect(
      collect(scanBlocks({ source: chain(), keys, fromHeight: 100, toHeight: 99.5 })),
    ).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
    await expect(
      collect(scanBlocks({ source: chain(), keys, fromHeight: 100, toHeight: 200 })),
    ).rejects.toSatisfy((e) => codeOf(e) === 'TRANSPORT_FAILURE');
  });
});

describe('privacy: the transport only ever receives block heights', () => {
  it('records no key material, labels or addresses in any request', async () => {
    const mem = chain();
    const calls: unknown[][] = [];
    const spy: TweakSource = {
      getTipHeight: (...a) => (calls.push(['getTipHeight', ...a]), mem.getTipHeight()),
      getTweaks: (...a) => (calls.push(['getTweaks', ...a]), mem.getTweaks(a[0])),
      getOutputs: (...a) => (calls.push(['getOutputs', ...a]), mem.getOutputs(a[0])),
      getSpends: (...a): Promise<BlockSpends> => {
        calls.push(['getSpends', ...a]);
        return Promise.resolve({ height: a[0], blockHash: blockHashOf(a[0]), spends: [] });
      },
    };
    const ctl = new AbortController();
    const watched = `${fakeTxid('watched')}:0`;
    await collect(
      scanBlocks({
        source: spy,
        keys: { ...keys, labels: createLabelTable(alice.scanSecret, [3]) },
        fromHeight: 100,
        signal: ctl.signal,
        watchOutpoints: new Set([watched]),
        onSpend: () => undefined,
      }),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter(([m]) => m === 'getSpends')).toHaveLength(4);
    for (const [method, ...args] of calls) {
      expect(['getTipHeight', 'getTweaks', 'getOutputs', 'getSpends']).toContain(method);
      for (const a of args) {
        // each argument is a block height (non-negative integer) or the AbortSignal
        expect(
          typeof a === 'number' ? Number.isInteger(a) && a >= 100 && a <= 103 : a instanceof AbortSignal,
        ).toBe(true);
      }
    }
    const serialized = JSON.stringify(mem.requests);
    for (const secret of [alice.scanSecret, alice.spendSecret])
      expect(serialized).not.toContain(toHex(new Uint8Array(secret)));
    for (const pub of [alice.scanPublicKey, alice.spendPublicKey])
      expect(serialized).not.toContain(toHex(pub));
    // Watched outpoints (the wallet's own UTXOs) are matched locally, never sent to the source.
    expect(JSON.stringify(calls)).not.toContain(fakeTxid('watched'));
    expect(mem.requests.every((r) => r.height === undefined || Number.isInteger(r.height))).toBe(true);
  });
});

describe('duplicate-key and outpoint replay handling', () => {
  function replaySource(): InMemoryTweakSource {
    const b = makeBlock(400, [{ inputs: [p2wpkhInput('duplicate-key')], recipients: [aliceAddr] }]);
    const real = b.outputs.outputs[0];
    if (real === undefined) throw new Error('fixture');
    const replayed = { ...real, txid: '33'.repeat(32), vout: 7, amountSats: 5_000n };
    const at = (height: number, outputs = [real]) => ({
      tweaks: { ...b.tweaks, height, blockHash: blockHashOf(height) },
      outputs: { ...b.outputs, height, blockHash: blockHashOf(height), outputs },
    });
    return new InMemoryTweakSource([
      at(400, [{ ...real, txid: '22'.repeat(32), vout: 3, amountSats: 99_999n }, real]),
      at(401, [replayed]),
    ]);
  }

  it('returns each duplicate-key output with its own metadata and flags a later key replay', async () => {
    const found = await collect(scanBlocks({ source: replaySource(), keys, fromHeight: 400, toHeight: 401 }));
    expect(found).toHaveLength(3);
    expect([found[0]?.height, found[0]?.txid, found[0]?.vout, found[0]?.amountSats]).toEqual([
      400,
      '22'.repeat(32),
      3,
      99_999n,
    ]);
    expect(found[1]?.height).toBe(400);
    expect(found[1]?.txid).not.toBe(found[0]?.txid);
    expect([found[2]?.height, found[2]?.txid, found[2]?.vout, found[2]?.amountSats]).toEqual([
      401,
      '33'.repeat(32),
      7,
      5_000n,
    ]);
    expect(found.every((r) => r.duplicateKey && !r.verified)).toBe(true);
  });

  it('updates seenKeys across independent scan calls and deduplicates a repeated outpoint', async () => {
    const src = replaySource();
    const seenKeys = new Set<string>();
    const first = await collect(scanBlocks({ source: src, keys, fromHeight: 400, toHeight: 400, seenKeys }));
    const later = await collect(scanBlocks({ source: src, keys, fromHeight: 401, toHeight: 401, seenKeys }));
    expect(first.every((r) => r.duplicateKey)).toBe(true);
    expect(later.map((r) => r.duplicateKey)).toEqual([true]);

    const b = makeBlock(500, [{ inputs: [p2wpkhInput('same-outpoint')], recipients: [aliceAddr] }]);
    const output = b.outputs.outputs[0];
    if (output === undefined) throw new Error('fixture');
    const repeated = new InMemoryTweakSource([500, 501].map((height) => ({
      tweaks: { ...b.tweaks, height, blockHash: blockHashOf(height) },
      outputs: { ...b.outputs, height, blockHash: blockHashOf(height), outputs: [output] },
    })));
    const once = await collect(scanBlocks({ source: repeated, keys, fromHeight: 500, toHeight: 501 }));
    expect(once).toHaveLength(1);
    expect(once[0]?.height).toBe(500);
  });
});

describe('local spent tracking (getSpends)', () => {
  const tx = (height: number, n: number): string => fakeTxid(`tx:${height}:${n}`);
  type Spends = Readonly<Record<number, readonly BlockSpend[]>>;
  /** Adds `getSpends` to the fixture chain; `hashAt` lets a test serve a hash that disagrees with the block. */
  function withSpends(spends: Spends, hashAt: (h: number) => string = blockHashOf, mutate?: (s: BlockSpends) => unknown): TweakSource {
    const base = chain();
    return {
      getTipHeight: () => base.getTipHeight(),
      getTweaks: (h) => base.getTweaks(h),
      getOutputs: (h) => base.getOutputs(h),
      getSpends: (h): Promise<BlockSpends> => {
        const r: BlockSpends = { height: h, blockHash: hashAt(h), spends: spends[h] ?? [] };
        return Promise.resolve((mutate?.(r) as BlockSpends | undefined) ?? r);
      },
    };
  }
  async function spendsOf(p: Partial<Parameters<typeof scanBlocks>[0]> & { source: TweakSource }): Promise<SpendEvent[]> {
    const events: SpendEvent[] = [];
    await collect(scanBlocks({ keys, fromHeight: 100, onSpend: (e) => { events.push(e); }, ...p }));
    return events;
  }

  it('reports spends of watched outpoints and of outpoints found earlier in this run, ignores the rest', async () => {
    const watched = `${fakeTxid('mine-earlier')}:1`;
    const source = withSpends({
      101: [{ txid: tx(101, 0), vout: 1, spentBy: fakeTxid('spend-same-block') }],
      102: [
        { txid: tx(101, 0), vout: 0, spentBy: fakeTxid('spend-a') },
        { txid: fakeTxid('somebody-else'), vout: 0, spentBy: fakeTxid('spend-b') },
        { txid: tx(100, 0), vout: 0, spentBy: fakeTxid('spend-c') }, // bob's output: not ours
      ],
      103: [{ txid: fakeTxid('mine-earlier'), vout: 1, spentBy: fakeTxid('spend-d') }, { txid: fakeTxid('mine-earlier'), vout: 2, spentBy: fakeTxid('spend-e') }],
    });
    const events = await spendsOf({ source, keys: { ...keys, labels: createLabelTable(alice.scanSecret, [3]) }, watchOutpoints: new Set([watched]) });
    expect(events).toEqual([
      { height: 101, blockHash: blockHashOf(101), txid: tx(101, 0), vout: 1, spentBy: fakeTxid('spend-same-block') },
      { height: 102, blockHash: blockHashOf(102), txid: tx(101, 0), vout: 0, spentBy: fakeTxid('spend-a') },
      { height: 103, blockHash: blockHashOf(103), txid: fakeTxid('mine-earlier'), vout: 1, spentBy: fakeTxid('spend-d') },
    ]);
  });

  it('does not ask for spends without an onSpend listener, and a source without getSpends scans as before', async () => {
    let asked = 0;
    const source = withSpends({}, blockHashOf, () => { asked++; return undefined; });
    expect(await collect(scanBlocks({ source, keys, fromHeight: 100 }))).toHaveLength(3);
    expect(asked).toBe(0);
    expect(await spendsOf({ source: chain() })).toEqual([]);
  });

  it('rejects spends whose block hash or height disagree with the block (REORG_DETECTED)', async () => {
    await expect(spendsOf({ source: withSpends({}, (h) => (h === 102 ? 'f'.repeat(64) : blockHashOf(h))) })).rejects.toSatisfy(
      (e) => codeOf(e) === 'REORG_DETECTED',
    );
    await expect(spendsOf({ source: withSpends({}, blockHashOf, (s) => ({ ...s, height: s.height + 1 })) })).rejects.toSatisfy(
      (e) => codeOf(e) === 'REORG_DETECTED',
    );
  });

  it('validates every spend (txid, vout, spentBy), the list shape and its size, whether watched or not', async () => {
    const ok: BlockSpend = { txid: fakeTxid('x'), vout: 0, spentBy: fakeTxid('y') };
    const bad: unknown[] = [
      { ...ok, txid: 'XX' },
      { ...ok, txid: 7 },
      { ...ok, vout: -1 },
      { ...ok, vout: 1.5 },
      { ...ok, vout: 0x1_0000_0000 },
      { ...ok, spentBy: ok.txid }, // a transaction cannot spend its own output
      { ...ok, spentBy: 'f'.repeat(63) },
      { txid: ok.txid, vout: 0 },
      null,
    ];
    for (const b of bad) {
      await expect(spendsOf({ source: withSpends({ 100: [b as BlockSpend] }) }), JSON.stringify(b)).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_RESPONSE');
    }
    await expect(spendsOf({ source: withSpends({}, blockHashOf, (s) => ({ ...s, spends: 'nope' })) })).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_RESPONSE');
    const flood: BlockSpend[] = Array.from({ length: MAX_SPENDS_PER_BLOCK + 1 }, (_, i) => ({ ...ok, vout: i }));
    await expect(spendsOf({ source: withSpends({ 100: flood }) })).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_RESPONSE');
    expect(await spendsOf({ source: withSpends({ 100: flood.slice(0, MAX_SPENDS_PER_BLOCK) }) })).toEqual([]);
    await expect(spendsOf({ source: withSpends({}), watchOutpoints: new Set(['not-an-outpoint']) })).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
  });

  it('is not asked for spends of a block interrupted by abort', async () => {
    const ctl = new AbortController();
    let asked = 0;
    const source = withSpends({}, blockHashOf, () => { asked++; return undefined; });
    const got: ReceivedOutput[] = [];
    for await (const r of scanBlocks({ source, keys, fromHeight: 100, signal: ctl.signal, onSpend: () => undefined })) {
      got.push(r);
      ctl.abort();
    }
    expect(got).toHaveLength(1);
    expect(asked).toBe(1); // block 100 only
  });
});

describe('sampled cross-check (crossCheckSample)', () => {
  const matchedBlocks = [101, 102];
  function run(sample: { rate: number; random: () => number } | undefined, second: TweakSource = chain(), source: TweakSource = chain()): Promise<ReceivedOutput[]> {
    return collect(scanBlocks({ source, keys, fromHeight: 100, crossCheck: second, ...(sample === undefined ? {} : { crossCheckSample: sample }) }));
  }
  const heights = (mem: InMemoryTweakSource, method: 'getTweaks' | 'getOutputs'): number[] =>
    mem.requests.filter((r) => r.method === method).map((r) => r.height as number);

  it('rate 0 keeps today\'s behaviour and never draws a random number', async () => {
    const second = chain();
    expect(await run({ rate: 0, random: () => { throw new Error('must not be called'); } }, second)).toHaveLength(3);
    expect(heights(second, 'getOutputs')).toEqual(matchedBlocks);
    expect(heights(second, 'getTweaks')).toEqual([]);
  });

  it('rate 1 cross-checks every block; a deterministic random picks exactly the blocks below the rate', async () => {
    const all = chain();
    expect(await run({ rate: 1, random: () => 0.999 }, all)).toHaveLength(3);
    expect(heights(all, 'getOutputs')).toEqual([100, 101, 102, 103]);
    expect(heights(all, 'getTweaks')).toEqual([100, 103]);
    const draws = [0.7, 0.2]; // for the blocks without matches: 100 (skip), 103 (check)
    const some = chain();
    await run({ rate: 0.5, random: () => draws.shift() as number }, some);
    expect(draws).toEqual([]);
    expect(heights(some, 'getOutputs')).toEqual([101, 102, 103]);
    expect(heights(some, 'getTweaks')).toEqual([103]);
  });

  it('fails closed when a sampled block disagrees: omitted tweak, extra output or another hash', async () => {
    // Block 103 has a tweak (and outputs) at the second source that the primary omits: caught only by sampling.
    const full = (): InMemoryTweakSource => chain(makeBlock(103, [{ inputs: [p2wpkhInput('z')], recipients: [bobAddr] }]));
    const omitting = (): TweakSource => {
      const base = full();
      return {
        getTipHeight: () => base.getTipHeight(),
        getTweaks: async (h): Promise<BlockTweaks> => (h === 103 ? { ...(await base.getTweaks(h)), tweaks: [] } : base.getTweaks(h)),
        getOutputs: (h) => base.getOutputs(h),
      };
    };
    expect(await run({ rate: 0, random: () => 0 }, full(), omitting())).toHaveLength(3);
    await expect(run({ rate: 1, random: () => 0 }, full(), omitting())).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_RESPONSE');
    const base = full();
    const extraOutput: TweakSource = {
      getTipHeight: () => base.getTipHeight(),
      getTweaks: (h) => base.getTweaks(h),
      getOutputs: async (h): Promise<BlockOutputs> => {
        const o = await base.getOutputs(h);
        return h === 100 ? { ...o, outputs: [...o.outputs, { xOnlyPublicKey: new Uint8Array(32).fill(7) }] } : o;
      },
    };
    await expect(run({ rate: 1, random: () => 0 }, extraOutput, full())).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_RESPONSE');
    const otherHash: TweakSource = {
      getTipHeight: () => base.getTipHeight(),
      getTweaks: async (h): Promise<BlockTweaks> => ({ ...(await base.getTweaks(h)), ...(h === 100 ? { blockHash: 'e'.repeat(64) } : {}) }),
      getOutputs: (h) => base.getOutputs(h),
    };
    expect(await run({ rate: 0, random: () => 0 }, otherHash, full())).toHaveLength(3);
    await expect(run({ rate: 1, random: () => 0 }, otherHash, full())).rejects.toSatisfy((e) => codeOf(e) === 'REORG_DETECTED');
  });

  it('rejects an invalid rate, a random outside [0,1) and a sample without a second source', async () => {
    for (const rate of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(run({ rate, random: () => 0 }), String(rate)).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
    }
    for (const draw of [1, -0.5, Number.NaN]) {
      await expect(run({ rate: 0.5, random: () => draw }), String(draw)).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
    }
    await expect(collect(scanBlocks({ source: chain(), keys, fromHeight: 100, crossCheckSample: { rate: 1, random: () => 0 } }))).rejects.toSatisfy(
      (e) => codeOf(e) === 'INVALID_INPUT',
    );
  });
});
