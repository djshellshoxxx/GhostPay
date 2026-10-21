import fc from 'fast-check';
import { MAX_ROUTER_GROSS } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { AmountBlurError } from './errors.js';
import { denominationSet, gridFor, snapUp } from './grid.js';

const C = 84532;

describe('gridFor / denominationSet (AB-R2)', () => {
  it('is ascending, positive and contains one whole token for every d in 0..36', () => {
    for (let d = 0; d <= 36; d += 1) {
      const s = gridFor(d).stepsBase;
      expect(s.every((v) => v > 0n)).toBe(true);
      for (let i = 1; i < s.length; i += 1) expect(s[i]! > s[i - 1]!).toBe(true);
      expect(s).toContain(10n ** BigInt(d));
    }
  });
  it('USDC (d=6): 0.01 .. 500000 units', () => {
    const s = gridFor(6).stepsBase;
    expect(s[0]).toBe(10_000n);
    expect(s[s.length - 1]).toBe(5n * 10n ** 10n);
  });
  it('d=0 and d=1 start at one base unit', () => {
    expect(gridFor(0).stepsBase.slice(0, 3)).toEqual([1n, 2n, 5n]);
    expect(gridFor(1).stepsBase[0]).toBe(1n);
  });
  it('custom exponent range and rejects bad input', () => {
    expect(denominationSet(6, { minExp: 3, maxExp: 4 }).stepsBase).toEqual([1000n, 2000n, 5000n, 10000n, 20000n, 50000n]);
    expect(() => denominationSet(6, { minExp: 5, maxExp: 4 })).toThrow(AmountBlurError);
    expect(() => denominationSet(37)).toThrow(AmountBlurError);
    expect(() => denominationSet(1.5)).toThrow(AmountBlurError);
    expect(() => denominationSet(6, { maxExp: 99 })).toThrow(AmountBlurError);
  });
});

describe('snapUp (AB-R1, AB-R4)', () => {
  const g6 = gridFor(6);
  it('spec example: 104.37 USDC -> 105.00 at 1 %', () => {
    const r = snapUp(104_370_000n, g6, 100, C);
    expect(r).toEqual({ value: 105_000_000n, rounded: true });
  });
  it('exact grid point is unchanged and not "rounded"', () => {
    expect(snapUp(100_000_000n, g6, 100, C)).toEqual({ value: 100_000_000n, rounded: false });
  });
  it('cap too tight -> ROUND_CAP with unchanged value', () => {
    // 0.01 USDC + 1 base unit: next cent is +9999 units, far above 1 %.
    const r = snapUp(10_001n, g6, 100, C);
    expect(r).toEqual({ value: 10_001n, rounded: false, reason: 'ROUND_CAP' });
  });
  it('zero cap rounds only exact multiples', () => {
    expect(snapUp(123_450_000n, g6, 0, C).rounded).toBe(false);
    expect(snapUp(123_450_001n, g6, 0, C).reason).toBe('ROUND_CAP');
  });
  it('boundaries 399, 400, 401, 10^d, MAX_ROUTER_GROSS', () => {
    for (const g of [399n, 400n, 401n, 10n ** 6n, MAX_ROUTER_GROSS]) {
      const r = snapUp(g, g6, 500, C);
      expect(r.value >= g).toBe(true);
      expect(r.value <= MAX_ROUTER_GROSS).toBe(true);
    }
    expect(snapUp(10n ** 6n, g6, 0, C).rounded).toBe(false);
  });
  it('never exceeds MAX_ROUTER_GROSS even when a coarser step would', () => {
    const r = snapUp(MAX_ROUTER_GROSS, gridFor(0), 500, C);
    expect(r.value).toBeLessThanOrEqual(MAX_ROUTER_GROSS);
  });
  it('rejects bad inputs and non-testnet chains', () => {
    expect(() => snapUp(0n, g6, 100, C)).toThrow(AmountBlurError);
    expect(() => snapUp(MAX_ROUTER_GROSS + 1n, g6, 100, C)).toThrow(AmountBlurError);
    expect(() => snapUp(1n, g6, 501, C)).toThrow(AmountBlurError);
    expect(() => snapUp(1n, g6, -1, C)).toThrow(AmountBlurError);
    expect(() => snapUp(1n, g6, 1.5, C)).toThrow(AmountBlurError);
    expect(() => snapUp(5 as unknown as bigint, g6, 1, C)).toThrow(AmountBlurError);
    expect(() => snapUp(1n, { stepsBase: [] }, 1, C)).toThrow(AmountBlurError);
    expect(() => snapUp(1n, { stepsBase: [2n, 2n] }, 1, C)).toThrow(AmountBlurError);
    expect(() => snapUp(1n, { stepsBase: [0n, 1n] }, 1, C)).toThrow(AmountBlurError);
    for (const id of [1, 8453, 10, 0, 31337.5, NaN]) {
      expect(() => snapUp(1000n, g6, 100, id)).toThrow(/testnet-only/);
    }
    for (const id of [31337, 11155111, 84532]) expect(() => snapUp(1000n, g6, 100, id)).not.toThrow();
  });
  it('property: result >= g and within cap, or ROUND_CAP (g in [1, 2^200])', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 1n << 200n }), fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 36 }), (g, bps, d) => {
        const r = snapUp(g, gridFor(d), bps, C);
        if (r.reason === 'ROUND_CAP') return r.value === g && !r.rounded;
        return r.value >= g && r.value <= (g * BigInt(10_000 + bps)) / 10_000n;
      }),
      { numRuns: 2000 },
    );
  });
  it('property: re-applying never lowers, stays within two caps, identity at cap 0', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 30n }), fc.integer({ min: 0, max: 500 }), (g, bps) => {
        const a = snapUp(g, g6, bps, C).value;
        const b = snapUp(a, g6, bps, C).value;
        const z = snapUp(a, g6, 0, C).value;
        return b >= a && b <= (g * BigInt(10_000 + bps) ** 2n) / 10_000n ** 2n + 1n && (z === a || snapUp(a, g6, 0, C).reason === 'ROUND_CAP');
      }),
      { numRuns: 1000 },
    );
  });
  it('idempotent on typical amounts', () => {
    for (const g of [104_370_000n, 99_990_000n, 250_000_000n]) {
      const a = snapUp(g, g6, 100, C).value;
      expect(snapUp(a, g6, 100, C).value).toBe(a);
    }
  });
  it('AB-R4 is only SHOULD: documented counterexample (cap is relative to the new, larger base)', () => {
    const a = snapUp(1_234_567n, g6, 100, C).value;
    expect(a).toBe(1_240_000n);
    expect(snapUp(a, g6, 100, C).value).toBe(1_250_000n);
  });
});
