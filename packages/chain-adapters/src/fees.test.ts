import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FEE_SCHEDULE, MAX_ROUTER_GROSS, assertSponsorFeeAcceptable, calculateBuffer, grossForNet, routerFee,
  routerNet, routerSplit, sponsorFee, validateFlatSecurityFee,
} from './fees.js';
import { ChainAdapterError } from './errors.js';
import { MAX_UINT256 } from './types.js';

const contractSrc = readFileSync(fileURLToPath(new URL('../../contracts/src/GhostPayRouter.sol', import.meta.url)), 'utf8');

describe('FEE_SCHEDULE parity with contract source', () => {
  it('FEE_BPS and BPS equal the Solidity constants', () => {
    expect(/FEE_BPS\s*=\s*(\d+);/.exec(contractSrc)?.[1]).toBe(FEE_SCHEDULE.ROUTER_FEE_BPS.toString());
    expect(/uint256 public constant BPS\s*=\s*([\d_]+);/.exec(contractSrc)?.[1]?.replaceAll('_', '')).toBe(FEE_SCHEDULE.BPS.toString());
  });
  it('contains no wallet address as fee recipient', () => {
    expect(Object.values(FEE_SCHEDULE).map(String).join(' ')).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
});

// Vectors identical to packages/contracts/test/GhostPayRouter.t.sol and Base.t.sol (GROSS = 1_000_000_000).
describe('routerFee boundary vectors (from contracts tests)', () => {
  it.each([
    [1n, 0n], [399n, 0n], [400n, 1n], [799n, 1n], [800n, 2n], [10_000n, 25n],
    [1_000_000_000n, 2_500_000n], [12_345n * 10n ** 18n, (12_345n * 10n ** 18n * 25n) / 10_000n],
  ])('gross %s -> fee %s', (gross, fee) => {
    expect(routerFee(gross)).toBe(fee);
    expect(routerNet(gross)).toBe(gross - fee);
    expect(routerSplit(gross)).toEqual({ gross, fee, net: gross - fee });
  });
  it('dust 399 delivers fully; 400 delivers 399', () => {
    expect(routerNet(399n)).toBe(399n);
    expect(routerNet(400n)).toBe(399n);
  });
  it('overflow boundary mirrors the contract panic at gross > max/25', () => {
    expect(routerFee(MAX_ROUTER_GROSS)).toBeGreaterThan(0n);
    expect(() => routerFee(MAX_ROUTER_GROSS + 1n)).toThrow(ChainAdapterError);
    expect(() => routerFee(MAX_UINT256)).toThrow(ChainAdapterError);
  });
  it('rejects zero net/split and negative values', () => {
    expect(() => routerNet(0n)).toThrow(/positive/);
    expect(() => routerFee(-1n)).toThrow(ChainAdapterError);
    expect(routerFee(0n)).toBe(0n);
  });
  it('properties: fee+net=gross, floor bound, fee<gross', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: MAX_ROUTER_GROSS }), (g) => {
        const { fee, net } = routerSplit(g);
        expect(fee + net).toBe(g);
        expect(fee * 10_000n <= g * 25n).toBe(true);
        expect(g * 25n < (fee + 1n) * 10_000n).toBe(true);
        expect(fee < g && net >= 1n).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe('grossForNet', () => {
  it('is minimal and sufficient', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 30n }), (net) => {
        const g = grossForNet(net);
        expect(routerNet(g) >= net).toBe(true);
        expect(g === 1n || routerNet(g - 1n) < net).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
  it('small values', () => {
    expect(grossForNet(1n)).toBe(1n);
    expect(grossForNet(399n)).toBe(399n);
    expect(grossForNet(400n)).toBe(401n);
  });
  it('rejects zero and too large', () => {
    expect(() => grossForNet(0n)).toThrow(ChainAdapterError);
    expect(() => grossForNet(MAX_UINT256)).toThrow(ChainAdapterError);
    expect(() => grossForNet(MAX_ROUTER_GROSS)).toThrow(ChainAdapterError);
  });
});

describe('calculateBuffer', () => {
  it('matches the roadmap formula with ceil rounding', () => {
    expect(calculateBuffer({ estimatedSweepGas: 100_000n, maxFeePerGas: 1_000_000_000n, safetyBps: 2_000n })).toBe(120_000_000_000_000n);
    // 1*1*(10_001)/10_000 = 1.0001 -> 2 (rounds up)
    expect(calculateBuffer({ estimatedSweepGas: 1n, maxFeePerGas: 1n, safetyBps: 1n })).toBe(2n);
    expect(calculateBuffer({ estimatedSweepGas: 3n, maxFeePerGas: 3n, safetyBps: 0n })).toBe(9n);
  });
  it('property: >= base and < base*(1+s)+1', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 7n }), fc.bigInt({ min: 1n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 50_000n }), (g, f, s) => {
        const b = calculateBuffer({ estimatedSweepGas: g, maxFeePerGas: f, safetyBps: s });
        expect(b >= g * f).toBe(true);
        expect((b - 1n) * 10_000n < g * f * (10_000n + s)).toBe(true);
      }),
    );
  });
  it('rejects bad input', () => {
    const ok = { estimatedSweepGas: 1n, maxFeePerGas: 1n, safetyBps: 0n };
    expect(() => calculateBuffer({ ...ok, estimatedSweepGas: 0n })).toThrow(ChainAdapterError);
    expect(() => calculateBuffer({ ...ok, maxFeePerGas: 0n })).toThrow(ChainAdapterError);
    expect(() => calculateBuffer({ ...ok, safetyBps: -1n })).toThrow(ChainAdapterError);
    expect(() => calculateBuffer({ ...ok, safetyBps: 100_001n })).toThrow(ChainAdapterError);
    expect(() => calculateBuffer({ estimatedSweepGas: MAX_UINT256, maxFeePerGas: 2n, safetyBps: 0n })).toThrow(/overflows/);
  });
});

