import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatAmount, fractionDigits, parseAmount, validateAsset } from './amount.js';
import { validateText } from './text.js';
import { validateMetaAddress, fingerprint } from './target.js';
import { code, META_A } from './fixtures.testutil.js';

describe('amount', () => {
  it('parses exact values', () => {
    expect(parseAmount('1.5', 6)).toBe(1_500_000n);
    expect(parseAmount('0.000001', 6)).toBe(1n);
    expect(parseAmount('42', 0)).toBe(42n);
    expect(parseAmount('0', 6, { allowZero: true })).toBe(0n);
  });
  it('rejects non-canonical and bad input', () => {
    for (const s of [
      '0',
      '',
      '01',
      '1.50',
      '1.',
      '.5',
      '-1',
      '+1',
      '1e3',
      ' 1',
      '1 ',
      '1,5',
      '0.0000001',
      '1.0',
      'NaN',
      '٣',
    ]) {
      expect(
        code(() => parseAmount(s, 6)),
        s,
      ).toBe('AMOUNT');
    }
    expect(code(() => parseAmount(5, 6))).toBe('AMOUNT');
    expect(code(() => parseAmount('1', 19))).toBe('AMOUNT');
    expect(code(() => parseAmount('1', -1))).toBe('AMOUNT');
    expect(code(() => parseAmount('1', 1.5))).toBe('AMOUNT');
    expect(code(() => parseAmount('1.5', 0))).toBe('AMOUNT');
  });
  it('enforces the 2^128-1 bound', () => {
    expect(parseAmount('340282366920938463463374607431768211455', 0)).toBe((1n << 128n) - 1n);
    expect(code(() => parseAmount('340282366920938463463374607431768211456', 0))).toBe('AMOUNT');
    expect(code(() => parseAmount('1' + '0'.repeat(39), 0))).toBe('AMOUNT');
  });
  it('formats', () => {
    expect(formatAmount(1_500_000n, 6)).toBe('1.5');
    expect(formatAmount(1n, 6)).toBe('0.000001');
    expect(formatAmount(0n, 6)).toBe('0');
    expect(formatAmount(7n, 0)).toBe('7');
    expect(formatAmount(10_000_000n, 6)).toBe('10');
    expect(code(() => formatAmount(-1n, 6))).toBe('AMOUNT');
    expect(code(() => formatAmount(1n << 128n, 6))).toBe('AMOUNT');
    expect(code(() => formatAmount(1n, 40))).toBe('AMOUNT');
  });
  it('round-trips', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: (1n << 128n) - 1n }), fc.integer({ min: 0, max: 18 }), (a, d) => {
        const s = formatAmount(a, d);
        expect(parseAmount(s, d, { allowZero: true })).toBe(a);
      }),
    );
  });
  it('fractionDigits and asset', () => {
    expect(fractionDigits('1')).toBe(0);
    expect(fractionDigits('1.234')).toBe(3);
    expect(validateAsset('USDC')).toBe('USDC');
    for (const a of ['usdc', 'U', 'USDC ', '1ABC', 'ABCDEFGHIJKLM', 5])
      expect(code(() => validateAsset(a))).toBe('PARAM');
  });
});

describe('text', () => {
  const v = (s: unknown, max = 10) => validateText(s, max, 'TEXT', 'm');
  it('accepts plain text including emoji and counts code points', () => {
    expect(v('Coffee ☕')).toBe('Coffee ☕');
    expect(v('😀'.repeat(10))).toBeTruthy();
    expect(code(() => v('😀'.repeat(11)))).toBe('TEXT');
  });
  it('rejects spoofing and malformed text', () => {
    const bad = [
      '',
      ' a',
      'a ',
      'a\nb',
      'a‮b',
      'a​b',
      'a\u0000b',
      '\uD800',
      'a\uDC00',
      'é',
      'ab',
      'a b',
      'x'.repeat(21),
      5,
      null,
    ];
    for (const s of bad)
      expect(
        code(() => v(s)),
        JSON.stringify(s),
      ).toBe('TEXT');
  });
});

describe('target', () => {
  it('lowercases and validates', () => {
    expect(validateMetaAddress(META_A.toUpperCase().replace('ST:ETH:0X', 'st:eth:0x'))).toBe(META_A);
    for (const s of [
      '',
      META_A + '0',
      META_A.slice(0, -1),
      'st:eth:0x' + 'g'.repeat(132),
      'st:btc:0x' + 'a'.repeat(132),
      7,
    ]) {
      expect(code(() => validateMetaAddress(s))).toBe('TARGET');
    }
  });
  it('fingerprints', () => {
    expect(fingerprint(META_A)).toBe('02abababab'.slice(0, 8) + '…' + META_A.slice(-8));
  });
});
