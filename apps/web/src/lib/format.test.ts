import { describe, expect, it } from 'vitest';
import { fiatDecimals, formatCountdown, formatFiat, formatUnits, formatUnix, minutesLabel, parseUnits, shortHex, taxFor, visibleText } from './format';

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
  });
});

describe('minutesLabel', () => {
  it('does not round fractional minutes to a misleading integer', () => {
    expect(minutesLabel(120)).toBe('2');
    expect(minutesLabel(900)).toBe('15');
    expect(minutesLabel(90)).toBe('1.5');
    expect(minutesLabel(30)).toBe('0.5');
  });
});

describe('visibleText (item 6)', () => {
  it('marks bidi, invisible and control characters but keeps normal text, newlines, ZWJ emoji and RTL letters', () => {
    expect(visibleText('plain text')).toBe('plain text');
    expect(visibleText('a‮b')).toBe('a⟦U+202E⟧b');
    expect(visibleText('​﻿⁦⁩\u0000\u007F\u0085 ')).toBe('⟦U+200B⟧⟦U+FEFF⟧⟦U+2066⟧⟦U+2069⟧⟦U+0000⟧⟦U+007F⟧⟦U+0085⟧⟦U+2028⟧');
    expect(visibleText('line1\nline2')).toBe('line1\nline2');
    expect(visibleText('\u{1F468}‍\u{1F469}')).toBe('\u{1F468}‍\u{1F469}');
    expect(visibleText('שלום')).toBe('שלום');
    expect(visibleText('\u{E0041}')).toBe('⟦U+E0041⟧');
  });
  it('is linear on long input', () => {
    const t0 = performance.now();
    visibleText('‮'.repeat(200_000));
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
