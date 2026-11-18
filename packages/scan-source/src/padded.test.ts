import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ScanSourceError } from './errors.js';
import { fetchPadded, padRange } from './padded.js';

const item = (blockNumber: bigint): { blockNumber: bigint } => ({ blockNumber });

describe('padRange', () => {
  it('rounds to the grid and does not reveal the exact range', () => {
    expect(padRange(1234n, 1240n, { align: 1000 })).toEqual({ from: 1000n, to: 1999n });
    expect(padRange(1234n, 1240n, { align: 1000, padBlocks: 100 })).toEqual({ from: 1000n, to: 1999n });
    expect(padRange(1234n, 1240n, { align: 100 })).toEqual({ from: 1200n, to: 1299n });
  });
  it('padBlocks widens the range before the grid is applied', () => {
    expect(padRange(1990n, 1995n, { align: 1000, padBlocks: 10 })).toEqual({ from: 1000n, to: 2999n });
    expect(padRange(5n, 6n, { align: 10, padBlocks: 100 })).toEqual({ from: 0n, to: 109n });
  });
  it('clamps to the head and refuses a window beyond it', () => {
    expect(padRange(1234n, 1240n, { align: 1000 }, 1500n)).toEqual({ from: 1000n, to: 1500n });
    expect(() => padRange(2500n, 2600n, { align: 1000 }, 1500n)).toThrow(ScanSourceError);
    try { padRange(2500n, 2600n, { align: 1000 }, 1500n); } catch (e) { expect((e as ScanSourceError).code).toBe('OUT_OF_RANGE'); }
  });
  it('refuses bad options and an oversize span', () => {
    for (const f of [
      () => padRange(5n, 4n, { align: 10 }),
      () => padRange(-1n, 4n, { align: 10 }),
      () => padRange(0n, 4n, { align: 0 }),
      () => padRange(0n, 4n, { align: 10, padBlocks: -1 }),
      () => padRange(0n, 4n, { align: 10, padBlocks: 1.5 }),
      () => padRange(0n, 4n, { align: 10, maxSpan: 0 }),
      () => padRange(0n, 5_000n, { align: 10, maxSpan: 1000 }),
    ]) expect(f).toThrow(ScanSourceError);
  });
  it('property: covers the request, grid aligned, contains the pad, same size for a fresh start and a one-block catch-up', () => {
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 9n }), fc.bigInt({ min: 0n, max: 5000n }), fc.integer({ min: 1, max: 3000 }), fc.integer({ min: 0, max: 2000 }), (from, len, align, pad) => {
      const to = from + len;
      const w = padRange(from, to, { align, padBlocks: pad });
      expect(w.from <= from && w.to >= to).toBe(true);
      expect(w.from % BigInt(align)).toBe(0n);
      expect((w.to + 1n) % BigInt(align)).toBe(0n);
      expect(w.from <= (from > BigInt(pad) ? from - BigInt(pad) : 0n)).toBe(true);
      expect(w.to >= to + BigInt(pad)).toBe(true);
    }), { numRuns: 200 });
    const a = padRange(0n, 0n, { align: 1000 });
    const b = padRange(7_654_321n, 7_654_321n, { align: 1000 });
    expect(a.to - a.from).toBe(b.to - b.from);
  });
});

describe('fetchPadded', () => {
  it('asks for grid-aligned windows only and returns just the requested range', async () => {
    const calls: [bigint, bigint][] = [];
    const res = await fetchPadded({ fromBlock: 1234n, toBlock: 1240n }, (s, e) => {
      calls.push([s, e]);
      return Promise.resolve([s, 1233n, 1234n, 1240n, 1241n, e].filter((n) => n >= s && n <= e).map(item));
    }, { align: 1000, windowBlocks: 500 });
    expect(calls).toEqual([[1000n, 1499n], [1500n, 1999n]]);
    expect(res.coverage).toEqual({ fromBlock: 1000n, toBlock: 1999n });
    expect(res.items.map((x) => x.blockNumber)).toEqual([1234n, 1240n]);
    for (const [s, e] of calls) { expect(s % 500n).toBe(0n); expect((e + 1n) % 500n).toBe(0n); }
  });
  it('exact=false returns everything in the padded range, sorted', async () => {
    const res = await fetchPadded({ fromBlock: 15n, toBlock: 16n }, () => Promise.resolve([item(19n), item(11n), item(16n)]), { align: 10, windowBlocks: 10, exact: false });
    expect(res.items.map((x) => x.blockNumber)).toEqual([11n, 16n, 19n]);
  });
  it('drops items a server returns outside the window it was asked for', async () => {
    const res = await fetchPadded({ fromBlock: 0n, toBlock: 5n }, () => Promise.resolve([item(3n), item(500n)]), { align: 10, windowBlocks: 10, exact: false });
    expect(res.items.map((x) => x.blockNumber)).toEqual([3n]);
  });
  it('shuffles the request order with the supplied generator and keeps the output order', async () => {
    const order: bigint[] = [];
    const res = await fetchPadded({ fromBlock: 0n, toBlock: 29n }, (s) => { order.push(s); return Promise.resolve([item(s + 1n)]); }, { align: 10, windowBlocks: 10, exact: false, random: () => 0 });
    expect(new Set(order)).toEqual(new Set([0n, 10n, 20n]));
    expect(order).not.toEqual([0n, 10n, 20n]);
    expect(res.items.map((x) => x.blockNumber)).toEqual([1n, 11n, 21n]);
  });
  it('rejects a generator that returns an out-of-range index', async () => {
    await expect(fetchPadded({ fromBlock: 0n, toBlock: 29n }, () => Promise.resolve([]), { align: 10, windowBlocks: 10, random: () => 99 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
  it('clamps to the head and makes no call when the budget would be exceeded', async () => {
    const calls: [bigint, bigint][] = [];
    await fetchPadded({ fromBlock: 5n, toBlock: 6n }, (s, e) => { calls.push([s, e]); return Promise.resolve([]); }, { align: 10, windowBlocks: 10, head: 7n });
    expect(calls).toEqual([[0n, 7n]]);
    calls.length = 0;
    await expect(fetchPadded({ fromBlock: 0n, toBlock: 99n }, (s, e) => { calls.push([s, e]); return Promise.resolve([]); }, { align: 10, windowBlocks: 10, maxRequests: 3 })).rejects.toMatchObject({ code: 'TRUNCATED' });
    expect(calls).toEqual([]);
  });
  it('rejects bad windowBlocks and maxRequests', async () => {
    await expect(fetchPadded({ fromBlock: 0n, toBlock: 1n }, () => Promise.resolve([]), { align: 10, windowBlocks: 0 })).rejects.toBeInstanceOf(ScanSourceError);
    await expect(fetchPadded({ fromBlock: 0n, toBlock: 1n }, () => Promise.resolve([]), { align: 10, windowBlocks: 10, maxRequests: 0 })).rejects.toBeInstanceOf(ScanSourceError);
  });
  it('passes the abort signal through', async () => {
    const ac = new AbortController();
    let seen: AbortSignal | undefined;
    await fetchPadded({ fromBlock: 0n, toBlock: 1n }, (_s, _e, sig) => { seen = sig; return Promise.resolve([]); }, { align: 10, windowBlocks: 10 }, ac.signal);
    expect(seen).toBe(ac.signal);
  });
});
