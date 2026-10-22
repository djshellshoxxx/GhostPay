import { describe, expect, it } from 'vitest';
import { AmountBlurError } from './errors.js';
import { matchSplitGroup, type FoundPayment, type GroupQuery } from './group.js';

const T = '0x00000000000000000000000000000000000000aa';
const U = '0x00000000000000000000000000000000000000bb';
const p = (id: string, net: bigint, blockTime: number, token = T): FoundPayment => ({ id, token, net, blockTime });
const q = (o: Partial<GroupQuery> = {}): GroupQuery => ({ chainId: 84532, token: T, expectedNet: 100_000_000n, toleranceBps: 50, windowSec: 3600, ...o });

describe('matchSplitGroup (AB-G1, AB-G2)', () => {
  it('exact 3-way split among unrelated payments', () => {
    const found = [p('a', 40_000_000n, 1000), p('b', 35_000_000n, 1200), p('c', 25_000_000n, 1500), p('x', 7_777_777n, 1100), p('y', 90_000_000n, 99_999)];
    expect(matchSplitGroup(found, q())).toEqual({ candidates: [['a', 'b', 'c']], truncated: false, capped: false });
  });
  it('sum below expected or above tolerance is rejected', () => {
    expect(matchSplitGroup([p('a', 60_000_000n, 1), p('b', 39_999_999n, 2)], q()).candidates).toEqual([]);
    expect(matchSplitGroup([p('a', 60_000_000n, 1), p('b', 40_500_001n, 2)], q()).candidates).toEqual([]);
    expect(matchSplitGroup([p('a', 60_000_000n, 1), p('b', 40_500_000n, 2)], q()).candidates).toEqual([['a', 'b']]);
  });
  it('ambiguity: two valid subsets are both returned, never resolved', () => {
    const found = [p('a', 60_000_000n, 1), p('b', 40_000_000n, 2), p('c', 40_000_000n, 3)];
    expect(matchSplitGroup(found, q()).candidates).toEqual([['a', 'b'], ['a', 'c']]);
  });
  it('different token ignored (case-insensitive match)', () => {
    const found = [p('a', 60_000_000n, 1, U), p('b', 40_000_000n, 2, U)];
    expect(matchSplitGroup(found, q()).candidates).toEqual([]);
    expect(matchSplitGroup(found, q({ token: U.toUpperCase().replace('0X', '0x') })).candidates).toEqual([['a', 'b']]);
  });
  it('window spread enforced', () => {
    const found = [p('a', 60_000_000n, 0), p('b', 40_000_000n, 3601)];
    expect(matchSplitGroup(found, q()).candidates).toEqual([]);
    expect(matchSplitGroup(found, q({ windowSec: 3601 })).candidates).toEqual([['a', 'b']]);
  });
  it('minimality: an extra tiny payment does not create a second candidate', () => {
    const found = [p('a', 60_000_000n, 1), p('b', 40_000_000n, 2), p('d', 1n, 3)];
    expect(matchSplitGroup(found, q()).candidates).toEqual([['a', 'b']]);
  });
  it('single payment is not a group unless minParts=1', () => {
    const found = [p('a', 100_000_000n, 1)];
    expect(matchSplitGroup(found, q()).candidates).toEqual([]);
    expect(matchSplitGroup(found, q({ minParts: 1 })).candidates).toEqual([['a']]);
  });
  it('n = 17: truncated to the 16 most recent, bounded work', () => {
    const found = Array.from({ length: 17 }, (_, i) => p(`p${String(i).padStart(2, '0')}`, 1_000_000n, 10_000 + i));
    const r = matchSplitGroup(found, q({ expectedNet: 2_000_000n, toleranceBps: 0 }));
    expect(r.truncated).toBe(true);
    expect(r.candidates.flat()).not.toContain('p00');
    expect(r.candidates).toHaveLength(120);
    const t0 = Date.now();
    matchSplitGroup(Array.from({ length: 40 }, (_, i) => p(`q${i}`, 3n, i)), q({ expectedNet: 9n, toleranceBps: 0 }));
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it('candidate list is capped and flagged', () => {
    const found = Array.from({ length: 16 }, (_, i) => p(`z${String(i).padStart(2, '0')}`, 1_000_000n, i));
    const r = matchSplitGroup(found, q({ expectedNet: 3_000_000n, toleranceBps: 0 }));
    expect(r.capped).toBe(true);
    expect(r.candidates).toHaveLength(256);
  });
  it('groups larger than 8 parts are not proposed', () => {
    const found = Array.from({ length: 9 }, (_, i) => p(`m${i}`, 1_000n, i));
    expect(matchSplitGroup(found, q({ expectedNet: 9_000n, toleranceBps: 0 })).candidates).toEqual([]);
  });
  it('zero-net payments ignored; empty input', () => {
    expect(matchSplitGroup([p('a', 0n, 1)], q()).candidates).toEqual([]);
    expect(matchSplitGroup([], q()).candidates).toEqual([]);
  });
  it('tie in time sorts by id deterministically', () => {
    const found = [p('b', 50_000_000n, 5), p('a', 50_000_000n, 5)];
    expect(matchSplitGroup(found, q()).candidates).toEqual([['a', 'b']]);
  });
  it('rejects mainnet, bad queries and malformed input', () => {
    expect(() => matchSplitGroup([], q({ chainId: 1 }))).toThrow(/testnet-only/);
    for (const bad of [{ expectedNet: 0n }, { toleranceBps: -1 }, { toleranceBps: 10_001 }, { windowSec: -1 }, { minParts: 0 }, { minParts: 9 }]) {
      expect(() => matchSplitGroup([], q(bad))).toThrow(AmountBlurError);
    }
    expect(() => matchSplitGroup([p('a', 1n, 1), p('a', 1n, 2)], q())).toThrow(/duplicate/);
    expect(() => matchSplitGroup([p('a', -1n, 1)], q())).toThrow(AmountBlurError);
    expect(() => matchSplitGroup([p('a', 1n, NaN)], q())).toThrow(AmountBlurError);
  });
});
