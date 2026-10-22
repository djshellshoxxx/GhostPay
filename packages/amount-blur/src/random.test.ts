import { describe, expect, it } from 'vitest';
import { AmountBlurError } from './errors.js';
import { randomBelow, randomInt, shuffle } from './random.js';
import { chiSquare, failing, seeded, stuck } from './rng.testutil.js';

describe('randomBelow (AB-S6)', () => {
  it('chi-square: no modulo bias for spans not dividing 2^32 (n=7, 100k, df=6, p>0.001)', () => {
    const r = seeded(1);
    const c = new Array<number>(7).fill(0);
    for (let i = 0; i < 100_000; i += 1) c[Number(randomBelow(r, 7n))]! += 1;
    expect(chiSquare(c)).toBeLessThan(22.46);
  });
  it('chi-square n=200 (rejection region large), df=199, critical 0.001 ~ 267', () => {
    const r = seeded(2);
    const c = new Array<number>(200).fill(0);
    for (let i = 0; i < 100_000; i += 1) c[Number(randomBelow(r, 200n))]! += 1;
    expect(chiSquare(c)).toBeLessThan(267);
  });
  it('detector has power: naive byte%200 is rejected by the same test', () => {
    const r = seeded(3);
    const c = new Array<number>(200).fill(0);
    const b = new Uint8Array(1);
    for (let i = 0; i < 100_000; i += 1) {
      r.getRandomValues(b);
      c[b[0]! % 200]! += 1;
    }
    expect(chiSquare(c)).toBeGreaterThan(267);
  });
  it('big bounds work and stay below n', () => {
    const r = seeded(4);
    const n = (1n << 200n) + 12345n;
    for (let i = 0; i < 50; i += 1) expect(randomBelow(r, n) < n).toBe(true);
  });
  it('n = 1 is 0; bad bounds rejected', () => {
    expect(randomBelow(seeded(1), 1n)).toBe(0n);
    for (const n of [0n, -1n, (1n << 256n) + 1n, 5 as unknown as bigint]) expect(() => randomBelow(seeded(1), n)).toThrow(AmountBlurError);
  });
  it('failing and stuck sources throw RANDOM_FAILED instead of degrading', () => {
    expect(() => randomBelow(failing, 10n)).toThrow(expect.objectContaining({ code: 'RANDOM_FAILED' }));
    expect(() => randomBelow(stuck, 10n)).toThrow(expect.objectContaining({ code: 'RANDOM_FAILED' }));
  });
});

describe('randomInt / shuffle', () => {
  it('randomInt inclusive bounds and invalid ranges', () => {
    const r = seeded(5);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(randomInt(r, 3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
    expect(() => randomInt(r, 5, 3)).toThrow(AmountBlurError);
    expect(() => randomInt(r, 0.5, 3)).toThrow(AmountBlurError);
  });
  it('shuffle: uniform over 6 permutations of 3 (60k, df=5, critical 20.5)', () => {
    const r = seeded(6);
    const idx = new Map<string, number>();
    for (let i = 0; i < 60_000; i += 1) {
      const k = shuffle(r, [1, 2, 3]).join('');
      idx.set(k, (idx.get(k) ?? 0) + 1);
    }
    expect(idx.size).toBe(6);
    expect(chiSquare([...idx.values()])).toBeLessThan(20.5);
  });
  it('does not modify its input and handles tiny arrays', () => {
    const a = [1, 2, 3];
    shuffle(seeded(1), a);
    expect(a).toEqual([1, 2, 3]);
    expect(shuffle(seeded(1), [])).toEqual([]);
    expect(shuffle(seeded(1), [9])).toEqual([9]);
  });
});
