import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addAmountNoise, assertSingleAmountMode, isPaid, roundGross } from './amounts.js';
import { bucketGasLimit, assertOnlyAllowedTxFields } from './gas.js';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

const base = { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 100 } as const;

describe('MH-AMT-1 roundGross', () => {
  it('known values', () => {
    expect(roundGross(1_234_567_890_123_456_789n, { ...base, maxSlippageBps: 1000 }).amount).toBe(1_240_000_000_000_000_000n);
    expect(roundGross(1_000_000_000_000_000_001n, { ...base, maxSlippageBps: 1000 }).amount).toBe(1_010_000_000_000_000_000n);
    expect(roundGross(999n, { ...base, sigFigs: 2, maxSlippageBps: 1000 }).amount).toBe(1000n);
    expect(roundGross(12n, base)).toEqual({ amount: 12n, surplus: 0n, sigFigsUsed: 2 });
    expect(roundGross(100n, { ...base, sigFigs: 1 }).amount).toBe(100n);
  });
  it('fixed_token is never altered', () => {
    expect(roundGross(1_234_567_890n, { ...base, amountPolicyMode: 'fixed_token' })).toEqual({ amount: 1_234_567_890n, surplus: 0n });
  });
  it('property: >= input, < input*(1+10^(1-s)), within slippage, on grid', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 24n }), fc.integer({ min: 1, max: 6 }), (amt, s) => {
        const r = roundGross(amt, { ...base, sigFigs: s, maxSlippageBps: 10_000 });
        const p = 10n ** BigInt(s - 1);
        return r.amount >= amt && r.amount * p < amt * (p + 1n) && r.surplus === r.amount - amt;
      }),
    );
  });
  it('1000 quotes land on the 3-sig-fig grid when slippage allows', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const b = new Uint8Array(8);
      rng.getRandomValues(b);
      const amt = (new DataView(b.buffer).getBigUint64(0) % 10n ** 21n) + 1000n;
      const r = roundGross(amt, { ...base, maxSlippageBps: 10_000 });
      const digits = amt.toString().length;
      const step = 10n ** BigInt(Math.max(0, digits - 3));
      expect(r.amount % step).toBe(0n);
      expect(r.amount).toBeGreaterThanOrEqual(amt);
    }
  });
  it('respects maxSlippageBps by using a finer grid', () => {
    // 1_000_001 at 3 sig figs would add 9_999 (~1.0 %): too much for 5 bps.
    const r = roundGross(1_000_001n, { ...base, maxSlippageBps: 5 });
    expect(r.surplus * 10_000n).toBeLessThanOrEqual(1_000_001n * 5n);
    expect(r.amount).toBeGreaterThanOrEqual(1_000_001n);
    expect(r.amount).toBe(1_000_100n); // 5 sig figs? 1_000_001 -> step 100 gives surplus 99 (<=500)
  });
  it('validates input', () => {
    expect(() => roundGross(0n, base)).toThrow(MetadataHardeningError);
    expect(() => roundGross(5n, { ...base, sigFigs: 0 })).toThrow(MetadataHardeningError);
    expect(() => roundGross(5n, { ...base, sigFigs: 19 })).toThrow(MetadataHardeningError);
    expect(() => roundGross(5n, { ...base, maxSlippageBps: 10_001 })).toThrow(MetadataHardeningError);
    expect(() => roundGross(5n, { ...base, chainId: 1 })).toThrowError(/testnet/);
  });
});

describe('MH-AMT-2 noise', () => {
  it('stays within bound over 1000 runs and sometimes overpays', () => {
    const rng = seededRng(99);
    const amt = 10n ** 18n;
    let nonzero = 0;
    for (let i = 0; i < 1000; i++) {
      const r = addAmountNoise(amt, { chainId: 84532, maxBps: 100 }, rng);
      expect(r.surplus).toBeGreaterThanOrEqual(0n);
      expect(r.surplus).toBeLessThanOrEqual(amt / 100n);
      expect(r.amount).toBe(amt + r.surplus);
      if (r.surplus > 0n) nonzero++;
    }
    expect(nonzero).toBeGreaterThan(900);
  });
  it('maxBps 0 means no noise; tiny amounts get none', () => {
    expect(addAmountNoise(1000n, { chainId: 31337, maxBps: 0 }).surplus).toBe(0n);
    expect(addAmountNoise(5n, { chainId: 31337, maxBps: 100 }).surplus).toBe(0n);
  });
  it('rejects > 1 %, bad amounts, mainnet', () => {
    expect(() => addAmountNoise(1000n, { chainId: 31337, maxBps: 101 })).toThrow(MetadataHardeningError);
    expect(() => addAmountNoise(0n, { chainId: 31337, maxBps: 1 })).toThrow(MetadataHardeningError);
    expect(() => addAmountNoise(1000n, { chainId: 10, maxBps: 1 })).toThrow(MetadataHardeningError);
  });
  it('isPaid accepts overpay, rejects underpay; modes conflict', () => {
    expect(isPaid(1010n, 1000n)).toBe(true);
    expect(isPaid(999n, 1000n)).toBe(false);
    expect(() => isPaid(-1n, 1n)).toThrow(MetadataHardeningError);
    expect(() => assertSingleAmountMode({ rounding: true, noise: true })).toThrow(MetadataHardeningError);
    expect(() => assertSingleAmountMode({ rounding: true, noise: false })).not.toThrow();
  });
});

describe('MH-WAL gas buckets', () => {
  const c = { chainId: 11155111 };
  it('rounds up to the grid', () => {
    expect(bucketGasLimit(21_000n, c)).toBe(30_000n);
    expect(bucketGasLimit(30_000n, c)).toBe(30_000n);
    expect(bucketGasLimit(30_001n, c)).toBe(40_000n);
    expect(bucketGasLimit(100_000n, { ...c, headroomBps: 2000 })).toBe(120_000n);
    expect(bucketGasLimit(100_001n, { ...c, headroomBps: 2000, bucket: 1n })).toBe(120_002n);
  });
  it('property: >= estimate, multiple of bucket, monotone', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 30_000_000n }), fc.bigInt({ min: 0n, max: 1000n }), (e, d) => {
        const a = bucketGasLimit(e, c);
        const b = bucketGasLimit(e + d, c);
        return a >= e && a % 10_000n === 0n && b >= a;
      }),
    );
  });
  it('validates', () => {
    expect(() => bucketGasLimit(0n, c)).toThrow(MetadataHardeningError);
    expect(() => bucketGasLimit(1n, { ...c, bucket: 0n })).toThrow(MetadataHardeningError);
    expect(() => bucketGasLimit(1n, { ...c, headroomBps: -1 })).toThrow(MetadataHardeningError);
    expect(() => bucketGasLimit(1n, { chainId: 1 })).toThrow(MetadataHardeningError);
  });
  it('tx field allowlist', () => {
    expect(() => assertOnlyAllowedTxFields({ from: 'a', to: 'b', data: '0x', value: 0n, chainId: 1, gas: 1n })).not.toThrow();
    expect(() => assertOnlyAllowedTxFields({ from: 'a', maxPriorityFeePerGas: 1n })).toThrowError(/maxPriorityFeePerGas/);
    expect(() => assertOnlyAllowedTxFields({ nonce: 1 })).toThrow(MetadataHardeningError);
  });
});
