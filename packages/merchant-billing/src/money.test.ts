import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BillingError, bpsOf, formatDecimal, mulDivRound, parseAmount, parseDecimal, splitByBps, splitEqual, MAX_AMOUNT } from './index.js';

describe('parseAmount', () => {
  it('accepts canonical integers', () => {
    expect(parseAmount('0')).toBe(0n);
    expect(parseAmount('1000000')).toBe(1_000_000n);
    expect(parseAmount(MAX_AMOUNT.toString())).toBe(MAX_AMOUNT);
  });
  it.each(['', '01', '-1', '1.0', '1e3', ' 1', '1 ', '0x10', '١٢٣', 'NaN', (MAX_AMOUNT + 1n).toString()])('rejects %j', (s) => {
    expect(() => parseAmount(s)).toThrow(BillingError);
  });
  it('rejects non-strings', () => {
    expect(() => parseAmount(5)).toThrow(BillingError);
    expect(() => parseAmount(null)).toThrow(BillingError);
  });
});

describe('parseDecimal / formatDecimal', () => {
  it('USDC 6 decimals', () => {
    expect(parseDecimal('1250.75', 6)).toBe(1_250_750_000n);
    expect(parseDecimal('0.000001', 6)).toBe(1n);
    expect(parseDecimal('0', 6)).toBe(0n);
    expect(parseDecimal('7', 0)).toBe(7n);
    expect(parseDecimal('0.5', 6)).toBe(500_000n);
  });
  it('rejects excess precision and junk', () => {
    expect(() => parseDecimal('0.0000001', 6)).toThrow(BillingError);
    expect(() => parseDecimal('1.5', 0)).toThrow(BillingError);
    for (const s of ['-1', '+1', '1e2', '.5', '5.', '1,5', '00.5', '', ' 1'])
      expect(() => parseDecimal(s, 6)).toThrow(BillingError);
    expect(() => parseDecimal(1.5, 6)).toThrow(BillingError);
    expect(() => parseDecimal('1', 37)).toThrow(BillingError);
    expect(() => parseDecimal('1', 1.5)).toThrow(BillingError);
  });
  it('formats', () => {
    expect(formatDecimal(1_250_750_000n, 6)).toBe('1250.750000');
    expect(formatDecimal(1n, 6)).toBe('0.000001');
    expect(formatDecimal(42n, 0)).toBe('42');
    expect(() => formatDecimal(-1n, 6)).toThrow(BillingError);
  });
});

describe('bps and rounding', () => {
  it('bpsOf floors', () => {
    expect(bpsOf(10_001n, 5000)).toBe(5000n);
    expect(bpsOf(1_000_000n, 825)).toBe(82_500n);
    expect(() => bpsOf(1n, 10_001)).toThrow(BillingError);
    expect(() => bpsOf(1n, 1.5)).toThrow(BillingError);
  });
  it('mulDivRound half up', () => {
    expect(mulDivRound(10n, 1n, 4n)).toBe(3n);
    expect(mulDivRound(10n, 1n, 3n)).toBe(3n);
    expect(mulDivRound(10n, 2n, 3n)).toBe(7n);
    expect(() => mulDivRound(1n, 1n, 0n)).toThrow(BillingError);
    expect(() => mulDivRound(-1n, 1n, 1n)).toThrow(BillingError);
  });
});

describe('splitByBps', () => {
  it('3-way 3333/3333/3334 of 100 sums exactly', () => {
    const r = splitByBps(100n, [{ id: 'a', bps: 3333 }, { id: 'b', bps: 3333 }, { id: 'c', bps: 3334 }]);
    expect(r.map((x) => x.amount)).toEqual([33n, 33n, 34n]);
  });
  it('remainder goes to largest fractional remainder, ties by order', () => {
    // 10 units, 3 equal-ish shares: floor 3,3,3 left 1; rems 3333*10%10000=3330, 3330, 3340 -> c
    const r = splitByBps(10n, [{ id: 'a', bps: 3333 }, { id: 'b', bps: 3333 }, { id: 'c', bps: 3334 }]);
    expect(r.map((x) => x.amount)).toEqual([3n, 3n, 4n]);
    // exact tie: 1 unit, two 50% shares -> first gets it
    expect(splitByBps(1n, [{ id: 'a', bps: 5000 }, { id: 'b', bps: 5000 }]).map((x) => x.amount)).toEqual([1n, 0n]);
  });
  it('1 USDC (1_000_000) 70/20/10', () => {
    const r = splitByBps(1_000_000n, [{ id: 'a', bps: 7000 }, { id: 'b', bps: 2000 }, { id: 'c', bps: 1000 }]);
    expect(r.map((x) => x.amount)).toEqual([700_000n, 200_000n, 100_000n]);
  });
  it('zero total and zero-bps share', () => {
    expect(splitByBps(0n, [{ id: 'a', bps: 10000 }])[0]?.amount).toBe(0n);
    expect(splitByBps(7n, [{ id: 'a', bps: 0 }, { id: 'b', bps: 10000 }]).map((x) => x.amount)).toEqual([0n, 7n]);
  });
  it('rejects bad shares', () => {
    expect(() => splitByBps(1n, [])).toThrow(BillingError);
    expect(() => splitByBps(1n, [{ id: 'a', bps: 9999 }])).toThrow(BillingError);
    expect(() => splitByBps(1n, [{ id: 'a', bps: 5000 }, { id: 'a', bps: 5000 }])).toThrow(BillingError);
    expect(() => splitByBps(1n, [{ id: 'a', bps: -1 }, { id: 'b', bps: 10001 }])).toThrow(BillingError);
    expect(() => splitByBps(-1n, [{ id: 'a', bps: 10000 }])).toThrow(BillingError);
    expect(() => splitByBps(MAX_AMOUNT + 1n, [{ id: 'a', bps: 10000 }])).toThrow(BillingError);
  });
  it('property: always sums to total, each within 1 of exact', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: (1n << 200n) }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 }).filter((a) => a.some((x) => x > 0)),
        (total, w) => {
          const s = w.reduce((a, b) => a + b, 0);
          const bps = w.map((x) => Math.floor((x * 10_000) / s));
          bps[0] = (bps[0] as number) + 10_000 - bps.reduce((a, b) => a + b, 0);
          const r = splitByBps(total, bps.map((b, i) => ({ id: String(i), bps: b })));
          expect(r.reduce((a, x) => a + x.amount, 0n)).toBe(total);
          r.forEach((x, i) => {
            const exact = (total * BigInt(bps[i] as number)) / 10_000n;
            expect(x.amount === exact || x.amount === exact + 1n).toBe(true);
          });
        },
      ),
    );
  });
});

describe('splitEqual', () => {
  it('1000 into 3', () => expect(splitEqual(1000n, 3)).toEqual([334n, 333n, 333n]));
  it('rejects', () => {
    expect(() => splitEqual(1n, 0)).toThrow(BillingError);
    expect(() => splitEqual(-1n, 2)).toThrow(BillingError);
  });
});
