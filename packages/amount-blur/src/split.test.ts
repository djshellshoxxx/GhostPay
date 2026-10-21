import fc from 'fast-check';
import { grossForNet, routerFee, routerNet } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { AmountBlurError } from './errors.js';
import { denominationSet } from './grid.js';
import { pickBufferPart, splitPart } from './fees.js';
import { assertDistinctPartKeys, planSplit, remainingAfter, reviewPlan, type PlanOptions } from './split.js';
import { failing, seeded } from './rng.testutil.js';

const base = (o: Partial<PlanOptions> = {}): PlanOptions => ({
  mode: 'split',
  chainId: 84532,
  decimals: 6,
  invoiceNet: 104_370_000n,
  kMin: 2,
  kMax: 5,
  minPartBase: 10_000n,
  gapMinSec: 120,
  gapMaxSec: 900,
  horizonSec: 3600,
  expiresInSec: 86_400,
  roundMaxBps: 100,
  random: seeded(42),
  ...o,
});

function checkPlan(o: PlanOptions): void {
  const p = planSplit(o);
  const k = p.parts.length;
  // AB-S4
  expect(k).toBeGreaterThanOrEqual(o.kMin);
  expect(k).toBeLessThanOrEqual(o.kMax);
  expect(p.extraGasParts).toBe(k - 1);
  let net = 0n;
  let fee = 0n;
  let gross = 0n;
  for (const part of p.parts) {
    // AB-S2
    expect(part.gross >= o.minPartBase && part.gross >= 400n).toBe(true);
    expect(part.fee).toBe(routerFee(part.gross));
    expect(part.net).toBe(routerNet(part.gross));
    expect(part.fee + part.net).toBe(part.gross);
    net += part.net;
    fee += part.fee;
    gross += part.gross;
  }
  expect([p.netTotal, p.feeTotal, p.grossTotal]).toEqual([net, fee, gross]);
  // AB-S1
  expect(net >= o.invoiceNet).toBe(true);
  expect(net - o.invoiceNet <= BigInt(k) + p.snapSlackGross).toBe(true);
  expect(p.overpayNet).toBe(net - o.invoiceNet);
  // AB-S3
  expect(fee <= routerFee(gross)).toBe(true);
  expect(routerFee(gross) - fee <= BigInt(k - 1)).toBe(true);
  // AB-T3 / AB-F1
  const margin = (o.deadlineMarginSec ?? 600) * 1000;
  expect(p.parts[0]!.dueOffsetMs).toBeLessThanOrEqual(o.gapMaxSec * 1000);
  for (let i = 0; i < k; i += 1) {
    const q = p.parts[i]!;
    expect(q.index).toBe(i);
    expect(q.deadlineOffsetMs).toBe(q.dueOffsetMs + margin);
    expect(q.deadlineOffsetMs).toBeLessThanOrEqual(o.expiresInSec * 1000);
    expect(q.dueOffsetMs).toBeLessThanOrEqual(o.horizonSec * 1000);
    if (i > 0) {
      const gap = q.dueOffsetMs - p.parts[i - 1]!.dueOffsetMs;
      expect(gap).toBeGreaterThanOrEqual(o.gapMinSec * 1000);
      expect(gap).toBeLessThanOrEqual(o.gapMaxSec * 1000);
    }
  }
  if (o.mode === 'denom') {
    const D = new Set(denominationSet(o.decimals).stepsBase);
    const rem = p.parts.filter((x) => x.isRemainder);
    expect(rem.length).toBeLessThanOrEqual(1);
    for (const q of p.parts) if (!q.isRemainder) expect(D.has(q.gross)).toBe(true);
  }
}

