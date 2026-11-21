import { describe, expect, it } from 'vitest';
import { formatCountdown } from './format';

// Exercise the exported JavaScript runtime boundary without weakening its TypeScript signature.
const fromRuntime = (milliseconds: unknown): string => formatCountdown(milliseconds as number);

describe('formatCountdown invalid runtime input (issue #394)', () => {
  it('does not render nonfinite millisecond durations as a plausible countdown', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(formatCountdown(value)).toBe('invalid time');
    }
  });

  it('rejects invalid JavaScript runtime types instead of coercing or throwing', () => {
    for (const value of [undefined, null, '500', false, 0n, Symbol('milliseconds'), {}, [], new Date(0)]) {
      expect(fromRuntime(value)).toBe('invalid time');
    }
  });

  it('does not invoke conversion hooks supplied by an invalid caller', () => {
    let conversions = 0;
    const hostile = {
      [Symbol.toPrimitive](): never {
        conversions += 1;
        throw new Error('unexpected countdown conversion');
      },
    };
    expect(fromRuntime(hostile)).toBe('invalid time');
    expect(conversions).toBe(0);
  });

  it('preserves finite values, including negative clamping and long durations', () => {
    const examples: ReadonlyArray<readonly [number, string]> = [
      [-5, '0:00'],
      [-0.01, '0:00'],
      [0, '0:00'],
      [0.1, '0:01'],
      [500, '0:01'],
      [1000, '0:01'],
      [1000.1, '0:02'],
      [61_000, '1:01'],
      [3_661_000, '1:01:01'],
      [86_400_000, '24:00:00'],
      [Number.MAX_SAFE_INTEGER, '2501999792:59:01'],
    ];
    for (const [milliseconds, expected] of examples) {
      expect(formatCountdown(milliseconds)).toBe(expected);
    }
  });
});
