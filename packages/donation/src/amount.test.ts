import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DonationError, MAX_DONATION_PPM, computeDonation, defaultMinUnits } from './index.js';

const U256 = (1n << 256n) - 1n;

describe('computeDonation', () => {
  it('floors', () => {
    // 1_999_999 * 965 / 1e6 = 1929.99... -> 1929 (dust floor 1 for decimals 2? use minUnits 1)
    expect(computeDonation({ gross: 1_999_999n, decimals: 0, ppm: 965 }).amount).toBe(1929n);
  });
  it('dust boundary at 6 decimals: floor is 10_000 units', () => {
    expect(defaultMinUnits(6)).toBe(10_000n);
    // gross 10_362_694 -> raw 10_000.0..: exactly at/over floor
    const atFloor = computeDonation({ gross: 10_363_000n, decimals: 6, ppm: 965 });
    expect(atFloor).toEqual({ amount: 10_000n, ppm: 965, belowDust: false }); // 10_000.795 floors to 10_000
    const below = computeDonation({ gross: 10_362_000n, decimals: 6, ppm: 965 }); // 9_999.33 -> 9_999
    expect(below).toEqual({ amount: 0n, ppm: 965, belowDust: true });
  });
  it('minUnits override and low decimals', () => {
    expect(defaultMinUnits(2)).toBe(1n);
    expect(defaultMinUnits(0)).toBe(1n);
    expect(computeDonation({ gross: 1_000_000n, decimals: 6, ppm: 965, minUnits: 1n }).amount).toBe(965n);
    expect(computeDonation({ gross: 1_000_000n, decimals: 6, ppm: 965 }).belowDust).toBe(true);
    expect(computeDonation({ gross: 0n, decimals: 6, ppm: 965 }).belowDust).toBe(true);
  });
  it('ppm 0 is zero and not dust; MAX is 5%', () => {
    expect(computeDonation({ gross: 10n ** 18n, decimals: 18, ppm: 0 })).toEqual({
      amount: 0n,
      ppm: 0,
      belowDust: false,
    });
    expect(computeDonation({ gross: 10n ** 18n, decimals: 18, ppm: MAX_DONATION_PPM }).amount).toBe(
      5n * 10n ** 16n,
    );
  });
  it('uint256 max gross does not overflow and stays below gross', () => {
    const r = computeDonation({ gross: U256, decimals: 18, ppm: MAX_DONATION_PPM });
    expect(r.amount).toBe((U256 * 50_000n) / 1_000_000n);
    expect(r.amount <= U256).toBe(true);
  });
  it('rejects bad input with typed errors', () => {
    const code = (f: () => unknown): string | undefined => {
      try {
        f();
      } catch (e) {
        return (e as DonationError).code;
      }
      return undefined;
    };
    expect(code(() => computeDonation({ gross: 1n, decimals: 6, ppm: MAX_DONATION_PPM + 1 }))).toBe(
      'INVALID_PPM',
    );
    expect(code(() => computeDonation({ gross: -1n, decimals: 6, ppm: 1 }))).toBe('INVALID_AMOUNT');
    expect(code(() => computeDonation({ gross: 1n, decimals: 78, ppm: 1 }))).toBe('INVALID_DECIMALS');
    expect(code(() => computeDonation({ gross: 1n, decimals: 1.5, ppm: 1 }))).toBe('INVALID_DECIMALS');
    expect(code(() => computeDonation({ gross: 1n, decimals: 6, ppm: 1, minUnits: -1n }))).toBe(
      'INVALID_AMOUNT',
    );
  });
  it('properties', () => {
    const gross = fc.bigInt({ min: 0n, max: U256 });
    const ppm = fc.integer({ min: 0, max: MAX_DONATION_PPM });
    const dec = fc.integer({ min: 0, max: 30 });
    fc.assert(
      fc.property(gross, ppm, dec, (g, p, d) => {
        const r = computeDonation({ gross: g, decimals: d, ppm: p });
        return r.amount <= g && (p !== 0 || r.amount === 0n);
      }),
    );
    fc.assert(
      fc.property(gross, gross, ppm, dec, (a, b, p, d) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const x = computeDonation({ gross: lo, decimals: d, ppm: p, minUnits: 0n }).amount;
        const y = computeDonation({ gross: hi, decimals: d, ppm: p, minUnits: 0n }).amount;
        return x <= y;
      }),
    );
  });
});
