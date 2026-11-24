import { describe, expect, it } from 'vitest';
import { normalizeFeeRate } from './btc.js';
import { MetadataHardeningError } from './guard.js';

const NETWORK = 'regtest';

describe('MH-BTC-2 fee-floor and cap consistency (GP-BUG-12)', () => {
  it('rejects impossible minimum/cap policies instead of returning below the minimum', () => {
    for (const rate of [0.5, 1, 1.1]) {
      expect(() => normalizeFeeRate(NETWORK, rate, { minRate: 1, cap: 0.8 })).toThrowError(
        new MetadataHardeningError('POLICY_REJECTED', 'fee cap is below the minimum rate'),
      );
    }
  });

  it('refuses malformed explicit caps instead of treating them as unlimited', () => {
    for (const cap of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => normalizeFeeRate(NETWORK, 1.5, { minRate: 1, cap })).toThrowError(MetadataHardeningError);
    }
  });

  it('preserves valid round-up and cap fallback without violating either bound', () => {
    expect(normalizeFeeRate(NETWORK, 0.5, { minRate: 1, cap: 1 })).toBe(1);
    expect(normalizeFeeRate(NETWORK, 6, { step: 5, minRate: 5, cap: 8 })).toBe(8);
    expect(normalizeFeeRate(NETWORK, 1.25, { step: 1, minRate: 1, cap: 2 })).toBe(2);
    expect(() => normalizeFeeRate(NETWORK, 9, { step: 5, minRate: 5, cap: 8 })).toThrow(MetadataHardeningError);
  });
});
