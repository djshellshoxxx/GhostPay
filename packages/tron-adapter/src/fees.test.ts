import { describe, expect, it } from 'vitest';
import { TYPICAL_TRC20_ENERGY, estimateBandwidthBytes, estimateBurn, parseChainParameters, suggestFeeLimit } from './fees.js';

const params = { energyFeeSun: 420n, bandwidthFeeSun: 1000n };
describe('fees', () => {
  it('parses chain parameters and fails closed', () => {
    const ok = { chainParameter: [{ key: 'getEnergyFee', value: 420 }, { key: 'getTransactionFee', value: 1000 }, { key: 'x' }] };
    expect(parseChainParameters(ok)).toEqual(params);
    for (const bad of [null, {}, { chainParameter: [{ key: 'getEnergyFee', value: 420 }] }, { chainParameter: [{ key: 'getEnergyFee', value: 0 }, { key: 'getTransactionFee', value: 1 }] }, { chainParameter: [{ key: 'getEnergyFee', value: '420' }, { key: 'getTransactionFee', value: 1 }] }]) {
      expect(() => parseChainParameters(bad)).toThrow();
    }
  });
  it('burn is only the shortfall', () => {
    const b = estimateBandwidthBytes(300);
    expect(b).toBe(432n);
    expect(estimateBurn({ params, energy: 65_000n, bandwidthBytes: b })).toEqual({ energySun: 27_300_000n, bandwidthSun: 432_000n, totalSun: 27_732_000n });
    expect(estimateBurn({ params, energy: 65_000n, bandwidthBytes: b, availableEnergy: 100_000n, availableBandwidth: 500n }).totalSun).toBe(0n);
    expect(estimateBurn({ params, energy: 10n, bandwidthBytes: 0n, availableEnergy: 4n }).totalSun).toBe(2520n);
    expect(() => estimateBurn({ params, energy: -1n, bandwidthBytes: 0n })).toThrow();
    expect(TYPICAL_TRC20_ENERGY.freshHolder).toBeGreaterThan(TYPICAL_TRC20_ENERGY.existingHolder);
  });
  it('fee limit rounds up with margin', () => {
    expect(suggestFeeLimit(params, 100n)).toBe(50_400n);
    expect(suggestFeeLimit(params, 1n, 0n)).toBe(420n);
    expect(() => suggestFeeLimit(params, 0n)).toThrow();
    expect(() => suggestFeeLimit(params, 1n, -1n)).toThrow();
  });
});
