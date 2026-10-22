import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  UTC,
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  isLeapYear,
  localToUtc,
  offsetMs,
  utcToLocalMs,
  weekdayOfDays,
  MS_DAY,
} from './time.js';
import { NY2026, utc } from './testutil.testutil.js';

describe('civil math', () => {
  it('epoch and known dates', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(2000, 3, 1)).toBe(11017);
    expect(civilFromDays(11017)).toEqual({ year: 2000, month: 3, day: 1 });
    expect(weekdayOfDays(0)).toBe(4); // Thursday
    expect(weekdayOfDays(-1)).toBe(3);
  });
  it('round-trips', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 100000 }), (d) => {
        const c = civilFromDays(d);
        return daysFromCivil(c.year, c.month, c.day) === d;
      }),
    );
  });
  it('leap years and month lengths', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('timezone', () => {
  it('rejects hostile resolvers', () => {
    expect(() => offsetMs(() => NaN, 0)).toThrow(RangeError);
    expect(() => offsetMs(() => 1e9, 0)).toThrow(RangeError);
    expect(() => offsetMs(() => 1.5, 0)).toThrow(RangeError);
  });
  it('utc is identity', () => {
    expect(localToUtc(123456789, UTC)).toBe(123456789);
    expect(utcToLocalMs(1000, UTC)).toBe(1000);
  });
  it('normal winter/summer times keep wall clock', () => {
    expect(localToUtc(utc(2026, 1, 15, 9), NY2026)).toBe(utc(2026, 1, 15, 14));
    expect(localToUtc(utc(2026, 7, 15, 9), NY2026)).toBe(utc(2026, 7, 15, 13));
  });
  it('spring-forward gap resolves forward (02:30 -> 03:30 EDT = 07:30Z)', () => {
    expect(localToUtc(utc(2026, 3, 8, 2, 30), NY2026)).toBe(utc(2026, 3, 8, 7, 30));
  });
  it('fall-back ambiguity picks first occurrence (01:30 EDT = 05:30Z)', () => {
    expect(localToUtc(utc(2026, 11, 1, 1, 30), NY2026)).toBe(utc(2026, 11, 1, 5, 30));
  });
  it('day after DST change is still 09:00 local', () => {
    const a = localToUtc(utc(2026, 3, 8, 9), NY2026);
    expect(a).toBe(utc(2026, 3, 8, 13));
    expect(localToUtc(utc(2026, 3, 7, 9), NY2026)).toBe(utc(2026, 3, 7, 14));
    expect(a - localToUtc(utc(2026, 3, 7, 9), NY2026)).toBe(MS_DAY - 3_600_000);
  });
});
