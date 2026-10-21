import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ScanSourceError } from './errors.js';
import { createRangeSource } from './range.js';
import { CHAIN_HEAD, RAW, fakeBackend, headOf, inRange, rawAnn } from './testutil.js';

const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof ScanSourceError ? e.code : 'other';
  }
  return undefined;
};

describe('range source', () => {
  it('fetches the aligned, padded window and validates records', async () => {
    const be = fakeBackend();
    const src = createRangeSource({ chainId: 31337, backend: be });
    expect(src.kind).toBe('range');
    expect(src.integrity).toBe('unverified');
    const r = await src.fetch({ chainId: 31337, fromBlock: 1234n, toBlock: 1236n });
    expect(r.coverage).toEqual({ fromBlock: 1000n, toBlock: 1999n });
    expect(r.announcements.map((a) => a.blockNumber)).toEqual(inRange(1000n, 1999n).map((a) => BigInt(a['blockNumber'] as string)).sort((x, y) => Number(x - y)));
    expect(r.announcements.length).toBeGreaterThan(2);
    expect(r.head).toEqual(headOf());
    expect(r.skipped).toBe(0);
  });
  it('AT-NP-14: a fresh install and a one-block catch-up make same-size aligned calls', async () => {
    const a = fakeBackend();
    await createRangeSource({ chainId: 31337, backend: a }).fetch({ chainId: 31337, fromBlock: 2000n, toBlock: 2000n });
    const b = fakeBackend();
    await createRangeSource({ chainId: 31337, backend: b }).fetch({ chainId: 31337, fromBlock: 0n, toBlock: CHAIN_HEAD });
    for (const c of [...a.calls, ...b.calls.slice(0, 2)]) {
      expect(c.toBlock - c.fromBlock + 1n).toBe(1000n);
      expect(c.fromBlock % 1000n).toBe(0n);
    }
    expect(a.calls.length).toBe(1);
    expect(b.calls.length).toBe(3);
  });
  it('NP-S-2/MH-SCAN-1: backend calls carry only chainId and block bounds (no address/topic/tag)', async () => {
    const be = fakeBackend();
    await createRangeSource({ chainId: 31337, backend: be }).fetch({ chainId: 31337, fromBlock: 5n, toBlock: 10n });
    for (const c of be.calls) expect(Object.keys(c).sort()).toEqual(['chainId', 'fromBlock', 'toBlock']);
  });
  it('clamps to the head; start beyond the head is an error', async () => {
    const src = createRangeSource({ chainId: 31337, backend: fakeBackend() });
    const r = await src.fetch({ chainId: 31337, fromBlock: 2500n, toBlock: 9999n });
    expect(r.coverage).toEqual({ fromBlock: 2000n, toBlock: CHAIN_HEAD });
    expect(await codeOf(() => src.fetch({ chainId: 31337, fromBlock: 5000n, toBlock: 5001n }))).toBe('OUT_OF_RANGE');
  });
  it('drops malformed, out-of-window and duplicate records', async () => {
    const good = rawAnn(1100, 0);
    const be = fakeBackend([good, good, { nonsense: true }, rawAnn(1100, 1), { ...rawAnn(1200, 0), stealthAddress: '0x12' }, null], headOf());
    const r = await createRangeSource({ chainId: 31337, backend: be }).fetch({ chainId: 31337, fromBlock: 1000n, toBlock: 1999n });
    expect(r.announcements.map((a) => a.logIndex)).toEqual([0, 1]);
    expect(r.skipped).toBe(4);
  });
  it('a lying backend returning records outside the asked chunk is dropped', async () => {
    const be = {
      getHead: () => Promise.resolve(headOf()),
      getAnnouncements: () => Promise.resolve([rawAnn(5000, 0), rawAnn(1100, 0)]),
    };
    const r = await createRangeSource({ chainId: 31337, backend: be }).fetch({ chainId: 31337, fromBlock: 1000n, toBlock: 1999n });
    expect(r.announcements.length).toBe(1);
    expect(r.skipped).toBe(1);
  });
  it('fuzz: junk from the backend never throws and never leaks into the result', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.anything(), { maxLength: 20 }), async (junk) => {
        const be = fakeBackend(junk, headOf());
        const r = await createRangeSource({ chainId: 31337, backend: be }).fetch({ chainId: 31337, fromBlock: 0n, toBlock: 10n });
        expect(r.announcements.length).toBe(0);
      }),
      { numRuns: 60 },
    );
  });
  it('budgets: maxRequests and maxLogs throw TRUNCATED', async () => {
    expect(await codeOf(() => createRangeSource({ chainId: 31337, backend: fakeBackend(), maxRequests: 2 }).fetch({ chainId: 31337, fromBlock: 0n, toBlock: CHAIN_HEAD }))).toBe('TRUNCATED');
    expect(await codeOf(() => createRangeSource({ chainId: 31337, backend: fakeBackend(), maxLogs: 3 }).fetch({ chainId: 31337, fromBlock: 0n, toBlock: CHAIN_HEAD }))).toBe('TRUNCATED');
  });
  it('testnet guard at creation and fetch; chain mismatch', async () => {
    expect(await codeOf(() => createRangeSource({ chainId: 1, backend: fakeBackend() }))).toBe('TESTNET_ONLY');
    const src = createRangeSource({ chainId: 31337, backend: fakeBackend() });
    expect(await codeOf(() => src.fetch({ chainId: 1, fromBlock: 0n, toBlock: 1n }))).toBe('TESTNET_ONLY');
    expect(await codeOf(() => src.fetch({ chainId: 84532, fromBlock: 0n, toBlock: 1n }))).toBe('INVALID_ARGUMENT');
  });
  it('rejects bad options', async () => {
    for (const bad of [{ windowBlocks: 0 }, { maxRequests: 0 }, { maxLogs: 0 }, { align: 0 }, { minSpan: 0 }]) {
      expect(await codeOf(() => createRangeSource({ chainId: 31337, backend: fakeBackend(), ...bad }))).toBe('INVALID_ARGUMENT');
    }
  });
  it('custom align/minSpan: minSpan larger than window needs several calls', async () => {
    const be = fakeBackend();
    const r = await createRangeSource({ chainId: 31337, backend: be, windowBlocks: 500, align: 1000, minSpan: 2000 }).fetch({ chainId: 31337, fromBlock: 10n, toBlock: 10n });
    expect(r.coverage).toEqual({ fromBlock: 0n, toBlock: 1999n });
    expect(be.calls.length).toBe(4);
    expect(r.announcements.length).toBe(RAW.filter((x) => BigInt(x['blockNumber'] as string) <= 1999n).length);
  });
});
