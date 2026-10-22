import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  err,
  formatUnits,
  isAddress,
  isBytes32,
  isHexData,
  isHexQuantity,
  isRecord,
  ok,
  quantityToBigInt,
  validateSignature,
} from './hex.js';

import { R, S, SIG } from './fixtures.testutil.js';

describe('hex validators', () => {
  it('basic predicates', () => {
    expect(isHexData('0x')).toBe(true);
    expect(isHexData('0xabc')).toBe(false);
    expect(isHexData(5)).toBe(false);
    expect(isAddress('0x' + 'a'.repeat(40))).toBe(true);
    expect(isAddress('0x' + 'a'.repeat(39))).toBe(false);
    expect(isBytes32('0x' + '0'.repeat(64))).toBe(true);
    expect(isBytes32('0x00')).toBe(false);
    expect(isHexQuantity('0x0')).toBe(true);
    expect(isHexQuantity('0x01')).toBe(false);
    expect(isHexQuantity('0x')).toBe(false);
    expect(quantityToBigInt('0x10')).toBe(16n);
    expect(quantityToBigInt('16')).toBeNull();
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord({})).toBe(true);
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('x')).toEqual({ ok: false, error: 'x' });
  });
  it('validateSignature accepts good and normalises case', () => {
    expect(validateSignature(SIG.toUpperCase().replace('0X', '0x'))).toEqual({ ok: true, value: SIG });
    expect(validateSignature(`0x${R}${S}00`).ok).toBe(true);
  });
  it('validateSignature rejects key-like, zero, high-s, bad v', () => {
    expect(validateSignature('0x' + '11'.repeat(32)).ok).toBe(false); // 32-byte secret
    expect(validateSignature(undefined).ok).toBe(false);
    expect(validateSignature(`0x${'00'.repeat(32)}${S}1b`)).toEqual({ ok: false, error: 'r out of range' });
    expect(validateSignature(`0x${R}${'00'.repeat(32)}1b`)).toEqual({ ok: false, error: 's out of range' });
    expect(validateSignature(`0x${'ff'.repeat(32)}${S}1b`).ok).toBe(false);
    expect(validateSignature(`0x${R}${'ff'.repeat(32)}1b`)).toEqual({ ok: false, error: 's out of range' });
    expect(validateSignature(`0x${R}${'7f' + 'ff'.repeat(31)}1b`)).toEqual({
      ok: false,
      error: 's is not in the lower half (malleable)',
    });
    expect(validateSignature(`0x${R}${S}1d`)).toEqual({ ok: false, error: 'invalid v' });
  });
  it('formatUnits exact', () => {
    expect(formatUnits(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001');
    expect(formatUnits(0n, 6)).toBe('0');
    expect(formatUnits(-2_500_000n, 6)).toBe('-2.5');
    expect(formatUnits(7n, 0)).toBe('7');
    expect(() => formatUnits(1n, -1)).toThrow(RangeError);
    expect(() => formatUnits(1n, 1.5)).toThrow(RangeError);
  });
  it('formatUnits round trips', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), fc.integer({ min: 0, max: 24 }), (v, d) => {
        const s = formatUnits(v, d);
        const [w = '0', f = ''] = s.split('.');
        expect(BigInt(w + f.padEnd(d, '0'))).toBe(v);
      }),
    );
  });
});
