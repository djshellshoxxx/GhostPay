import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UxFeesError } from './errors.js';
import { adviseSweepTiming, percentile, type SweepTimingInput } from './timing.js';

const NOW = 1_800_000_000n;
const g = 10n ** 9n;
/** 1..100 gwei ramp, 100 samples. */
const ramp = Array.from({ length: 100 }, (_, i) => BigInt(i + 1) * g);
const base = (over: Partial<SweepTimingInput>): SweepTimingInput => ({ history: ramp, now: NOW, ...over });
const keys = (l: readonly { key: string }[]): string[] => l.map((m) => m.key);

describe('percentile', () => {
  it('uses nearest rank', () => {
    const s = [1n, 2n, 3n, 4n];
    expect(percentile(s, 25)).toBe(1n);
    expect(percentile(s, 50)).toBe(2n);
    expect(percentile(s, 75)).toBe(3n);
    expect(percentile(s, 100)).toBe(4n);
    expect(percentile(s, 1)).toBe(1n);
    expect(percentile([7n], 90)).toBe(7n);
  });
});

describe('adviseSweepTiming', () => {
  it('low relative price -> now, with exact percentiles and rank', () => {
    const r = adviseSweepTiming(base({ current: 10n * g, gasUnits: 60_000n }));
    expect(r.advice).toBe('now');
    expect(r.percentiles).toEqual({ p10: 10n * g, p25: 25n * g, p50: 50n * g, p75: 75n * g, p90: 90n * g });
    expect(r.rankBps).toBe(950); // 9 below + 0.5 tie of 100
    expect(r.estimatedFeeNative).toBe(600_000n * g);
    expect(keys(r.reasons)).toEqual(['fees.timing.reason.lowVsRecent']);
    expect(r.typicalLowSavingNative).toBeUndefined();
  });

  it('high price -> wait with typical-low saving, honest limits and medium confidence for 100 samples', () => {
    const r = adviseSweepTiming(base({ current: 90n * g, gasUnits: 60_000n }));
    expect(r.advice).toBe('wait');
    expect(r.typicalLowSavingNative).toBe(65n * g * 60_000n);
    expect(r.confidence).toBe('high'); // n=100 >= 4*24, p90/p50 = 1.8 < 3
    expect(keys(r.limits)).toContain('fees.timing.limit.notAPrediction');
    expect(keys(r.limits)).toContain('fees.timing.limit.localHistoryOnly');
    expect(keys(r.privacy)).toContain('fees.timing.privacy.waitingHelpsButNotGuaranteed');
  });

  it('urgent never waits', () => {
    const r = adviseSweepTiming(base({ current: 90n * g, urgency: 'urgent' }));
    expect(r.advice).toBe('ok');
    expect(keys(r.reasons)).toEqual(['fees.timing.reason.highButUrgent']);
    const falling = Array.from({ length: 40 }, (_, i) => BigInt(80 - i) * g);
    expect(adviseSweepTiming(base({ history: falling, current: 55n * g, urgency: 'urgent' })).advice).toBe(
      'ok',
    );
  });

  it('mid range: trend nudges', () => {
    const rep = (v: bigint, n: number): bigint[] => Array.from({ length: n }, () => v * g);
    const rising = adviseSweepTiming(
      base({ history: [...rep(50n, 51), ...rep(40n, 25), ...rep(62n, 24), 50n * g], current: 50n * g }),
    );
    expect(rising.trend).toBe('rising');
    expect(rising.advice).toBe('now');
    expect(keys(rising.reasons)).toEqual(['fees.timing.reason.risingTrend']);
    const fallH = [...rep(50n, 51), ...rep(62n, 25), ...rep(40n, 24), 50n * g];
    const fall = adviseSweepTiming(base({ history: fallH, current: 50n * g }));
    expect(fall.trend).toBe('falling');
    expect(fall.advice).toBe('wait');
    expect(adviseSweepTiming(base({ history: fallH, current: 50n * g, urgency: 'urgent' })).advice).toBe(
      'ok',
    );
    const flatH = Array.from({ length: 101 }, (_, i) => (i % 2 === 0 ? 48n * g : 52n * g));
    const flat = adviseSweepTiming(base({ history: flatH, current: 50n * g }));
    expect(flat.trend).toBe('flat');
    expect(flat.advice).toBe('ok');
    expect(keys(flat.reasons)).toEqual(['fees.timing.reason.midRange']);
    expect(
      adviseSweepTiming(base({ history: flatH.slice(0, 7), minSamples: 4, current: 50n * g })).trend,
    ).toBe('unknown');
  });

  it('too little history -> ok with low confidence and says so', () => {
    const r = adviseSweepTiming(base({ history: [5n * g, 6n * g, 7n * g], current: 5n * g }));
    expect(r.advice).toBe('ok');
    expect(r.confidence).toBe('low');
    expect(r.trend).toBe('unknown');
    expect(keys(r.reasons)).toEqual(['fees.timing.reason.insufficientHistory']);
    expect(r.reasons[0]?.params).toEqual({ have: 3, need: 24 });
  });

  it('flat history -> ok', () => {
    const r = adviseSweepTiming(base({ history: Array.from({ length: 30 }, () => 3n * g) }));
    expect(r.advice).toBe('ok');
    expect(keys(r.reasons)).toEqual(['fees.timing.reason.flatHistory']);
  });

  it('negligible fee relative to value -> ok; large fee still gets timed', () => {
    const tiny = adviseSweepTiming(base({ current: 90n * g, gasUnits: 60_000n, valueNative: 10n ** 20n }));
    expect(tiny.advice).toBe('ok');
    expect(tiny.feeBpsOfValue).toBe(0);
    expect(keys(tiny.reasons)).toEqual(['fees.timing.reason.feeNegligible']);
    const big = adviseSweepTiming(base({ current: 90n * g, gasUnits: 60_000n, valueNative: 10n ** 17n }));
    expect(big.feeBpsOfValue).toBe(540); // 5.4e15 wei of 1e17 = 5.4 %
  });

  it('volatility and stale data lower confidence', () => {
    const wild = Array.from({ length: 120 }, (_, i) => (i % 4 === 0 ? 400n * g : 10n * g));
    const r = adviseSweepTiming(base({ history: wild, current: 10n * g }));
    expect(keys(r.limits)).toContain('fees.timing.limit.volatile');
    const st = adviseSweepTiming(base({ newestSampleAt: NOW - 1000n, sampleIntervalSeconds: 30 }));
    expect(st.confidence).toBe('medium');
    expect(keys(st.limits)).toContain('fees.timing.limit.staleHistory');
    expect(keys(st.limits)).toContain('fees.timing.limit.windowLength');
    expect(st.limits.find((m) => m.key === 'fees.timing.limit.windowLength')?.params).toEqual({
      minutes: 50,
    });
    const fresh = adviseSweepTiming(base({ newestSampleAt: NOW - 10n }));
    expect(fresh.confidence).toBe('high');
    const twice = adviseSweepTiming(base({ history: wild, current: 10n * g, newestSampleAt: NOW - 5000n }));
    expect(twice.confidence).toBe('low');
    const few = adviseSweepTiming(base({ history: ramp.slice(0, 30), current: 5n * g }));
    expect(few.confidence).toBe('medium');
  });

  it('privacy notes: immediate sweep, jitter off, funding methods', () => {
    const r = adviseSweepTiming(
      base({ current: 50n * g, receivedAt: NOW - 120n, timingJitter: false, fundingMethod: 'self' }),
    );
    expect(keys(r.privacy)).toEqual([
      'fees.timing.privacy.timingLinksAddresses',
      'fees.timing.privacy.immediateSweepCorrelates',
      'fees.timing.privacy.enableJitter',
      'fees.timing.privacy.selfFundedGasLinks',
      'fees.timing.privacy.avoidFixedSchedule',
    ]);
    expect(r.privacy[1]?.params).toEqual({ minutes: 2 });
    const s = adviseSweepTiming(
      base({ current: 50n * g, receivedAt: NOW - 7200n, timingJitter: true, fundingMethod: 'sponsored' }),
    );
    expect(keys(s.privacy)).toEqual([
      'fees.timing.privacy.timingLinksAddresses',
      'fees.timing.privacy.sponsoredRelayerSees',
      'fees.timing.privacy.avoidFixedSchedule',
    ]);
    // receivedAt in the future (clock skew) produces no delay note
    expect(keys(adviseSweepTiming(base({ receivedAt: NOW + 5n })).privacy)).not.toContain(
      'fees.timing.privacy.immediateSweepCorrelates',
    );
  });

  it('defaults current to the newest sample', () => {
    expect(adviseSweepTiming(base({})).current).toBe(100n * g);
  });

  it('rejects invalid input', () => {
    const t = (o: Partial<SweepTimingInput>): void => {
      expect(() => adviseSweepTiming(base(o))).toThrow(UxFeesError);
    };
    t({ history: [] });
    t({ history: Array.from({ length: 5001 }, () => g) });
    t({ history: [0n] });
    t({ history: [-1n] });
    t({ history: [1 as never] });
    t({ history: 'x' as never });
    t({ history: [10n ** 18n + 1n] });
    t({ now: -1n });
    t({ minSamples: 3 });
    t({ maxSampleAgeSeconds: 0n });
    t({ sampleIntervalSeconds: 0 });
    t({ gasUnits: 0n });
    t({ valueNative: 0n });
    t({ current: 0n });
    t({ newestSampleAt: -1n });
    t({ receivedAt: -1n });
  });

  it('properties: percentiles ordered, rank in range, advice consistent with rank', () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 10n ** 12n }), { minLength: 1, maxLength: 200 }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (history, current) => {
          const r = adviseSweepTiming({ history, now: NOW, current });
          const p = r.percentiles;
          expect(p.p10 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p90).toBe(true);
          expect(r.rankBps).toBeGreaterThanOrEqual(0);
          expect(r.rankBps).toBeLessThanOrEqual(10_000);
          expect(r.limits.length).toBeGreaterThanOrEqual(2);
          if (r.advice === 'wait') expect(r.rankBps >= 7500 || r.trend === 'falling').toBe(true);
          if (r.advice === 'now') expect(r.rankBps <= 2500 || r.trend === 'rising').toBe(true);
          if (history.length < 24) expect(r.confidence).toBe('low');
        },
      ),
    );
  });
});
