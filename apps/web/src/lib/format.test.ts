import { describe, expect, it } from 'vitest';
import { fiatDecimals, formatCountdown, formatFiat, formatUnits, formatUnix, parseUnits, shortHex, taxFor } from './format';

describe('formatUnits / parseUnits', () => {
  it('formats and trims', () => {
    expect(formatUnits(1_500_000n, 6)).toBe('1.5');
    expect(formatUnits(1_000_000n, 6)).toBe('1');
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001');
    expect(formatUnits(-250n, 2)).toBe('-2.5');
    expect(formatUnits(5n, 0)).toBe('5');
  });
  it('rejects bad decimals', () => {
    expect(() => formatUnits(1n, -1)).toThrow(RangeError);
    expect(() => formatUnits(1n, 37)).toThrow(RangeError);
    expect(() => formatUnits(1n, 1.5)).toThrow(RangeError);
  });
  it('parses strictly without rounding', () => {
    expect(parseUnits('25.50', 6)).toBe(25_500_000n);
    expect(parseUnits(' 7 ', 2)).toBe(700n);
    expect(parseUnits('0.000001', 6)).toBe(1n);
    expect(parseUnits('0.0000001', 6)).toBeUndefined();
    expect(parseUnits('1e3', 6)).toBeUndefined();
    expect(parseUnits('-1', 6)).toBeUndefined();
    expect(parseUnits('01', 6)).toBeUndefined();
    expect(parseUnits('', 6)).toBeUndefined();
    expect(parseUnits('1.', 6)).toBeUndefined();
    expect(parseUnits('12', 0)).toBe(12n);
    expect(parseUnits('1.5', 0)).toBeUndefined();
  });
});

describe('fiat', () => {
  it('uses currency exponent', () => {
    expect(fiatDecimals('USD')).toBe(2);
    expect(fiatDecimals('JPY')).toBe(0);
    expect(formatFiat(12_345n, 'USD')).toBe('USD 123.45');
    expect(formatFiat(5n, 'USD')).toBe('USD 0.05');
    expect(formatFiat(500n, 'JPY')).toBe('JPY 500');
  });
  it('rounds tax half up', () => {
    expect(taxFor(10_000n, 500)).toBe(500n);
    expect(taxFor(1n, 5000)).toBe(1n);
    expect(taxFor(1n, 4999)).toBe(0n);
  });
});

describe('display helpers', () => {
  it('shortens', () => {
    expect(shortHex('0x1234567890abcdef1234567890abcdef', 6, 4)).toBe('0x1234…cdef');
    expect(shortHex('0x12')).toBe('0x12');
  });
  it('counts down', () => {
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(3_661_000)).toBe('1:01:01');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatCountdown(500)).toBe('0:01');
  });
  it('formats unix time in UTC', () => {
    expect(formatUnix(0)).toBe('1970-01-01 00:00:00 UTC');
    expect(formatUnix(253_402_300_799)).toBe('9999-12-31 23:59:59 UTC');
    expect(formatUnix(8.64e12)).toBe('+275760-09-13 00:00:00 UTC');
  });
  it('never throws for a time outside the Date range, so a hostile invoice cannot crash a render (G1-01)', () => {
    for (const s of [Number.MAX_SAFE_INTEGER, 8.64e12 + 1, -8.64e12 - 1, NaN, Infinity, -Infinity]) {
      expect(formatUnix(s)).toBe('invalid time');
    }
  });
});