describe('sponsorFee', () => {
  it('uses the 50 bps floor when gas is small (rounded up)', () => {
    expect(sponsorFee(1_000_000n, 1n)).toEqual({ fee: 5_000n, net: 995_000n, capped: false });
    expect(sponsorFee(1_001n, 0n).fee).toBe(6n); // ceil(5.005)
  });
  it('uses 110 % of gas when larger (rounded up)', () => {
    expect(sponsorFee(1_000_000n, 10_000n).fee).toBe(11_000n);
    expect(sponsorFee(1_000_000n, 10_001n).fee).toBe(11_002n); // ceil(11001.1)
  });
  it('caps at 300 bps (rounded down)', () => {
    expect(sponsorFee(1_000_000n, 1_000_000n)).toEqual({ fee: 30_000n, net: 970_000n, capped: true });
    expect(sponsorFee(1_001n, 10_000n).fee).toBe(30n); // floor(30.03)
  });
  it('tiny amounts: cap can reduce the fee to zero but fee < amount', () => {
    expect(sponsorFee(1n, 5n)).toEqual({ fee: 0n, net: 1n, capped: true });
  });
  it('property: 0 <= fee < amount and fee <= 3 %', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 30n }), fc.bigInt({ min: 0n, max: 10n ** 30n }), (a, g) => {
        const q = sponsorFee(a, g);
        expect(q.fee >= 0n && q.fee < a).toBe(true);
        expect(q.fee * 10_000n <= a * 300n).toBe(true);
        expect(q.fee + q.net).toBe(a);
        assertSponsorFeeAcceptable(a, q.fee);
      }),
    );
  });
  it('rejects bad input', () => {
    expect(() => sponsorFee(0n, 0n)).toThrow(ChainAdapterError);
    expect(() => sponsorFee(1n, -1n)).toThrow(ChainAdapterError);
  });
  it('client check refuses fee >= amount and above cap', () => {
    expect(() => assertSponsorFeeAcceptable(1_000n, 1_000n)).toThrow(/below amount/);
    expect(() => assertSponsorFeeAcceptable(1_000n, 31n)).toThrow(/cap/);
    expect(() => assertSponsorFeeAcceptable(1_000n, 30n)).not.toThrow();
  });
});

describe('flat security fee config', () => {
  const ok = { feeToken: '0x00000000000000000000000000000000000000aa' as const, amount: 3_000_000n, usdTarget: '3.00' };
  it('accepts a valid config', () => {
    expect(validateFlatSecurityFee(ok)).toBe(ok);
  });
  it.each([
    [{ ...ok, feeToken: '0x0000000000000000000000000000000000000000' as const }],
    [{ ...ok, feeToken: '0x12' as const }],
    [{ ...ok, amount: 0n }],
    [{ ...ok, amount: -1n }],
    [{ ...ok, usdTarget: '3' }],
  ])('rejects %#', (bad) => {
    expect(() => validateFlatSecurityFee(bad)).toThrow(ChainAdapterError);
  });
});
