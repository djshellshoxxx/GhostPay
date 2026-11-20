import { describe, expect, it } from 'vitest';
import { formatAtomic, parseDecimal, PaymentUriError, toAtomic } from './index.js';

function expectInvalidScale(scale: unknown): void {
  try {
    parseDecimal('1.25', scale as number, 10n ** 77n);
    expect.fail('Expected typed INVALID_AMOUNT for unsupported precision');
  } catch (e) {
    expect(e).toBeInstanceOf(PaymentUriError);
    expect((e as PaymentUriError).code).toBe('INVALID_AMOUNT');
  }
}

describe('parseDecimal precision-option error contract (QA-03)', () => {
  it('rejects fractional precision before bigint conversion', () => {
    for (const scale of [0.5, 2.5, -0.5]) expectInvalidScale(scale);
  });

  it('rejects NaN and both infinities through the typed channel', () => {
    for (const scale of [NaN, Infinity, -Infinity]) expectInvalidScale(scale);
  });

  it('rejects negative and above-domain integer precision', () => {
    for (const scale of [-1, -10, 78, 100]) expectInvalidScale(scale);
  });

  it('rejects nonnumeric runtime options without coercion', () => {
    for (const scale of ['2', null, undefined, true, {}, []]) expectInvalidScale(scale);
  });

  it('preserves exact zero, two, eight and eighteen place parsing', () => {
    const controls = [
      { amount: '1', scale: 0, units: 1n },
      { amount: '1.25', scale: 2, units: 125n },
      { amount: '0.00000001', scale: 8, units: 1n },
      { amount: '0.000000000000000001', scale: 18, units: 1n },
    ];
    for (const control of controls) {
      const decimal = parseDecimal(control.amount, control.scale, 10n ** 77n);
      expect(decimal.canonical).toBe(control.amount);
      expect(toAtomic(decimal, control.scale)).toBe(control.units);
      expect(formatAtomic(control.units, control.scale)).toBe(control.amount);
    }
  });

  it('preserves decimal roundtrips throughout the shared supported precision domain (0–77)', () => {
    for (let scale = 0; scale <= 77; scale++) {
      const input = scale === 0 ? '1' : scale === 1 ? '1.2' : '1.25';
      const value = parseDecimal(input, scale, 2n * 10n ** 77n);
      const units = toAtomic(value, scale);
      expect(formatAtomic(units, scale)).toBe(input);
    }
  });

  it('accepts the shared 77-digit precision upper boundary', () => {
    const decimal = parseDecimal('1', 77, 10n ** 77n);
    expect(decimal.canonical).toBe('1');
    expect(toAtomic(decimal, 77)).toBe(10n ** 77n);
  });
});
