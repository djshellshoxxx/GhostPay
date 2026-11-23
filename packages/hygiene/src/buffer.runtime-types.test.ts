import { describe, expect, it } from 'vitest';
import { bufferDust } from './buffer.js';
import { HygieneError } from './errors.js';

describe('bufferDust runtime amount types', () => {
  const invalid: Array<[string, unknown, unknown, unknown]> = [
    ['numeric paid', 10, 2n, 3n],
    ['string paid', '10', 2n, 3n],
    ['boolean paid', false, 2n, 3n],
    ['NaN paid', Number.NaN, 2n, 3n],
    ['Infinity paid', Number.POSITIVE_INFINITY, 2n, 3n],
    ['null paid', null, 2n, 3n],
    ['undefined paid', undefined, 2n, 3n],
    ['numeric gas used', 12n, 2, 1n],
    ['undefined gas used', 12n, undefined, 1n],
    ['numeric gas price', 12n, 2n, 1],
    ['string gas price', 12n, 2n, '1'],
    ['array gas price', 12n, 2n, [1]],
  ];

  it.each(invalid)('rejects %s with existing typed INVALID_INPUT', (_case, paid, used, price) => {
    const invoke = () => bufferDust(paid as bigint, used as bigint, price as bigint);
    expect(invoke).toThrow(HygieneError);
    expect(invoke).toThrow(/INVALID_INPUT/);
  });

  it('preserves non-negative bigint calculation and saturates at zero', () => {
    expect(bufferDust(10n, 2n, 3n)).toBe(4n);
    expect(bufferDust(6n, 2n, 3n)).toBe(0n);
    expect(bufferDust(5n, 2n, 3n)).toBe(0n);
    expect(bufferDust(0n, 0n, 0n)).toBe(0n);
    expect(bufferDust(1_000_000_000_000_000_000n, 10n, 1_000_000_000_000_000n))
      .toBe(990_000_000_000_000_000n);
  });

  it('preserves existing typed errors for negative bigint amounts', () => {
    const negatives: ReadonlyArray<readonly [bigint, bigint, bigint]> = [
      [-1n, 0n, 0n],
      [0n, -1n, 0n],
      [0n, 0n, -1n],
    ];
    for (const [paid, used, price] of negatives) {
      expect(() => bufferDust(paid, used, price)).toThrow(HygieneError);
      expect(() => bufferDust(paid, used, price)).toThrow(/INVALID_INPUT/);
    }
  });
});
