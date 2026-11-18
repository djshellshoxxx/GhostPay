import { describe, expect, it } from 'vitest';
import { BillingError, MAX_PERIOD_INDEX, listPeriods, periodAt, periodIndexAt, periodStart, validateSchedule, type ScheduleSpec } from './index.js';
import { D, JAN31 } from './fixtures.testutil.js';

const iso = (t: number): string => new Date(t * 1000).toISOString();
const monthly: ScheduleSpec = { anchor: JAN31, cadence: { kind: 'monthly', every: 1 } };

describe('schedule', () => {
  it('monthly Jan 31 clamps to month end without drift (2026, non-leap)', () => {
    expect(listPeriods(monthly, 0, 5).map((p) => iso(p.start).slice(0, 10))).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });
  it('leap year Feb 29 (2028)', () => {
    const s: ScheduleSpec = { anchor: Date.UTC(2028, 0, 31) / 1000, cadence: { kind: 'monthly', every: 1 } };
    expect(iso(periodStart(s, 1)).slice(0, 10)).toBe('2028-02-29');
  });
  it('quarterly crosses year and keeps time of day', () => {
    const s: ScheduleSpec = { anchor: Date.UTC(2026, 10, 15, 13, 45, 10) / 1000, cadence: { kind: 'monthly', every: 3 } };
    expect(iso(periodStart(s, 1))).toBe('2027-02-15T13:45:10.000Z');
    expect(iso(periodStart(s, 4))).toBe('2027-11-15T13:45:10.000Z');
  });
  it('weekly and custom', () => {
    const w: ScheduleSpec = { anchor: 1_800_000_000, cadence: { kind: 'weekly', every: 2 } };
    expect(periodStart(w, 3)).toBe(1_800_000_000 + 3 * 14 * D);
    const c: ScheduleSpec = { anchor: 1_800_000_000, cadence: { kind: 'custom', seconds: 36_000 } };
    expect(periodAt(c, 2)).toEqual({ index: 2, start: 1_800_072_000, end: 1_800_108_000 });
  });
  it('periodIndexAt boundaries', () => {
    expect(periodIndexAt(monthly, JAN31 - 1)).toBe(-1);
    expect(periodIndexAt(monthly, JAN31)).toBe(0);
    expect(periodIndexAt(monthly, periodStart(monthly, 1) - 1)).toBe(0);
    expect(periodIndexAt(monthly, periodStart(monthly, 1))).toBe(1);
    expect(periodIndexAt(monthly, periodStart(monthly, 7) + 5)).toBe(7);
  });
  it.each([
    ['weekly', { anchor: 0, cadence: { kind: 'weekly', every: 1 } }],
    ['custom', { anchor: 0, cadence: { kind: 'custom', seconds: 3_600 } }],
  ] as const)('treats the maximum %s start as a non-billable sentinel, not a final period', (_name, spec) => {
    const last = periodAt(spec, MAX_PERIOD_INDEX - 1);
    const boundary = periodStart(spec, MAX_PERIOD_INDEX);
    expect(last).toEqual({ index: MAX_PERIOD_INDEX - 1, start: periodStart(spec, MAX_PERIOD_INDEX - 1), end: boundary });
    expect(listPeriods(spec, MAX_PERIOD_INDEX - 1, 1)).toEqual([last]);
    expect(periodIndexAt(spec, last.start)).toBe(MAX_PERIOD_INDEX - 1);
    expect(periodIndexAt(spec, boundary - 1)).toBe(MAX_PERIOD_INDEX - 1);
    expect(() => periodIndexAt(spec, boundary)).toThrow(BillingError);
    expect(() => periodAt(spec, MAX_PERIOD_INDEX)).toThrow(BillingError);
    expect(() => listPeriods(spec, MAX_PERIOD_INDEX, 1)).toThrow(BillingError);
  });
  it('rejects invalid specs and beyond horizon', () => {
    expect(() => validateSchedule({ anchor: -1, cadence: { kind: 'weekly', every: 1 } })).toThrow(BillingError);
    expect(() => validateSchedule({ anchor: 0, cadence: { kind: 'weekly', every: 0 } })).toThrow(BillingError);
    expect(() => validateSchedule({ anchor: 0, cadence: { kind: 'custom', seconds: 60 } })).toThrow(BillingError);
    expect(() => validateSchedule({ anchor: 0, cadence: { kind: 'x' } as never })).toThrow(BillingError);
    expect(() => periodStart(monthly, -1)).toThrow(BillingError);
    expect(() => periodStart(monthly, 100_001)).toThrow(BillingError);
    expect(() => listPeriods(monthly, 0, 0)).toThrow(BillingError);
    const w: ScheduleSpec = { anchor: 0, cadence: { kind: 'weekly', every: 1 } };
    expect(() => periodIndexAt(w, 253_402_300_000)).toThrow(BillingError);
  });
});
