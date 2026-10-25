import { describe, expect, it } from 'vitest';
import { toHex } from '../ecc.js';
import { SilentPaymentError } from '../errors.js';
import { blockHashOf, makeBlock, p2wpkhInput } from '../fixtures.testutil.js';
import { generateSilentPaymentKeys } from '../keys.js';
import { silentPaymentAddress } from '../labels.js';
import { seededRng } from '../rng.testutil.js';
import { unsafeRevealSecret } from '../secret.js';
import { InMemoryTweakSource, type MemoryBlock } from './memory.js';
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
