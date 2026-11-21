import { describe, expect, it } from 'vitest';
import { addAmountNoise } from './amounts.js';
import { MetadataHardeningError, randomBelow } from './guard.js';
import { seededRng } from './testutil.testutil.js';

/** MH-AMT-2 accepts EVM bigint amounts; its noise draw must not inherit an unrelated uint64 cutoff. */
describe('MH-AMT-2 EVM-sized amount noise', () => {
  it('keeps a 1% random surplus within bounds for amounts whose surplus exceeds uint64', () => {
    const rng = seededRng(0x5eed);
    const amounts = [2_000n * 10n ** 18n, 1n << 200n];
    for (const amount of amounts) {
      const maximum = amount / 100n;
      expect(maximum).toBeGreaterThan(1n << 64n);
      for (let i = 0; i < 8; i++) {
        const result = addAmountNoise(amount, { chainId: 31337, maxBps: 100 }, rng);
        expect(result.surplus).toBeGreaterThanOrEqual(0n);
        expect(result.surplus).toBeLessThanOrEqual(maximum);
        expect(result.amount).toBe(amount + result.surplus);
      }
    }
  });

  it('still refuses random-sampling bounds beyond the supported uint256 domain', () => {
    expect(() => randomBelow((1n << 256n) + 1n, seededRng(1))).toThrow(MetadataHardeningError);
  });
});
