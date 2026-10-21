import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from '../errors.js';
import { toHex } from '../ecc.js';
import { generateSilentPaymentKeys } from '../keys.js';
import { changeAddress, createLabelTable, labeledAddress, silentPaymentAddress } from '../labels.js';
import { spendPrivateKey } from '../receiver.js';
import { seededRng } from '../rng.testutil.js';
import { blockHashOf, makeBlock, p2trInput, p2wpkhInput } from '../fixtures.testutil.js';
import { InMemoryTweakSource } from './memory.js';
import { scanBlocks, type ReceivedOutput } from './scanner.js';
import type { BlockOutputs, BlockTweaks, TweakSource } from './types.js';

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

function chain(): InMemoryTweakSource {
  const decoy = new Uint8Array(32).fill(0x42);
  return new InMemoryTweakSource([
    makeBlock(100, [{ inputs: [p2wpkhInput('a')], recipients: [bobAddr], decoys: [decoy] }]),
    makeBlock(101, [
      { inputs: [p2wpkhInput('b')], recipients: [aliceAddr, labeledAddress(alice, 'mainnet', 3)] },
      { inputs: [p2trInput('c')], recipients: [bobAddr, aliceAddr] },
    ]),
    makeBlock(102, [{ inputs: [p2wpkhInput('d')], recipients: [changeAddress(alice, 'mainnet')] }]),
    makeBlock(103, []),
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
    };
    const ctl = new AbortController();
    await collect(
      scanBlocks({
        source: spy,
        keys: { ...keys, labels: createLabelTable(alice.scanSecret, [3]) },
        fromHeight: 100,
        signal: ctl.signal,
      }),
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const [method, ...args] of calls) {
      expect(['getTipHeight', 'getTweaks', 'getOutputs']).toContain(method);
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
    expect(mem.requests.every((r) => r.height === undefined || Number.isInteger(r.height))).toBe(true);
  });
});
