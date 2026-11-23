import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT, parseUnits } from './amount.js';
import { ExportError } from './errors.js';

describe('parseUnits runtime input types', () => {
  it.each([
    ['number', 7],
    ['bigint', 1n],
    ['string array', ['1']],
    ['boxed string', new String('1')],
    ['null', null],
    ['undefined', undefined],
    ['boolean', false],
    ['object with numeric string coercion', { toString: () => '1' }],
    ['symbol', Symbol('1')],
  ])('rejects %s with INVALID_AMOUNT rather than coercing or throwing a native error', (_label, value) => {
    expect(() => parseUnits(value as never, 2)).toThrow(ExportError);
    try {
      parseUnits(value as never, 2);
      throw new Error('invalid value was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ExportError);
      expect((error as ExportError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('preserves canonical string inputs and rejects noncanonical strings', () => {
    expect(parseUnits('1', 2)).toBe(100n);
    expect(parseUnits('1.5', 2)).toBe(150n);
    expect(parseUnits('0', 0)).toBe(0n);
    expect(parseUnits(MAX_AMOUNT.toString(), 0)).toBe(MAX_AMOUNT);
    for (const bad of [' 1', '+1', '01', '1e2', '1.001', '1'.repeat(121)]) {
      expect(() => parseUnits(bad, 2)).toThrow(ExportError);
    }
  });
});
