import { describe, expect, it } from 'vitest';
import { BillingError } from './errors.js';
import { formatDecimal, MAX_AMOUNT, parseDecimal } from './money.js';

describe('decimal uint256 round-trip', () => {
  it.each([0, 6, 18, 36])('round-trips uint256 amounts at %i decimals', (decimals) => {
    for (const amount of [0n, 1n, 10n ** 41n, MAX_AMOUNT]) {
      expect(parseDecimal(formatDecimal(amount, decimals), decimals)).toBe(amount);
    }
  });

  it.each([0, 6, 18, 36])('still rejects uint256 overflow at %i decimals', (decimals) => {
    expect(() => parseDecimal(formatDecimal(MAX_AMOUNT + 1n, decimals), decimals)).toThrow(BillingError);
  });

  it('preserves syntax and precision bounds', () => {
    expect(() => parseDecimal('1.001', 2)).toThrow(BillingError);
    expect(() => parseDecimal('1e2', 6)).toThrow(BillingError);
    expect(() => parseDecimal('01', 0)).toThrow(BillingError);
    expect(() => parseDecimal('-1', 0)).toThrow(BillingError);
    expect(() => parseDecimal('9'.repeat(79), 0)).toThrow(BillingError);
    expect(() => parseDecimal('1', 37)).toThrow(BillingError);
  });
});