describe('planSplit free split', () => {
  it('spec example invoice (104.37 USDC): invariants over 300 seeds', () => {
    for (let s = 0; s < 300; s += 1) checkPlan(base({ random: seeded(s) }));
  });
  it('roundMaxBps 0: parts sum to exactly grossForNet(invoiceNet)', () => {
    const p = planSplit(base({ roundMaxBps: 0 }));
    expect(p.grossTotal).toBe(grossForNet(104_370_000n));
    expect(p.snapSlackGross).toBe(0n);
  });
  it('rounded parts stay within cap in total', () => {
    for (let s = 0; s < 100; s += 1) {
      const p = planSplit(base({ random: seeded(s) }));
      expect(p.snapSlackGross <= (grossForNet(104_370_000n) * 100n) / 10_000n).toBe(true);
    }
  });
  it('different seeds give different plans (order/amounts are random)', () => {
    const a = planSplit(base({ random: seeded(1) })).parts.map((x) => x.gross).join();
    const b = planSplit(base({ random: seeded(2) })).parts.map((x) => x.gross).join();
    expect(a).not.toBe(b);
  });
  it('every k in range is reachable; hard max 8', () => {
    const ks = new Set<number>();
    for (let s = 0; s < 200; s += 1) ks.add(planSplit(base({ random: seeded(s), kMin: 2, kMax: 8, horizonSec: 7200, gapMaxSec: 400 })).parts.length);
    expect([...ks].sort()).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(() => planSplit(base({ kMax: 9 }))).toThrow(AmountBlurError);
  });
  it('part order is random: the largest part is not always first', () => {
    const firsts = new Set<number>();
    for (let s = 0; s < 100; s += 1) {
      const p = planSplit(base({ random: seeded(s), kMin: 3, kMax: 3, roundMaxBps: 0 }));
      firsts.add(pickBufferPart(p.parts));
    }
    expect(firsts.size).toBe(3);
  });
  it('property: AB-S1..S3 for random invoice nets and k (18 decimals)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 10n ** 16n * 2n, max: 10n ** 30n }),
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (net, kMax, bps, seed) => {
          checkPlan(base({ decimals: 18, minPartBase: 10n ** 16n, invoiceNet: net, kMin: 2, kMax, roundMaxBps: bps, horizonSec: 7200, gapMaxSec: 450, random: seeded(seed) }));
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
  it('property: tiny invoices near the 400 floor (d=2)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 800n, max: 5000n }), fc.integer({ min: 0, max: 100000 }), (net, seed) => {
        try {
          checkPlan(base({ decimals: 2, minPartBase: 400n, invoiceNet: net, kMin: 2, kMax: 3, roundMaxBps: 0, random: seeded(seed) }));
        } catch (e) {
          if (!(e instanceof AmountBlurError && e.code === 'PART_BELOW_FLOOR')) throw e;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('planSplit denominations (AB-S5)', () => {
  const d = (o: Partial<PlanOptions> = {}) => base({ mode: 'denom', roundMaxBps: 500, ...o });
  it('all parts in D except the marked remainder part, over 200 seeds', () => {
    let sawRemainder = false;
    for (let s = 0; s < 200; s += 1) {
      const p = planSplit(d({ random: seeded(s) }));
      sawRemainder ||= p.parts.some((x) => x.isRemainder);
      checkPlan(d({ random: seeded(s) }));
    }
    expect(sawRemainder).toBe(true);
  });
  it('sub-floor remainder (626 base units of 100 USDC invoice) is absorbed into exactly one marked part', () => {
    const g = grossForNet(100_000_000n);
    expect(g % 10_000n).toBe(626n);
    for (let s = 0; s < 50; s += 1) {
      const p = planSplit(d({ invoiceNet: 100_000_000n, random: seeded(s), roundMaxBps: 100 }));
      expect(p.parts.filter((x) => x.isRemainder)).toHaveLength(1);
      expect(p.grossTotal >= g).toBe(true);
    }
  });
  it('merging path: many greedy parts reduced to k (99.99 USDC)', () => {
    for (let s = 0; s < 50; s += 1) checkPlan(d({ invoiceNet: 99_990_000n, random: seeded(s), kMin: 2, kMax: 3 }));
  });
  it('splitting path: one denomination (1000 units of 1e6 = exactly 1 element) is split to reach k', () => {
    // net chosen so that G is close to 10 USDC; allowed D contains 5,2,1 etc.
    for (let s = 0; s < 50; s += 1) checkPlan(d({ invoiceNet: 9_975_000n, random: seeded(s), roundMaxBps: 500 }));
  });
  it('CAP_EXCEEDED when merges would overshoot a zero cap, or the invoice is astronomically large', () => {
    expect(() => planSplit(d({ invoiceNet: 99_990_000n, roundMaxBps: 0, kMin: 2, kMax: 2 }))).toThrow(expect.objectContaining({ code: 'CAP_EXCEEDED' }));
    expect(() => planSplit(d({ invoiceNet: 10n ** 20n, kMin: 2, kMax: 5 }))).toThrow(expect.objectContaining({ code: 'CAP_EXCEEDED' }));
  });
  it('minPartBase above every denomination in range -> CAP_EXCEEDED (no allowed element)', () => {
    expect(() => planSplit(d({ invoiceNet: 10n ** 20n, minPartBase: 10n ** 20n }))).toThrow(AmountBlurError);
  });
});

describe('planSplit errors (AB-S4, AB-F1, AB-F4)', () => {
  it('rejects mainnet chain ids at the entry point', () => {
    for (const id of [1, 8453, 10, 137, 0, -1]) expect(() => planSplit(base({ chainId: id }))).toThrow(expect.objectContaining({ code: 'CHAIN_NOT_ALLOWED' }));
    for (const id of [31337, 11155111, 84532]) expect(() => planSplit(base({ chainId: id }))).not.toThrow();
  });
  it('minPartBase below 400 is refused (fee-dodge floor)', () => {
    expect(() => planSplit(base({ minPartBase: 399n }))).toThrow(expect.objectContaining({ code: 'PART_BELOW_FLOOR' }));
    expect(() => planSplit(base({ minPartBase: 1n }))).toThrow(expect.objectContaining({ code: 'PART_BELOW_FLOOR' }));
  });
  it('invoice too small to split above the floor', () => {
    expect(() => planSplit(base({ invoiceNet: 500n, decimals: 2, minPartBase: 400n }))).toThrow(expect.objectContaining({ code: 'PART_BELOW_FLOOR' }));
    expect(() => planSplit(base({ invoiceNet: 19_000n }))).toThrow(expect.objectContaining({ code: 'PART_BELOW_FLOOR' }));
  });
  it('HORIZON_TOO_SHORT: horizon, expiry and margin', () => {
    expect(() => planSplit(base({ horizonSec: 60 }))).toThrow(expect.objectContaining({ code: 'HORIZON_TOO_SHORT' }));
    expect(() => planSplit(base({ expiresInSec: 500 }))).toThrow(expect.objectContaining({ code: 'HORIZON_TOO_SHORT' }));
    expect(() => planSplit(base({ expiresInSec: 600 + 100, horizonSec: 3600 }))).toThrow(expect.objectContaining({ code: 'HORIZON_TOO_SHORT' }));
  });
  it('expiry caps the horizon: every deadline <= expiresIn even with a large horizon setting', () => {
    for (let s = 0; s < 50; s += 1) checkPlan(base({ random: seeded(s), expiresInSec: 600 + 2000, horizonSec: 3600, kMin: 2, kMax: 3 }));
  });
  it('custom deadline margin and first offset', () => {
    const p = planSplit(base({ deadlineMarginSec: 60, firstOffsetSec: 30 }));
    expect(p.parts[0]!.dueOffsetMs).toBe(30_000);
    expect(p.parts[0]!.deadlineOffsetMs).toBe(90_000);
  });
  it('invalid inputs', () => {
    const bad: Partial<PlanOptions>[] = [
      { mode: 'off' as never },
      { decimals: 37 },
      { invoiceNet: 0n },
      { invoiceNet: -5n },
      { kMin: 1 },
      { kMin: 4, kMax: 3 },
      { minPartBase: 5 as never },
      { gapMinSec: -1 },
      { gapMaxSec: 10, gapMinSec: 20 },
      { gapMinSec: 0, gapMaxSec: 0 },
      { horizonSec: -1 },
      { expiresInSec: NaN },
      { roundMaxBps: 501 },
      { firstOffsetSec: -1 },
      { deadlineMarginSec: -1 },
      { invoiceNet: 2n ** 255n },
    ];
    for (const b of bad) expect(() => planSplit(base(b))).toThrow(AmountBlurError);
  });
  it('failing CSPRNG surfaces RANDOM_FAILED (no fallback to weak randomness)', () => {
    expect(() => planSplit(base({ random: failing }))).toThrow(expect.objectContaining({ code: 'RANDOM_FAILED' }));
  });
  it('plan is frozen', () => {
    const p = planSplit(base());
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.parts)).toBe(true);
    expect(Object.isFrozen(p.parts[0])).toBe(true);
  });
});

describe('review, progress, key distinctness', () => {
  it('reviewPlan (AB-F2): prompts, gas parts, fee delta in 0..k-1', () => {
    for (let s = 0; s < 50; s += 1) {
      const p = planSplit(base({ random: seeded(s) }));
      const r = reviewPlan(p);
      expect(r.walletPrompts).toBe(p.parts.length);
      expect(r.extraGasParts).toBe(p.parts.length - 1);
      expect(r.feeDeltaBase >= 0n && r.feeDeltaBase <= BigInt(p.parts.length - 1)).toBe(true);
      expect(r.overpayNet).toBe(p.overpayNet);
      expect(r.grossTotal).toBe(r.feeTotal + r.netTotal);
    }
  });
  it('remainingAfter (AB-S8): paid + unpaid == grossTotal, never more', () => {
    const p = planSplit(base({ kMin: 4, kMax: 4 }));
    const r = remainingAfter(p, new Set([0, 2]));
    expect(r.paidGross + r.unpaidGross).toBe(p.grossTotal);
    expect(r.unpaidIndexes).toEqual([1, 3]);
    expect(remainingAfter(p, new Set()).paidGross).toBe(0n);
    expect(() => remainingAfter(p, new Set([4]))).toThrow(AmountBlurError);
    expect(() => remainingAfter(p, new Set([-1]))).toThrow(AmountBlurError);
  });
  it('assertDistinctPartKeys (AB-S7): reuse is detected case-insensitively', () => {
    const ok = [
      { stealthAddress: '0x' + '11'.repeat(20), ephemeralPubKey: '0x02' + 'aa'.repeat(32) },
      { stealthAddress: '0x' + '22'.repeat(20), ephemeralPubKey: '0x03' + 'bb'.repeat(32) },
    ];
    expect(() => assertDistinctPartKeys(ok)).not.toThrow();
    expect(() => assertDistinctPartKeys([ok[0]!, { ...ok[1]!, stealthAddress: ok[0]!.stealthAddress.toUpperCase().replace('0X', '0x') }])).toThrow(/reused/);
    expect(() => assertDistinctPartKeys([ok[0]!, { ...ok[1]!, ephemeralPubKey: ok[0]!.ephemeralPubKey }])).toThrow(/reused/);
  });
  it('splitPart sanity', () => expect(splitPart(10_000n).net).toBe(9975n));
});
