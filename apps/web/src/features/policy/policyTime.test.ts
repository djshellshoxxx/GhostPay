import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatPolicyTimestamp } from './policyTime';

const MAX = 8_640_000_000_000n;

describe('policy timestamp rendering', () => {
  it('formats normal dates and both exact Date boundaries', () => {
    expect(formatPolicyTimestamp(0n)).toBe('1970-01-01T00:00:00.000Z');
    expect(formatPolicyTimestamp(MAX)).toBe('+275760-09-13T00:00:00.000Z');
    expect(formatPolicyTimestamp(-MAX)).toBe('-271821-04-20T00:00:00.000Z');
  });
  it('preserves arbitrary uint256 timestamps without throwing or losing precision', () => {
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: (1n << 256n) - 1n }), (seconds) => {
      const displayed = formatPolicyTimestamp(seconds);
      if (seconds > MAX) expect(displayed).toBe(`${seconds} s (Unix)`);
      else expect(BigInt(Date.parse(displayed) / 1000)).toBe(seconds);
    }), { seed: 20261116, numRuns: 1000 });
  });
  it('handles values just outside the Date range', () => {
    for (const seconds of [-MAX - 1n, MAX + 1n]) expect(formatPolicyTimestamp(seconds)).toBe(`${seconds} s (Unix)`);
  });
});
