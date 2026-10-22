import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from './errors.js';
import { btcStringToSats, MAX_MONEY_SATS, SATS_PER_BTC, satsToBtcString } from './units.js';

describe('sats <-> BTC decimal strings', () => {
  it.each([
    [0n, '0'],
    [1n, '0.00000001'],
    [10n, '0.0000001'],
    [100_000n, '0.001'],
    [150_000_000n, '1.5'],
    [SATS_PER_BTC, '1'],
    [123_456_789n, '1.23456789'],
    [MAX_MONEY_SATS, '21000000'],
  ])('formats %s sats as %s and parses it back', (sats, text) => {
    expect(satsToBtcString(sats)).toBe(text);
    expect(btcStringToSats(text)).toBe(sats);
  });

  it('parses non-canonical but strict forms', () => {
    expect(btcStringToSats('1.50')).toBe(150_000_000n);
    expect(btcStringToSats('0.10000000')).toBe(10_000_000n);
    expect(btcStringToSats('0')).toBe(0n);
  });

  it.each([
    '',
    ' 1',
    '1 ',
    '+1',
    '-1',
    '1e3',
    '1E-8',
    '.5',
    '1.',
    '01',
    '00.5',
    '1,5',
    '1_000',
    '0x10',
    'NaN',
    'Infinity',
    '1.123456789',
    '21000000.00000001',
    '99999999999999999',
    '１',
    '1..2',
    '1.2.3',
  ])('rejects %j', (bad) => {
    expect(() => btcStringToSats(bad)).toThrow(SilentPaymentError);
  });

  it('rejects non-string and out-of-range amounts', () => {
    expect(() => btcStringToSats(1 as unknown as string)).toThrow(SilentPaymentError);
    expect(() => satsToBtcString(-1n)).toThrow(SilentPaymentError);
    expect(() => satsToBtcString(MAX_MONEY_SATS + 1n)).toThrow(SilentPaymentError);
    expect(() => satsToBtcString(1 as unknown as bigint)).toThrow(SilentPaymentError);
  });

  it('property: sats -> string -> sats is the identity over the whole valid range', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX_MONEY_SATS }), (sats) => {
        const s = satsToBtcString(sats);
        expect(btcStringToSats(s)).toBe(sats);
        expect(s).toMatch(/^(0|[1-9][0-9]*)(\.[0-9]{0,7}[1-9])?$/); // canonical: no trailing zeros
      }),
      { numRuns: 500 },
    );
  });

  it('property: string -> sats -> string is canonical and never changes the value', () => {
    const digits = fc.stringMatching(/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,8})?$/);
    fc.assert(
      fc.property(digits, (text) => {
        const sats = btcStringToSats(text);
        expect(btcStringToSats(satsToBtcString(sats))).toBe(sats);
        // exact decimal comparison without floating point
        const [w = '0', f = ''] = text.split('.');
        expect(sats).toBe(BigInt(w) * SATS_PER_BTC + BigInt(f.padEnd(8, '0')));
      }),
      { numRuns: 500 },
    );
  });

  it('is monotonic and has no floating point rounding error on classic problem values', () => {
    expect(btcStringToSats('0.1') + btcStringToSats('0.2')).toBe(btcStringToSats('0.3'));
    expect(btcStringToSats('0.29')).toBe(29_000_000n);
    expect(btcStringToSats('4.35')).toBe(435_000_000n);
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX_MONEY_SATS - 1n }), (a) => {
        expect(satsToBtcString(a + 1n) === satsToBtcString(a)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
