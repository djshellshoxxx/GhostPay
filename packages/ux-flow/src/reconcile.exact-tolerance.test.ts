import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import { classifyAmount } from './reconcile.js';

describe('exact-payment tolerance validation', () => {
  const invalid = [
    { absolute: -1n, bps: 0 },
    { absolute: 0n, bps: 10001 },
    { absolute: 0n, bps: 1.5 },
    { absolute: 0n, bps: -1 },
    { absolute: 0n, bps: Number.NaN },
  ];

  for (const [index, tol] of invalid.entries()) {
    it(`rejects invalid tolerance ${index} for exact and non-exact amounts`, () => {
      for (const paid of [999n, 1000n, 1001n]) {
        expect(() => classifyAmount(1000n, paid, tol)).toThrow(FlowError);
        expect(() => classifyAmount(1000n, paid, tol)).toThrow('BAD_TOLERANCE');
      }
    });
  }

  it('preserves valid exact amounts and inclusive tolerance boundaries', () => {
    const tol = { absolute: 5n, bps: 100 };
    expect(classifyAmount(1000n, 1000n)).toBe('exact');
    expect(classifyAmount(1000n, 1000n, { absolute: 0n, bps: 10000 })).toBe('exact');
    expect(classifyAmount(1000n, 990n, tol)).toBe('tolerated');
    expect(classifyAmount(1000n, 1010n, tol)).toBe('tolerated');
    expect(classifyAmount(1000n, 989n, tol)).toBe('partial');
    expect(classifyAmount(1000n, 1011n, tol)).toBe('over');
    expect(classifyAmount(10n ** 30n, 10n ** 30n)).toBe('exact');
    expect(() => classifyAmount(0n, 0n, { absolute: -1n, bps: 0 })).toThrow('BAD_AMOUNT');
  });
});
