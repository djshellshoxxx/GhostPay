import { describe, expect, it } from 'vitest';
import { AmountBlurError } from './errors.js';
import { planSchedule, type ScheduleOptions } from './schedule.js';
import { chiSquare, failing, seeded } from './rng.testutil.js';

const base = (o: Partial<ScheduleOptions> = {}): ScheduleOptions => ({
  chainId: 11155111,
  k: 4,
  gapMinSec: 120,
  gapMaxSec: 900,
  horizonSec: 3600,
  random: seeded(11),
  ...o,
});

describe('planSchedule (AB-T3)', () => {
  it('first offset 0, gaps within [min,max], strictly increasing, last <= horizon', () => {
    for (let s = 0; s < 200; s += 1) {
      const t = planSchedule(base({ random: seeded(s) }));
      expect(t).toHaveLength(4);
      expect(t[0]).toBe(0);
      for (let i = 1; i < t.length; i += 1) {
        const gap = t[i]! - t[i - 1]!;
        expect(gap).toBeGreaterThanOrEqual(120_000);
        expect(gap).toBeLessThanOrEqual(900_000);
      }
      expect(t[3]!).toBeLessThanOrEqual(3_600_000);
    }
  });
  it('gaps are uniform (chi-square over 10 buckets, p>0.001)', () => {
    const c = new Array<number>(10).fill(0);
    const r = seeded(77);
    for (let i = 0; i < 20_000; i += 1) {
      const t = planSchedule(base({ k: 2, horizonSec: 3600, random: r }));
      c[Math.min(9, Math.floor(((t[1]! - 120_000) / 780_001) * 10))]! += 1;
    }
    expect(chiSquare(c)).toBeLessThan(27.9);
  });
  it('gapMin 0 still yields strictly increasing times', () => {
    const t = planSchedule(base({ gapMinSec: 0, gapMaxSec: 1, k: 8, horizonSec: 100 }));
    for (let i = 1; i < t.length; i += 1) expect(t[i]! > t[i - 1]!).toBe(true);
  });
  it('first offset honoured and bounded by gapMax', () => {
    expect(planSchedule(base({ firstOffsetSec: 30 }))[0]).toBe(30_000);
    expect(() => planSchedule(base({ firstOffsetSec: 901 }))).toThrow(AmountBlurError);
  });
  it('k = 1 gives a single offset', () => {
    expect(planSchedule(base({ k: 1, gapMaxSec: 0, gapMinSec: 0 }))).toEqual([0]);
  });
  it('HORIZON_TOO_SHORT when it cannot fit; also when first offset exceeds horizon', () => {
    expect(() => planSchedule(base({ horizonSec: 300 }))).toThrow(expect.objectContaining({ code: 'HORIZON_TOO_SHORT' }));
    expect(() => planSchedule(base({ horizonSec: 10, firstOffsetSec: 20, k: 1 }))).toThrow(expect.objectContaining({ code: 'HORIZON_TOO_SHORT' }));
  });
  it('HORIZON_TOO_SHORT when feasible only at the extreme (retries exhausted)', () => {
    // minimum total = 3*120 s = 360 s; horizon 361 s leaves almost no mass.
    expect(() => planSchedule(base({ horizonSec: 361, gapMaxSec: 900_00 }))).toThrow(expect.objectContaining({ code: 'HORIZON_TOO_SHORT' }));
  });
  it('rejects bad inputs, mainnet, failing random', () => {
    for (const o of [{ k: 0 }, { k: 9 }, { gapMinSec: -1 }, { gapMaxSec: 10, gapMinSec: 20 }, { horizonSec: 1.5 }, { gapMaxSec: 0, gapMinSec: 0 }]) {
      expect(() => planSchedule(base(o))).toThrow(AmountBlurError);
    }
    expect(() => planSchedule(base({ chainId: 1 }))).toThrow(/testnet-only/);
    expect(() => planSchedule(base({ random: failing }))).toThrow(expect.objectContaining({ code: 'RANDOM_FAILED' }));
  });
});
