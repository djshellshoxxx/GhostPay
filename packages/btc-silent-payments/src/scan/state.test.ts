import { describe, expect, it } from 'vitest';
import { toHex } from '../ecc.js';
import { SilentPaymentError } from '../errors.js';
import { blockHashOf, makeBlock, p2wpkhInput } from '../fixtures.testutil.js';
import { generateSilentPaymentKeys } from '../keys.js';
import { silentPaymentAddress } from '../labels.js';
import { seededRng } from '../rng.testutil.js';
import { unsafeRevealSecret } from '../secret.js';
import { InMemoryTweakSource, type MemoryBlock } from './memory.js';
import type { BlockSpend, BlockSpends, TweakSource } from './types.js';
import { fakeTxid } from '../fixtures.testutil.js';
import type { ReceivedOutput } from './scanner.js';
import {
  MemoryScanStateStore,
  SCAN_REORG_WINDOW,
  createScanState,
  parseScanState,
  reconcileScanState,
  recordScannedBlock,
  resumeScan,
  serializeScanState,
  type ScanState,
} from './state.js';

const alice = generateSilentPaymentKeys(seededRng('state-alice'));
const addr = silentPaymentAddress(alice, 'mainnet');
const keys = { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey };

const blocks = (): MemoryBlock[] => [
  makeBlock(100, [{ inputs: [p2wpkhInput('a')], recipients: [addr] }]),
  makeBlock(101, []),
  makeBlock(102, [{ inputs: [p2wpkhInput('b')], recipients: [addr] }]),
  makeBlock(103, []),
];

/** Same transactions, different block hashes from `from` on (a reorg that re-includes them). */
function reorged(from: number): MemoryBlock[] {
  return blocks().map((b) => {
    if (b.tweaks.height < from) return b;
    const blockHash = toHex(new Uint8Array(32).fill(b.tweaks.height & 0xff));
    return { tweaks: { ...b.tweaks, blockHash }, outputs: { ...b.outputs, blockHash } };
  });
}

async function run(it: AsyncGenerator<ReceivedOutput, ScanState>): Promise<{ found: ReceivedOutput[]; state: ScanState }> {
  const found: ReceivedOutput[] = [];
  for (;;) {
    const n = await it.next();
    if (n.done === true) return { found, state: n.value };
    found.push(n.value);
  }
}

const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
    return undefined;
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
};

