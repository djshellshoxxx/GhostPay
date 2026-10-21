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

  describe('NC-03 key replay at other heights', () => {
    function replay(): InMemoryTweakSource {
      const b = makeBlock(400, [{ inputs: [p2wpkhInput('dup')], recipients: [aliceAddr] }]);
      const fake = { ...b.outputs.outputs[0]!, txid: '33'.repeat(32), vout: 7, amountSats: 5_000_000_000n };
      return new InMemoryTweakSource([
        b,
        {
          tweaks: { ...b.tweaks, height: 401, blockHash: blockHashOf(401) },
          outputs: { ...b.outputs, height: 401, blockHash: blockHashOf(401), outputs: [fake] },
        },
      ]);
    }
    it('flags the replayed key at the later height as duplicateKey and unverified', async () => {
      const found: ReceivedOutput[] = [];
      for await (const r of scanBlocks({ source: replay(), keys, fromHeight: 400, toHeight: 401 })) found.push(r);
      expect(found.map((f) => [f.height, f.duplicateKey, f.verified])).toEqual([[400, false, false], [401, true, false]]);
    });
    it('a persisted seenKeys set flags replays across calls', async () => {
      const seenKeys = new Set<string>();
      const src = replay();
      for await (const _ of scanBlocks({ source: src, keys, fromHeight: 400, toHeight: 400, seenKeys })) void _;
      const later: ReceivedOutput[] = [];
      for await (const r of scanBlocks({ source: src, keys, fromHeight: 401, toHeight: 401, seenKeys })) later.push(r);
      expect(later.map((f) => f.duplicateKey)).toEqual([true]);
    });
  });

  describe('TS-01 / TS-02 / TS-04 regressions', () => {
    function spoofed(): { src: InMemoryTweakSource; realTxid: string } {
      const b = makeBlock(300, [{ inputs: [p2wpkhInput('spoof')], recipients: [aliceAddr] }]);
      const real = b.outputs.outputs[0]!;
      const evil = {
        xOnlyPublicKey: real.xOnlyPublicKey,
        txid: '22'.repeat(32),
        vout: 3,
        amountSats: 99_999_999n,
      };
      return {
        realTxid: real.txid!,
        src: new InMemoryTweakSource([
          { tweaks: b.tweaks, outputs: { ...b.outputs, outputs: [real, evil] } },
        ]),
      };
    }

    it('returns BOTH outputs sharing a key, flagged duplicateKey, real one first-class (TS-01)', async () => {
      const { src, realTxid } = spoofed();
      const found = await collect(scanBlocks({ source: src, keys, fromHeight: 300, toHeight: 300 }));
      expect(found.map((f) => f.txid)).toEqual([realTxid, '22'.repeat(32)]);
      expect(found.every((f) => f.duplicateKey)).toBe(true);
      expect(found.every((f) => !f.verified)).toBe(true);
    });

    it('a verifier can drop the spoofed output and marks the rest verified (TS-02)', async () => {
      const { src, realTxid } = spoofed();
      const seen: boolean[] = [];
      const found = await collect(
        scanBlocks({
          source: src,
          keys,
          fromHeight: 300,
          toHeight: 300,
          verifier: (o, signal) => {
            seen.push(signal === undefined);
            return Promise.resolve(o.txid === realTxid);
          },
        }),
      );
      expect(found).toHaveLength(1);
      expect(found[0]?.txid).toBe(realTxid);
      expect(found[0]?.verified).toBe(true);
      expect(seen).toHaveLength(2);
    });

    it('does not report the same outpoint twice across heights (TS-02)', async () => {
      const b = makeBlock(400, [{ inputs: [p2wpkhInput('dup')], recipients: [aliceAddr] }]);
      const at = (h: number): { tweaks: BlockTweaks; outputs: BlockOutputs } => ({
        tweaks: { ...b.tweaks, height: h, blockHash: blockHashOf(h) },
        outputs: { ...b.outputs, height: h, blockHash: blockHashOf(h) },
      });
      const src = new InMemoryTweakSource([at(400), at(401)]);
      const found = await collect(scanBlocks({ source: src, keys, fromHeight: 400, toHeight: 401 }));
      expect(found).toHaveLength(1);
      expect(found[0]?.height).toBe(400);
    });

    it('refuses a range larger than maxBlocks before any block request (TS-04)', async () => {
      const src = chain();
      await expect(
        collect(scanBlocks({ source: src, keys, fromHeight: 0, toHeight: 4_294_967_295 })),
      ).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
      expect(src.requests.filter((r) => r.method !== 'getTipHeight')).toHaveLength(0);
      await expect(
        collect(scanBlocks({ source: src, keys, fromHeight: 100, toHeight: 102, maxBlocks: 2 })),
      ).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
      await expect(
        collect(scanBlocks({ source: src, keys, fromHeight: 100, toHeight: 102, maxBlocks: 0 })),
      ).rejects.toSatisfy((e) => codeOf(e) === 'INVALID_INPUT');
      await expect(
        collect(scanBlocks({ source: src, keys, fromHeight: 100, toHeight: 102, maxBlocks: 3 })),
      ).resolves.toBeDefined();
    });
  });
});
