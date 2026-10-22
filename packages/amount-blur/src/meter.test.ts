import { describe, expect, it } from 'vitest';
import { ABCopy, AB_NOT_PROTECTED, findForbiddenWords } from './copy.js';
import { estimateCrowd, honestyMeter } from './meter.js';

describe('estimateCrowd (research 10.2)', () => {
  it('spec example: 10/day, 3 days, 20 buckets -> A = 1.5, none', () => {
    expect(estimateCrowd({ eventsPerDay: 10, windowDays: 3, amountBuckets: 20 })).toEqual({ A: 1.5, label: 'none' });
  });
  it('label thresholds at 2, 10, 100', () => {
    const l = (A: number) => estimateCrowd({ eventsPerDay: A, windowDays: 1, amountBuckets: 1 }).label;
    expect([l(1.99), l(2), l(9.99), l(10), l(99.9), l(100)]).toEqual(['none', 'tiny', 'tiny', 'small', 'small', 'larger']);
  });
  it('blur effect is visible: halving buckets doubles A, still none for a small crowd', () => {
    expect(estimateCrowd({ eventsPerDay: 10, windowDays: 3, amountBuckets: 10 }).A).toBe(3);
    expect(estimateCrowd({ eventsPerDay: 0, windowDays: 3, amountBuckets: 10 }).label).toBe('none');
  });
  it('rejects NaN, negative, zero window, bucket < 1, missing input (AB-H3: no defaults)', () => {
    const ok = { eventsPerDay: 1, windowDays: 1, amountBuckets: 1 };
    for (const bad of [{ eventsPerDay: NaN }, { eventsPerDay: -1 }, { eventsPerDay: Infinity }, { windowDays: 0 }, { amountBuckets: 0.5 }, { amountBuckets: NaN }]) {
      expect(() => estimateCrowd({ ...ok, ...bad })).toThrow();
    }
    expect(() => estimateCrowd(undefined as never)).toThrow();
    expect(() => estimateCrowd({ windowDays: 1, amountBuckets: 1 } as never)).toThrow();
  });
});

describe('honestyMeter (AB-H1, AB-H3, AB-H4)', () => {
  it('off -> null', () => expect(honestyMeter({ mode: 'off' })).toBeNull());
  it('every non-off mode carries AB_NOT_ANONYMOUS first and the full not-protected list', () => {
    for (const mode of ['delay', 'round', 'split', 'denom'] as const) {
      const m = honestyMeter({ mode })!;
      expect(m.notices[0]).toBe('AB_NOT_ANONYMOUS');
      expect(m.lines[0]).toBe(ABCopy.AB_NOT_ANONYMOUS);
      expect(m.notProtected).toBe(AB_NOT_PROTECTED);
    }
  });
  it('no input -> unknown, assume none', () => {
    const m = honestyMeter({ mode: 'split', k: 3, windowSec: 600 })!;
    expect(m.crowd).toBe('unknown');
    expect(m.crowdText).toBe('Crowd size unknown: assume none.');
  });
  it('shows only a label, never a number', () => {
    const m = honestyMeter({ mode: 'split', crowd: { eventsPerDay: 10, windowDays: 3, amountBuckets: 20 } })!;
    expect(m.crowd).toBe('none');
    expect(JSON.stringify(m)).not.toMatch(/1\.5/);
    for (const label of ['tiny', 'small', 'larger'] as const) {
      const per = { tiny: 5, small: 50, larger: 500 }[label];
      expect(honestyMeter({ mode: 'delay', crowd: { eventsPerDay: per, windowDays: 1, amountBuckets: 1 } })!.crowd).toBe(label);
    }
  });
  it('fan-out warning when k > 1 and window < 24 h, not when >= 24 h', () => {
    expect(honestyMeter({ mode: 'split', k: 3, windowSec: 3600 })!.notices).toContain('AB_FANOUT_LINKABLE');
    expect(honestyMeter({ mode: 'denom', k: 3 })!.notices).toContain('AB_FANOUT_LINKABLE');
    expect(honestyMeter({ mode: 'split', k: 3, windowSec: 86_400 })!.notices).not.toContain('AB_FANOUT_LINKABLE');
    expect(honestyMeter({ mode: 'split', k: 1, windowSec: 10 })!.notices).not.toContain('AB_FANOUT_LINKABLE');
    expect(honestyMeter({ mode: 'delay' })!.notices).not.toContain('AB_FANOUT_LINKABLE');
  });
  it('mode-specific notices', () => {
    expect(honestyMeter({ mode: 'round' })!.notices).toEqual(['AB_NOT_ANONYMOUS', 'AB_ROUND_UP']);
    expect(honestyMeter({ mode: 'split', k: 2, windowSec: 1 })!.notices).toEqual(['AB_NOT_ANONYMOUS', 'AB_COST_GAS', 'AB_FEE_DELTA', 'AB_FANOUT_LINKABLE', 'AB_TAB_OPEN']);
    expect(honestyMeter({ mode: 'delay' })!.notices).toEqual(['AB_NOT_ANONYMOUS', 'AB_TAB_OPEN']);
  });
});

describe('copy lint (AB-H2)', () => {
  it('all shipped strings are clean, plus no "mix"', () => {
    for (const s of [...Object.values(ABCopy), ...AB_NOT_PROTECTED]) {
      expect(findForbiddenWords(s)).toEqual([]);
      expect(s).not.toMatch(/\bmix/i);
    }
  });
  it('copy snapshot', () => {
    expect(ABCopy.AB_NOT_ANONYMOUS).toBe('This does not make you anonymous. See what it does not hide.');
    expect(Object.keys(ABCopy)).toEqual(['AB_NOT_ANONYMOUS', 'AB_COST_GAS', 'AB_FEE_DELTA', 'AB_ROUND_UP', 'AB_FANOUT_LINKABLE', 'AB_TAB_OPEN']);
    expect(AB_NOT_PROTECTED).toHaveLength(7);
  });
  it('lint catches positive claims and allows negated ones', () => {
    expect(findForbiddenWords('Your payment is anonymous.')).toEqual(['anonymous']);
    expect(findForbiddenWords('Fully untraceable and private. Amounts are hidden.')).toEqual(['untraceable', 'hidden', 'private']);
    expect(findForbiddenWords('This is not anonymous. No hidden amounts. Never private.')).toEqual([]);
    expect(findForbiddenWords('We do not claim it. Your payment is anonymous.')).toEqual(['anonymous']);
  });
});
