import { describe, expect, it } from 'vitest';
import { fromFiatMinor, toFiatMinor } from './convert.js';
import type { ParsedRate } from './types.js';

const cap = 10n ** 78n;
const rate: ParsedRate = {
  num: 2n, scale: 0, asset: 'TEST', fiat: 'USD', timestampMs: 1, source: 'fixture',
};
const unit: ParsedRate = { ...rate, num: 1n };
const half: ParsedRate = { ...rate, num: 5n, scale: 1 };

describe('fiat conversion output magnitude', () => {
  it.each([cap / 2n, -(cap / 2n), cap - 1n])('rejects overflowing output for %s', (amount) => {
    expect(toFiatMinor(amount, 0, rate, 0, 'trunc')).toMatchObject({
      ok: false, error: { code: 'overflow' },
    });
  });

  it('preserves exact results at the supported boundary', () => {
    expect(toFiatMinor(cap - 1n, 0, unit, 0, 'trunc')).toEqual({ ok: true, value: cap - 1n });
    expect(toFiatMinor(1n - cap, 0, unit, 0, 'trunc')).toEqual({ ok: true, value: 1n - cap });
    expect(toFiatMinor(cap / 2n - 1n, 0, rate, 0, 'trunc')).toEqual({ ok: true, value: cap - 2n });
  });

  it('preserves zero, ordinary conversion and signed rounding', () => {
    expect(toFiatMinor(0n, 0, rate, 0, 'trunc')).toEqual({ ok: true, value: 0n });
    expect(toFiatMinor(10n, 0, rate, 0, 'trunc')).toEqual({ ok: true, value: 20n });
    expect(toFiatMinor(3n, 0, half, 0, 'ceil')).toEqual({ ok: true, value: 2n });
    expect(toFiatMinor(-3n, 0, half, 0, 'floor')).toEqual({ ok: true, value: -2n });
  });

  it('retains input magnitude and reverse conversion checks', () => {
    expect(toFiatMinor(cap, 0, rate, 0, 'trunc')).toMatchObject({ ok: false, error: { code: 'overflow' } });
    expect(fromFiatMinor(20n, 0, rate, 0, 'trunc')).toEqual({ ok: true, value: 10n });
    expect(fromFiatMinor(cap, 0, rate, 0, 'trunc')).toMatchObject({ ok: false, error: { code: 'overflow' } });
  });
});
