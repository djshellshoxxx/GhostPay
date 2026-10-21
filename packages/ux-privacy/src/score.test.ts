import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UxPrivacyError } from './errors.js';
import { MAX_SCORE, PRIVACY_LIMITS, computePrivacyScore, type PrivacyFacts } from './score.js';

const best: PrivacyFacts = {
  addressReuseCount: 0,
  amountMatchCount: 50,
  inOutAmountEqual: false,
  secondsBetweenInAndOut: 30 * 24 * 3600,
  gasFunding: 'unlinked',
  relayerUsed: true,
  anonymitySetSize: 5000,
};
const worst: PrivacyFacts = {
  addressReuseCount: 9,
  amountMatchCount: 0,
  inOutAmountEqual: true,
  secondsBetweenInAndOut: 30,
  gasFunding: 'linked',
  relayerUsed: false,
  anonymitySetSize: 1,
};

describe('computePrivacyScore', () => {
  it('best case is capped at 90 and never 100', () => {
    const r = computePrivacyScore(best);
    // 20 + 15*0.9 + 15*0.95 + 20 + 10 + 20*0.9 = 95.75 -> 96 raw
    expect(r.rawScore).toBe(96);
    expect(r.score).toBe(MAX_SCORE);
    expect(r.band).toBe('careful');
    expect(r.advice).toHaveLength(0);
  });

  it('worst case is zero-ish with exact factor math', () => {
    const r = computePrivacyScore(worst);
    // reuse 0, amount max(0,10-25)=0, timing 10*0.15=1.5, gas 0, relayer 25*0.1=2.5, crowd 0
    expect(r.rawScore).toBe(4);
    expect(r.score).toBe(4);
    expect(r.band).toBe('exposed');
    expect(r.factors.map((f) => f.score)).toEqual([0, 0, 10, 0, 25, 0]);
    expect(r.factors.reduce((a, f) => a + f.weight, 0)).toBe(100);
  });

  it('small crowd caps the total at 60', () => {
    const r = computePrivacyScore({ ...best, anonymitySetSize: 5 });
    expect(r.caps.map((c) => c.id)).toEqual(['neverAnonymous', 'smallCrowd']);
    expect(r.score).toBe(60);
    expect(r.rawScore).toBeGreaterThan(60);
  });

  it('unknown inputs are cautious and flagged', () => {
    const r = computePrivacyScore({
      ...best,
      secondsBetweenInAndOut: null,
      gasFunding: 'unknown',
      anonymitySetSize: null,
    });
    const unknown = r.factors.filter((f) => !f.known).map((f) => f.id);
    expect(unknown).toEqual(['timing', 'gasFunding', 'anonymitySet']);
    expect(r.factors.map((f) => f.score)).toEqual([100, 90, 40, 40, 100, 30]);
    expect(r.caps).toHaveLength(1);
  });

  it('ranks advice by recoverable points', () => {
    const r = computePrivacyScore({ ...best, gasFunding: 'linked', addressReuseCount: 1, relayerUsed: false });
    expect(r.advice.map((a) => a.factor)).toEqual(['gasFunding', 'addressReuse', 'relayer']);
    expect(r.advice.map((a) => a.rank)).toEqual([1, 2, 3]);
    expect(r.advice[0]?.potentialGain).toBe(20);
    expect(r.advice[1]?.potentialGain).toBe(8);
    expect(r.advice[2]?.potentialGain).toBe(7.5);
  });

  it('breaks ties by factor order', () => {
    // reuse 0 -> gain 20; gas linked -> gain 20
    const r = computePrivacyScore({ ...best, addressReuseCount: 20, gasFunding: 'linked' });
    expect(r.advice.slice(0, 2).map((a) => a.factor)).toEqual(['addressReuse', 'gasFunding']);
  });

  it('tier boundaries', () => {
    const f = (o: Partial<PrivacyFacts>) => computePrivacyScore({ ...best, ...o }).factors;
    expect(f({ addressReuseCount: 1 })[0]?.score).toBe(60);
    expect(f({ addressReuseCount: 2 })[0]?.score).toBe(35);
    expect(f({ addressReuseCount: 4 })[0]?.score).toBe(15);
    expect(f({ amountMatchCount: 0 })[1]?.score).toBe(10);
    expect(f({ amountMatchCount: 4 })[1]?.score).toBe(40);
    expect(f({ amountMatchCount: 19 })[1]?.score).toBe(70);
    expect(f({ secondsBetweenInAndOut: 3599 })[2]?.score).toBe(10);
    expect(f({ secondsBetweenInAndOut: 3600 })[2]?.score).toBe(30);
    expect(f({ secondsBetweenInAndOut: 86399 })[2]?.score).toBe(55);
    expect(f({ secondsBetweenInAndOut: 3 * 86400 - 1 })[2]?.score).toBe(75);
    expect(f({ secondsBetweenInAndOut: 6 * 86400 })[2]?.score).toBe(90);
    expect(f({ anonymitySetSize: 2 })[5]?.score).toBe(20);
    expect(f({ anonymitySetSize: 10 })[5]?.score).toBe(45);
    expect(f({ anonymitySetSize: 199 })[5]?.score).toBe(65);
    expect(f({ anonymitySetSize: 999 })[5]?.score).toBe(80);
    expect(f({ anonymitySetSize: 0 })[5]?.score).toBe(0);
  });

  it('always returns the honest limits and never says anonymous in bands', () => {
    for (const facts of [best, worst]) {
      const r = computePrivacyScore(facts);
      expect(r.limits).toBe(PRIVACY_LIMITS);
      expect(r.limits.length).toBeGreaterThan(0);
      expect(['exposed', 'weak', 'fair', 'careful']).toContain(r.band);
    }
  });

  it('bands', () => {
    expect(computePrivacyScore({ ...worst, relayerUsed: true, gasFunding: 'unlinked' }).band).toBe('weak');
    expect(computePrivacyScore({ ...best, anonymitySetSize: 5 }).band).toBe('fair');
  });

  it('rejects malformed untrusted facts', () => {
    const bad: unknown[] = [
      null,
      { ...best, addressReuseCount: -1 },
      { ...best, addressReuseCount: 1.5 },
      { ...best, addressReuseCount: Number.NaN },
      { ...best, addressReuseCount: Infinity },
      { ...best, addressReuseCount: '1' },
      { ...best, amountMatchCount: 2e9 },
      { ...best, secondsBetweenInAndOut: -1 },
      { ...best, secondsBetweenInAndOut: undefined },
      { ...best, secondsBetweenInAndOut: 1e12 },
      { ...best, anonymitySetSize: undefined },
      { ...best, gasFunding: 'maybe' },
      { ...best, relayerUsed: 'yes' },
      { ...best, inOutAmountEqual: 1 },
    ];
    for (const b of bad) expect(() => computePrivacyScore(b as PrivacyFacts)).toThrow(UxPrivacyError);
  });

  it('error message names the field only', () => {
    try {
      computePrivacyScore({ ...best, addressReuseCount: -123456 });
      expect.unreachable();
    } catch (e) {
      expect((e as UxPrivacyError).field).toBe('addressReuseCount');
      expect((e as Error).message).not.toContain('123456');
    }
  });

  it('property: score in [0,90], monotone in reuse and crowd, deterministic', () => {
    const facts = fc.record({
      addressReuseCount: fc.integer({ min: 0, max: 50 }),
      amountMatchCount: fc.integer({ min: 0, max: 500 }),
      inOutAmountEqual: fc.boolean(),
      secondsBetweenInAndOut: fc.option(fc.integer({ min: 0, max: 10 ** 8 }), { nil: null }),
      gasFunding: fc.constantFrom('unlinked', 'linked', 'unknown'),
      relayerUsed: fc.boolean(),
      anonymitySetSize: fc.option(fc.integer({ min: 0, max: 10 ** 6 }), { nil: null }),
    });
    fc.assert(
      fc.property(facts, (f) => {
        const r = computePrivacyScore(f);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(MAX_SCORE);
        expect(computePrivacyScore(f)).toEqual(r);
        expect(computePrivacyScore({ ...f, addressReuseCount: f.addressReuseCount + 1 }).rawScore).toBeLessThanOrEqual(
          r.rawScore,
        );
        if (f.anonymitySetSize !== null) {
          expect(computePrivacyScore({ ...f, anonymitySetSize: f.anonymitySetSize * 2 + 1 }).rawScore).toBeGreaterThanOrEqual(
            r.rawScore,
          );
        }
        for (const a of r.advice) expect(a.potentialGain).toBeGreaterThan(0);
        const gains = r.advice.map((a) => a.potentialGain);
        expect([...gains].sort((x, y) => y - x)).toEqual(gains);
      }),
    );
  });
});