describe('resumeScan and ScanState', () => {
  it('scans from the birth height, records every block and persists after each one', async () => {
    const store = new MemoryScanStateStore();
    const saved: number[] = [];
    const { found, state } = await run(
      resumeScan({
        source: new InMemoryTweakSource(blocks()),
        keys,
        state: createScanState('mainnet', 100),
        onState: async (s) => {
          saved.push(s.lastHeight);
          await store.save(serializeScanState(s));
        },
      }),
    );
    expect(found.map((f) => f.height)).toEqual([100, 102]);
    expect(saved).toEqual([100, 101, 102, 103]);
    expect(state).toMatchObject({ lastHeight: 103, lastHash: blockHashOf(103) });
    expect(state.recent.map((r) => r.height)).toEqual([100, 101, 102, 103]);
    expect(state.matches.map((m) => [m.height, m.status, m.amountSats])).toEqual([
      [100, 'confirmed', 1001n],
      [102, 'confirmed', 1001n],
    ]);
    expect(parseScanState((await store.load()) as string)).toEqual(state);
  });

  it('never stores secrets: no scan key, spend key or spend tweak in the serialized state', async () => {
    const { found, state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    const text = serializeScanState(state);
    expect(text).not.toContain(toHex(unsafeRevealSecret(alice.scanSecret)));
    expect(text).not.toContain(toHex(unsafeRevealSecret(alice.spendSecret)));
    for (const f of found) expect(text).not.toContain(toHex(unsafeRevealSecret(f.spendTweak)));
  });

  it('resumes after a crash without rescanning finished blocks or duplicating matches', async () => {
    const source = new InMemoryTweakSource(blocks());
    let last: ScanState | undefined;
    const it = resumeScan({ source, keys, state: createScanState('mainnet', 100), onState: (s) => { last = s; } });
    await it.next(); // output in block 100
    await it.next(); // block 100 recorded; output in 102 yielded => 101 recorded too
    await it.return(createScanState('mainnet', 100)); // crash
    expect(last?.lastHeight).toBe(101);
    const before = source.requests.length;
    const { found, state } = await run(resumeScan({ source, keys, state: last as ScanState }));
    expect(found.map((f) => f.height)).toEqual([102]);
    expect(source.requests.slice(before).filter((r) => r.method === 'getTweaks').map((r) => r.height)).toEqual([101, 102, 103]);
    expect(state.matches).toHaveLength(2);
  });

  it('rolls back to the common ancestor on a reorg, marks matches above it pending and re-confirms them on rescan', async () => {
    const { state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    const newChain = reorged(102);
    const hashOf = new Map(newChain.map((b) => [b.tweaks.height, b.tweaks.blockHash]));
    const rec = await reconcileScanState(state, (h) => hashOf.get(h));
    expect(rec).toMatchObject({ rolledBack: true, resumeHeight: 102 });
    expect(rec.state.matches.map((m) => m.status)).toEqual(['confirmed', 'pending']);
    const seen: ScanState[] = [];
    const out = await run(resumeScan({ source: new InMemoryTweakSource(newChain), keys, state, hashAt: (h) => hashOf.get(h), onState: (s) => { seen.push(s); } }));
    expect(seen[0]?.lastHeight).toBe(101);
    expect(out.state.matches.map((m) => [m.height, m.status, m.blockHash])).toEqual([
      [100, 'confirmed', blockHashOf(100)],
      [102, 'confirmed', hashOf.get(102)],
    ]);
  });

  it('keeps a match pending when the reorged chain no longer contains it', async () => {
    const { state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    const without = reorged(102).map((b) =>
      b.tweaks.height === 102 ? { tweaks: { ...b.tweaks, tweaks: [] }, outputs: { ...b.outputs, outputs: [] } } : b,
    );
    const out = await run(resumeScan({ source: new InMemoryTweakSource(without), keys, state }));
    expect(out.state.matches.map((m) => m.status)).toEqual(['confirmed', 'pending']);
    expect(out.state.lastHeight).toBe(103);
  });

  it('restarts from the birth height when no remembered block is on the chain', async () => {
    const { state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    const rec = await reconcileScanState(state, () => undefined);
    expect(rec).toMatchObject({ rolledBack: true, resumeHeight: 100 });
    expect(rec.state).toMatchObject({ lastHeight: 99, lastHash: null, recent: [] });
    expect(rec.state.matches.every((m) => m.status === 'pending')).toBe(true);
    expect(await reconcileScanState(createScanState('mainnet', 5), () => undefined)).toMatchObject({ rolledBack: false, resumeHeight: 5 });
  });

  it('caps the reorg window and refuses out-of-order blocks', () => {
    let s = createScanState('regtest', 0);
    for (let h = 0; h < SCAN_REORG_WINDOW + 20; h++) s = recordScannedBlock(s, h, blockHashOf(h), []);
    expect(s.recent).toHaveLength(SCAN_REORG_WINDOW);
    expect(s.recent[0]?.height).toBe(20);
    expect(parseScanState(serializeScanState(s))).toEqual(s);
    expect(codeOf(() => recordScannedBlock(s, 200, blockHashOf(200), []))).toBe('INVALID_INPUT');
    expect(codeOf(() => recordScannedBlock(s, s.lastHeight + 1, 'xyz', []))).toBe('INVALID_INPUT');
    expect(codeOf(() => createScanState('litecoin' as never, 0))).toBe('INVALID_INPUT');
    expect(codeOf(() => createScanState('regtest', -1))).toBe('INVALID_INPUT');
  });

  it('parses strictly', async () => {
    const { state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    const good = JSON.parse(serializeScanState(state)) as Record<string, unknown>;
    const m0 = (good['matches'] as Record<string, unknown>[])[0] as Record<string, unknown>;
    const bad: unknown[] = [
      'not json',
      '[]',
      { ...good, version: 2 },
      { ...good, network: 'litecoin' },
      { ...good, lastHeight: 98 },
      { ...good, lastHash: 'ab'.repeat(32) },
      { ...good, recent: [] },
      { ...good, recent: [(good['recent'] as unknown[])[0], (good['recent'] as unknown[])[2]] },
      { ...good, matches: [{ ...m0, status: 'spent' }] },
      { ...good, matches: [{ ...m0, amountSats: '-1' }] },
      { ...good, matches: [{ ...m0, amountSats: '2100000000000001' }] },
      { ...good, matches: [{ ...m0, txid: 'XX' }] },
      { ...good, matches: [{ ...m0, vout: -1 }] },
      { ...good, matches: [{ ...m0, k: 1.5 }] },
      { ...good, matches: [{ ...m0, height: 104 }] },
      { ...good, matches: [{ ...m0, height: 99 }] },
      { ...good, matches: [{ ...m0, xOnlyPublicKey: 'ab' }] },
      { ...good, matches: [7] },
      { ...good, birthHeight: 101 },
    ];
    for (const b of bad) expect(codeOf(() => parseScanState(typeof b === 'string' ? b : JSON.stringify(b)))).toBe('INVALID_INPUT');
    expect(parseScanState(JSON.stringify({ ...good, matches: [{ ...m0, height: 104, status: 'pending' }] })).matches[0]?.status).toBe('pending');
  });

  it('does nothing when already at the tip', async () => {
    const { state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    const again = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state }));
    expect(again.found).toEqual([]);
    expect(again.state).toBe(state);
  });
});

describe('local spent tracking in ScanState', () => {
  const tx = (height: number, n: number): string => fakeTxid(`tx:${height}:${n}`);
  type Spends = Readonly<Record<number, readonly BlockSpend[]>>;
  /** The fixture chain plus `getSpends`; the spend of block 100's output sits in block 102 unless `spends` says otherwise. */
  function spending(chainBlocks: MemoryBlock[], spends: Spends = { 102: [{ txid: tx(100, 0), vout: 0, spentBy: fakeTxid('spender') }] }): TweakSource {
    const base = new InMemoryTweakSource(chainBlocks);
    return {
      getTipHeight: () => base.getTipHeight(),
      getTweaks: (h) => base.getTweaks(h),
      getOutputs: (h) => base.getOutputs(h),
      getSpends: async (h): Promise<BlockSpends> => ({ height: h, blockHash: (await base.getTweaks(h)).blockHash, spends: spends[h] ?? [] }),
    };
  }
  const spent = { height: 102, blockHash: blockHashOf(102), spentBy: fakeTxid('spender') };

  it('recordScannedBlock marks the spent match; unknown outpoints and inconsistent spends are handled', async () => {
    const { state } = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100) }));
    expect(state.matches.every((m) => m.spent === undefined)).toBe(true);
    const next = recordScannedBlock(state, 104, blockHashOf(104), [], [
      { height: 104, blockHash: blockHashOf(104), txid: tx(100, 0), vout: 0, spentBy: fakeTxid('s') },
      { height: 104, blockHash: blockHashOf(104), txid: fakeTxid('unknown'), vout: 0, spentBy: fakeTxid('s') },
    ]);
    expect(next.matches.map((m) => m.spent)).toEqual([{ height: 104, blockHash: blockHashOf(104), spentBy: fakeTxid('s') }, undefined]);
    const off = { height: 103, blockHash: blockHashOf(104), txid: tx(100, 0), vout: 0, spentBy: fakeTxid('s') };
    expect(codeOf(() => recordScannedBlock(state, 104, blockHashOf(104), [], [off]))).toBe('INVALID_INPUT');
    expect(codeOf(() => recordScannedBlock(state, 104, blockHashOf(104), [], [{ ...off, height: 104, blockHash: blockHashOf(103) }]))).toBe('INVALID_INPUT');
  });

  it('resumeScan watches unspent persisted matches and records their spends; a spent match is not watched again', async () => {
    const first = await run(resumeScan({ source: spending(blocks()), keys, state: createScanState('mainnet', 100) }));
    expect(first.state.matches.map((m) => [m.height, m.status, m.spent])).toEqual([
      [100, 'confirmed', spent],
      [102, 'confirmed', undefined],
    ]);
    // Later blocks spend the second output; the first is already spent, so a (bogus) repeated spend is ignored.
    const more = [...blocks(), makeBlock(104, []), makeBlock(105, [])];
    const again = await run(resumeScan({
      source: spending(more, { 104: [{ txid: tx(100, 0), vout: 0, spentBy: fakeTxid('again') }], 105: [{ txid: tx(102, 0), vout: 0, spentBy: fakeTxid('second') }] }),
      keys,
      state: first.state,
    }));
    expect(again.state.matches.map((m) => m.spent)).toEqual([spent, { height: 105, blockHash: blockHashOf(105), spentBy: fakeTxid('second') }]);
    expect(parseScanState(serializeScanState(again.state))).toEqual(again.state);
  });

  it('a spend rolled back by a reorg makes the output unspent again; it is re-spent only if the new chain spends it', async () => {
    const { state } = await run(resumeScan({ source: spending(blocks()), keys, state: createScanState('mainnet', 100) }));
    const newChain = reorged(102);
    const hashOf = new Map(newChain.map((b) => [b.tweaks.height, b.tweaks.blockHash]));
    const rec = await reconcileScanState(state, (h) => hashOf.get(h));
    expect(rec.resumeHeight).toBe(102);
    expect(rec.state.matches.map((m) => [m.status, m.spent])).toEqual([['confirmed', undefined], ['pending', undefined]]);
    // The new chain does not spend it: it stays unspent and is watched (a spend at 103 is recorded).
    const unspent = await run(resumeScan({ source: spending(newChain, {}), keys, state, hashAt: (h) => hashOf.get(h) }));
    expect(unspent.state.matches.map((m) => m.spent)).toEqual([undefined, undefined]);
    const respent = await run(resumeScan({
      source: spending(newChain, { 103: [{ txid: tx(100, 0), vout: 0, spentBy: fakeTxid('respend') }] }),
      keys,
      state,
      hashAt: (h) => hashOf.get(h),
    }));
    expect(respent.state.matches[0]?.spent).toEqual({ height: 103, blockHash: hashOf.get(103), spentBy: fakeTxid('respend') });
    // Rollback below the match itself clears both the spend and the confirmation.
    const deep = await reconcileScanState(respent.state, (h) => (h < 100 ? blockHashOf(h) : undefined));
    expect(deep.state.matches.map((m) => [m.status, m.spent])).toEqual([['pending', undefined], ['pending', undefined]]);
  });

  it('serializes the spent mark and parses it strictly', async () => {
    const { state } = await run(resumeScan({ source: spending(blocks()), keys, state: createScanState('mainnet', 100) }));
    const text = serializeScanState(state);
    expect(parseScanState(text)).toEqual(state);
    const good = JSON.parse(text) as Record<string, unknown>;
    const ms = good['matches'] as Record<string, unknown>[];
    const m0 = ms[0] as Record<string, unknown>;
    const m1 = ms[1] as Record<string, unknown>;
    const withSpent = (over: Record<string, unknown>): string => JSON.stringify({ ...good, matches: [{ ...m0, spent: { ...spent, ...over } }, m1] });
    for (const over of [
      { height: -1 },
      { height: 1.5 },
      { height: 99 }, // spent below the match's own height
      { height: 104 }, // spent above the last scanned height (a rollback would have cleared it)
      { blockHash: 'ab' },
      { blockHash: 7 },
      { spentBy: 'xyz' },
      { spentBy: undefined },
    ]) {
      expect(codeOf(() => parseScanState(withSpent(over))), JSON.stringify(over)).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => parseScanState(JSON.stringify({ ...good, matches: [{ ...m0, spent: 'yes' }, m1] })))).toBe('INVALID_INPUT');
    // A match without an outpoint cannot carry a spend.
    const without = (o: Record<string, unknown>, ...keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    const legacy = without(m0, 'spent', 'spentCheckedThrough');
    const noOutpoint = without(legacy, 'txid', 'vout');
    expect(codeOf(() => parseScanState(JSON.stringify({ ...good, matches: [{ ...noOutpoint, spent }, m1] })))).toBe('INVALID_INPUT');
    expect(parseScanState(JSON.stringify({ ...good, matches: [noOutpoint, m1] })).matches[0]?.spent).toBeUndefined();
    // Version-1 input without the field still parses.
    expect(parseScanState(JSON.stringify({ ...good, matches: [legacy, m1] })).matches[0]?.spent).toBeUndefined();
  });

  it('persists continuous local spend coverage only after each whole block', async () => {
    const saved: ScanState[] = [];
    const { state } = await run(resumeScan({
      source: spending(blocks(), {}), keys, state: createScanState('mainnet', 100),
      onState: (s) => { saved.push(parseScanState(serializeScanState(s))); },
    }));
    expect(saved.map((s) => s.matches[0]?.spentCheckedThrough)).toEqual(
      [100, 101, 102, 103].map((height) => ({ height, blockHash: blockHashOf(height) })),
    );
    expect(state.matches.map((m) => m.spentCheckedThrough)).toEqual([
      { height: 103, blockHash: blockHashOf(103) }, { height: 103, blockHash: blockHashOf(103) },
    ]);
    expect(parseScanState(serializeScanState(state))).toEqual(state);
  });

  it('never bridges a light-source gap in local spend coverage', async () => {
    const first = await run(resumeScan({ source: spending(blocks(), {}), keys, state: createScanState('mainnet', 100), toHeight: 100 }));
    const light = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: first.state, toHeight: 101 }));
    expect(light.state.matches[0]?.spentCheckedThrough).toEqual({ height: 100, blockHash: blockHashOf(100) });
    const resumed = await run(resumeScan({ source: spending(blocks(), {}), keys, state: light.state }));
    expect(resumed.state.matches.map((m) => m.spentCheckedThrough)).toEqual([
      { height: 100, blockHash: blockHashOf(100) }, { height: 103, blockHash: blockHashOf(103) },
    ]);
  });

  it('keeps legacy spentness unknown while still detecting a later positive spend', async () => {
    const legacy = await run(resumeScan({ source: new InMemoryTweakSource(blocks()), keys, state: createScanState('mainnet', 100), toHeight: 101 }));
    expect(legacy.state.matches[0]?.spentCheckedThrough).toBeUndefined();
    const resumed = await run(resumeScan({ source: spending(blocks()), keys, state: parseScanState(serializeScanState(legacy.state)) }));
    expect(resumed.state.matches[0]).toMatchObject({ spent });
    expect(resumed.state.matches[0]?.spentCheckedThrough).toBeUndefined();
    expect(resumed.state.matches[1]?.spentCheckedThrough).toEqual({ height: 103, blockHash: blockHashOf(103) });
  });

  it('clamps coverage on reorg and removes orphaned discovery evidence before rescanning', async () => {
    const { state } = await run(resumeScan({ source: spending(blocks()), keys, state: createScanState('mainnet', 100) }));
    const newChain = reorged(102);
    const hashOf = new Map(newChain.map((b) => [b.tweaks.height, b.tweaks.blockHash]));
    const rec = await reconcileScanState(state, (h) => hashOf.get(h));
    expect(rec.state.matches.map((m) => m.spentCheckedThrough)).toEqual([{ height: 101, blockHash: blockHashOf(101) }, undefined]);
    expect(rec.state.matches.every((m) => m.spent === undefined)).toBe(true);
    expect(parseScanState(serializeScanState(rec.state))).toEqual(rec.state);
    const resumed = await run(resumeScan({ source: spending(newChain, {}), keys, state: rec.state, hashAt: (h) => hashOf.get(h) }));
    expect(resumed.state.matches.map((m) => m.spentCheckedThrough)).toEqual([
      { height: 103, blockHash: hashOf.get(103) }, { height: 103, blockHash: hashOf.get(103) },
    ]);
    const deep = await reconcileScanState(state, () => undefined);
    expect(deep.state.matches.every((m) => m.spentCheckedThrough === undefined)).toBe(true);
  });

  it('does not persist spend coverage for an interrupted block', async () => {
    const controller = new AbortController();
    const source = spending(blocks(), {});
    const saved: ScanState[] = [];
    const interrupted: TweakSource = {
      ...source,
      getSpends: async (height, signal) => {
        const result = await source.getSpends!(height, signal);
        if (height === 101) controller.abort();
        return result;
      },
    };
    const { state } = await run(resumeScan({ source: interrupted, keys, state: createScanState('mainnet', 100), signal: controller.signal,
      onState: (s) => { saved.push(s); } }));
    expect(saved.map((s) => s.lastHeight)).toEqual([100]);
    expect(state.matches[0]?.spentCheckedThrough).toEqual({ height: 100, blockHash: blockHashOf(100) });
    const resumed = await run(resumeScan({ source, keys, state: parseScanState(serializeScanState(state)) }));
    expect(resumed.state.matches[0]?.spentCheckedThrough).toEqual({ height: 103, blockHash: blockHashOf(103) });
  });

  it('rejects corrupt coverage, duplicate identities and contradictory chain evidence', async () => {
    const { state } = await run(resumeScan({ source: spending(blocks()), keys, state: createScanState('mainnet', 100) }));
    const good = JSON.parse(serializeScanState(state)) as Record<string, unknown>;
    const ms = good['matches'] as Record<string, unknown>[];
    const m0 = ms[0]!;
    const m1 = ms[1]!;
    const invalidCoverage: unknown[] = [null, false, {}, { height: 99, blockHash: blockHashOf(99) },
      { height: 104, blockHash: blockHashOf(104) }, { height: 100.5, blockHash: blockHashOf(100) },
      { height: 103, blockHash: 'ab' }, { height: 103, blockHash: blockHashOf(102) }];
    for (const spentCheckedThrough of invalidCoverage) {
      expect.soft(codeOf(() => parseScanState(JSON.stringify({ ...good, matches: [{ ...m0, spentCheckedThrough }, m1] }))), JSON.stringify(spentCheckedThrough)).toBe('INVALID_INPUT');
    }
    for (const matches of [
      [m0, m0, m1],
      [m0, { ...m0, xOnlyPublicKey: fakeTxid('other-key'), spent: undefined }, m1],
      [{ ...m0, txid: undefined }, m1],
      [{ ...m0, status: 'pending' }, m1],
      [{ ...m0, spent: { ...spent, blockHash: blockHashOf(101) } }, m1],
      [{ ...m0, spent: { ...spent, spentBy: m0['txid'] } }, m1],
      [{ ...m0, blockHash: blockHashOf(101) }, m1],
    ]) expect.soft(codeOf(() => parseScanState(JSON.stringify({ ...good, matches })))).toBe('INVALID_INPUT');
  });

  it('invalidates historical evidence outside the reorg window even when the remembered tip is unchanged', async () => {
    const longChain = [...blocks(), ...Array.from({ length: 102 }, (_, i) => makeBlock(104 + i, []))];
    const source = spending(longChain, { 101: [{ txid: tx(100, 0), vout: 0, spentBy: fakeTxid('older-spend') }] });
    const { state } = await run(resumeScan({ source, keys, state: createScanState('mainnet', 100) }));
    expect(state.recent[0]?.height).toBe(106);
    const first = state.matches[0]!;
    const last = state.matches[1]!;
    const corrupt = { ...state, matches: [{ ...first, spent: { ...first.spent!, blockHash: blockHashOf(99) } }, last] };
    const saved: ScanState[] = [];
    const seen: number[] = [];
    const { state: fixed } = await run(resumeScan({ source, keys, state: parseScanState(serializeScanState(corrupt)),
      hashAt: (height) => { seen.push(height); return blockHashOf(height); },
      onState: (next) => { saved.push(next); } }));
    expect(fixed).toMatchObject({ lastHeight: 205, lastHash: blockHashOf(205) });
    expect(fixed.matches[0]?.status).toBe('confirmed');
    expect(fixed.matches[0]?.spent).toBeUndefined();
    expect(fixed.matches[0]?.spentCheckedThrough).toBeUndefined();
    expect(saved).toEqual([fixed]);
    expect(new Set(seen).size).toBe(seen.length);
    const missing = await reconcileScanState(state, (height) => height === 101 ? undefined : blockHashOf(height));
    expect(missing.state.matches[0]?.spent).toBeUndefined();
    expect(missing.state.matches[0]?.spentCheckedThrough).toBeUndefined();
    expect(missing.rolledBack).toBe(true);
    const noDiscovery = await reconcileScanState(state, (height) => height === 100 ? undefined : blockHashOf(height));
    expect(noDiscovery.state.matches[0]).toMatchObject({ status: 'pending' });
    expect(noDiscovery.state.matches[0]?.spent).toBeUndefined();
    expect(noDiscovery.state.matches[0]?.spentCheckedThrough).toBeUndefined();
    const badCoverage = await reconcileScanState({ ...state, matches: [{ ...first,
      spentCheckedThrough: { height: 105, blockHash: blockHashOf(99) } }, last] }, blockHashOf);
    expect(badCoverage.state.matches[0]?.spent).toBeUndefined();
    expect(badCoverage.state.matches[0]?.spentCheckedThrough).toBeUndefined();
  });

  it('never applies spends to an orphaned pending discovery unless the canonical scan rediscovers it', async () => {
    const { state } = await run(resumeScan({ source: spending(blocks(), {}), keys, state: createScanState('mainnet', 100) }));
    const newChain = reorged(102);
    const without = newChain.map((b) => b.tweaks.height === 102 ? {
      tweaks: { ...b.tweaks, tweaks: [] }, outputs: { ...b.outputs, outputs: [] },
    } : b);
    const hashOf = new Map(newChain.map((b) => [b.tweaks.height, b.tweaks.blockHash]));
    const input = { txid: tx(102, 0), vout: 0, spentBy: fakeTxid('orphan-reference') };
    const absent = await run(resumeScan({ source: spending(without, { 103: [input] }), keys, state,
      hashAt: (h) => hashOf.get(h), onState: (s) => { parseScanState(serializeScanState(s)); } }));
    expect(absent.state.matches[1]?.status).toBe('pending');
    expect(absent.state.matches[1]?.spent).toBeUndefined();
    expect(absent.state.matches[1]?.spentCheckedThrough).toBeUndefined();
    const rec = await reconcileScanState(state, (h) => hashOf.get(h));
    const direct = recordScannedBlock(rec.state, 102, hashOf.get(102)!, [], [{ ...input, height: 102, blockHash: hashOf.get(102)! }], true);
    expect(direct.matches[1]?.spent).toBeUndefined();
    expect(parseScanState(serializeScanState(direct))).toEqual(direct);
    const rediscovered = await run(resumeScan({ source: spending(newChain, { 102: [input] }), keys, state, hashAt: (h) => hashOf.get(h) }));
    expect(rediscovered.state.matches[1]).toMatchObject({ status: 'confirmed', spent: { height: 102, blockHash: hashOf.get(102), spentBy: input.spentBy } });
    expect(parseScanState(serializeScanState(rediscovered.state))).toEqual(rediscovered.state);
  });

  it('preserves the first canonical spend when a later duplicate consumer is orphaned', async () => {
    const original = { txid: tx(100, 0), vout: 0, spentBy: fakeTxid('first-canonical-spend') };
    const replay = { ...original, spentBy: fakeTxid('later-repeated-consumer') };
    const { state } = await run(resumeScan({ source: spending(blocks(), { 101: [original], 103: [replay] }),
      keys, state: createScanState('mainnet', 100) }));
    const firstEvidence = { height: 101, blockHash: blockHashOf(101), spentBy: original.spentBy };
    expect.soft(state.matches[0]?.spent).toEqual(firstEvidence);
    const reorg = await reconcileScanState(state, (h) => h === 103 ? fakeTxid('new-tip') : blockHashOf(h));
    expect(reorg.resumeHeight).toBe(103);
    expect.soft(reorg.state.matches[0]?.spent).toEqual(firstEvidence);
    expect(parseScanState(serializeScanState(reorg.state))).toEqual(reorg.state);
  });

  it('recordScannedBlock never overwrites already recorded canonical spend evidence', async () => {
    const original = { txid: tx(100, 0), vout: 0, spentBy: fakeTxid('first-canonical-spend') };
    const { state } = await run(resumeScan({ source: spending(blocks(), { 101: [original] }),
      keys, state: createScanState('mainnet', 100), toHeight: 101 }));
    const repeated = recordScannedBlock(state, 102, blockHashOf(102), [], [
      { ...original, spentBy: fakeTxid('replacement-consumer'), height: 102, blockHash: blockHashOf(102) },
    ], true);
    expect(repeated.matches[0]?.spent).toEqual(state.matches[0]?.spent);
  });

  it('rejects a later-block replay of a confirmed outpoint instead of replacing its discovery and spend evidence', async () => {
    const original = blocks();
    const { state } = await run(resumeScan({ source: spending(original), keys, state: createScanState('mainnet', 100) }));
    const old = original[0]!;
    const replay = {
      tweaks: { ...old.tweaks, height: 104, blockHash: blockHashOf(104) },
      outputs: { ...old.outputs, height: 104, blockHash: blockHashOf(104) },
    };
    const saved: ScanState[] = [];
    await expect(run(resumeScan({ source: spending([...original, replay], {}), keys, state,
      onState: (next) => { saved.push(next); } }))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(saved).toEqual([]);
    expect(state.matches[0]).toMatchObject({ height: 100, blockHash: blockHashOf(100), spent });
  });
});
