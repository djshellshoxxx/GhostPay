import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  evaluateRecurrence,
  listUpcoming,
  nextOccurrence,
  occurrences,
  validateRule,
  type RecurrenceRule,
} from './recurrence.js';
import { UTC } from './time.js';
import { MS_DAY, NY2026, fixed, utc } from './testutil.testutil.js';

function rule(o: Record<string, unknown>): RecurrenceRule {
  const r = validateRule({
    frequency: 'daily',
    interval: 1,
    startDate: { year: 2026, month: 1, day: 1 },
    timeOfDayMinutes: 540,
    ...o,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const take = (r: RecurrenceRule, tz = UTC, n = 5) => listUpcoming(r, tz, -1, n);
const ec = (v: unknown) => {
  const r = validateRule(v);
  return r.ok ? 'ok' : r.error.code;
};

describe('validateRule', () => {
  const base = {
    frequency: 'daily',
    interval: 1,
    startDate: { year: 2026, month: 1, day: 1 },
    timeOfDayMinutes: 0,
  };
  it('fills defaults', () => {
    const w = validateRule({ ...base, frequency: 'weekly' });
    expect(w.ok && w.value.weekdays).toEqual([4]); // 2026-01-01 is Thursday
    const m = validateRule({ ...base, frequency: 'monthly', startDate: { year: 2026, month: 1, day: 31 } });
    expect(m.ok && m.value.dayOfMonth).toBe(31);
  });
  it('normalises weekdays', () => {
    const w = validateRule({ ...base, frequency: 'weekly', weekdays: [5, 1, 5] });
    expect(w.ok && w.value.weekdays).toEqual([1, 5]);
  });
  it('keeps optional end/max', () => {
    const r = validateRule({ ...base, endMs: 10, maxOccurrences: 3 });
    expect(r.ok && r.value.endMs).toBe(10);
    expect(r.ok && r.value.maxOccurrences).toBe(3);
  });
  it.each([
    [null],
    [{ ...base, frequency: 'hourly' }],
    [{ ...base, interval: 0 }],
    [{ ...base, interval: 366 }],
    [{ ...base, frequency: 'monthly', interval: 121 }],
    [{ ...base, interval: 1.5 }],
    [{ ...base, startDate: 5 }],
    [{ ...base, startDate: { year: 1999, month: 1, day: 1 } }],
    [{ ...base, startDate: { year: 2201, month: 1, day: 1 } }],
    [{ ...base, startDate: { year: 2026, month: 13, day: 1 } }],
    [{ ...base, startDate: { year: 2026, month: 2, day: 30 } }],
    [{ ...base, startDate: { year: 2026, month: 2, day: 29 } }],
    [{ ...base, startDate: { year: 2026, month: 1, day: 1, x: 1 } }],
    [{ ...base, startDate: { year: 2026, month: 1, day: 0 } }],
    [{ ...base, timeOfDayMinutes: 1440 }],
    [{ ...base, timeOfDayMinutes: -1 }],
    [{ ...base, weekdays: [1] }],
    [{ ...base, dayOfMonth: 3 }],
    [{ ...base, frequency: 'weekly', weekdays: [] }],
    [{ ...base, frequency: 'weekly', weekdays: 'x' }],
    [{ ...base, frequency: 'weekly', weekdays: [7] }],
    [{ ...base, frequency: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6, 0] }],
    [{ ...base, frequency: 'monthly', dayOfMonth: 32 }],
    [{ ...base, endMs: -1 }],
    [{ ...base, maxOccurrences: 0 }],
    [{ ...base, maxOccurrences: 10001 }],
    [{ ...base, junk: true }],
  ])('rejects %#', (v) => expect(ec(v)).not.toBe('ok'));
});

describe('daily', () => {
  it('every day at 09:00 UTC', () => {
    expect(take(rule({}), UTC, 3)).toEqual([utc(2026, 1, 1, 9), utc(2026, 1, 2, 9), utc(2026, 1, 3, 9)]);
  });
  it('interval 3 crosses month boundary', () => {
    const t = take(rule({ interval: 3, startDate: { year: 2026, month: 1, day: 30 } }), UTC, 3);
    expect(t).toEqual([utc(2026, 1, 30, 9), utc(2026, 2, 2, 9), utc(2026, 2, 5, 9)]);
  });
  it('leap day exists in 2028', () => {
    const t = take(rule({ startDate: { year: 2028, month: 2, day: 28 } }), UTC, 3);
    expect(t[1]).toBe(utc(2028, 2, 29, 9));
    expect(t[2]).toBe(utc(2028, 3, 1, 9));
  });
});

describe('weekly', () => {
  it('Mon/Wed starting on a Thursday skips earlier days of the first week', () => {
    // 2026-01-01 is Thursday; first Mon is Jan 5, Wed Jan 7
    const t = take(rule({ frequency: 'weekly', weekdays: [1, 3] }), UTC, 3);
    expect(t).toEqual([utc(2026, 1, 5, 9), utc(2026, 1, 7, 9), utc(2026, 1, 12, 9)]);
  });
  it('default weekday and biweekly', () => {
    const t = take(rule({ frequency: 'weekly', interval: 2 }), UTC, 3);
    expect(t).toEqual([utc(2026, 1, 1, 9), utc(2026, 1, 15, 9), utc(2026, 1, 29, 9)]);
  });
});

describe('monthly month-end clamping', () => {
  const r = rule({ frequency: 'monthly', startDate: { year: 2026, month: 1, day: 31 } });
  it('Jan 31 -> Feb 28 -> Mar 31 -> Apr 30 (no drift)', () => {
    expect(take(r, UTC, 4)).toEqual([
      utc(2026, 1, 31, 9),
      utc(2026, 2, 28, 9),
      utc(2026, 3, 31, 9),
      utc(2026, 4, 30, 9),
    ]);
  });
  it('leap February', () => {
    const t = take(rule({ frequency: 'monthly', startDate: { year: 2028, month: 1, day: 31 } }), UTC, 2);
    expect(t[1]).toBe(utc(2028, 2, 29, 9));
  });
  it('dayOfMonth override earlier than start is skipped for start month', () => {
    const t = take(
      rule({ frequency: 'monthly', dayOfMonth: 5, startDate: { year: 2026, month: 1, day: 20 } }),
      UTC,
      2,
    );
    expect(t).toEqual([utc(2026, 2, 5, 9), utc(2026, 3, 5, 9)]);
  });
  it('quarterly across year end', () => {
    const t = take(
      rule({ frequency: 'monthly', interval: 3, startDate: { year: 2026, month: 11, day: 15 } }),
      UTC,
      2,
    );
    expect(t).toEqual([utc(2026, 11, 15, 9), utc(2027, 2, 15, 9)]);
  });
});

describe('DST safety', () => {
  const r = rule({ startDate: { year: 2026, month: 3, day: 6 } });
  it('stays 09:00 local across spring forward', () => {
    const t = take(r, NY2026, 4);
    expect(t).toEqual([utc(2026, 3, 6, 14), utc(2026, 3, 7, 14), utc(2026, 3, 8, 13), utc(2026, 3, 9, 13)]);
  });
  it('02:30 daily during gap day still fires once, shifted forward', () => {
    const g = rule({ timeOfDayMinutes: 150, startDate: { year: 2026, month: 3, day: 7 } });
    expect(take(g, NY2026, 3)).toEqual([
      utc(2026, 3, 7, 7, 30),
      utc(2026, 3, 8, 7, 30),
      utc(2026, 3, 9, 6, 30),
    ]);
  });
  it('01:30 on fall-back day fires once (first occurrence)', () => {
    const g = rule({ timeOfDayMinutes: 90, startDate: { year: 2026, month: 10, day: 31 } });
    const t = take(g, NY2026, 3);
    expect(t).toEqual([utc(2026, 10, 31, 5, 30), utc(2026, 11, 1, 5, 30), utc(2026, 11, 2, 6, 30)]);
  });
  it('strictly increasing for random times and starts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), fc.integer({ min: 1, max: 365 }), (tod, day) => {
        const d = new Date(Date.UTC(2026, 0, day));
        const g = rule({
          timeOfDayMinutes: tod,
          startDate: { year: 2026, month: d.getUTCMonth() + 1, day: d.getUTCDate() },
        });
        const xs = take(g, NY2026, 30);
        return xs.every((x, i) => i === 0 || x > (xs[i - 1] as number));
      }),
    );
  });
});

describe('limits', () => {
  it('endMs inclusive', () => {
    const r = rule({ endMs: utc(2026, 1, 2, 9) });
    expect(take(r, UTC, 10)).toHaveLength(2);
  });
  it('maxOccurrences', () => {
    expect(take(rule({ maxOccurrences: 3 }), UTC, 10)).toHaveLength(3);
  });
  it('terminates at year 2200', () => {
    const r = rule({ startDate: { year: 2200, month: 12, day: 30 } });
    expect(take(r, UTC, 10)).toHaveLength(2);
    const m = rule({ frequency: 'monthly', startDate: { year: 2200, month: 11, day: 1 } });
    expect(take(m, UTC, 10)).toHaveLength(2);
  });
  it('defends against non-monotone resolvers', () => {
    let calls = 0;
    const weird = (t: number) => {
      calls++;
      return t > utc(2026, 1, 2) ? -900 : 0;
    };
    const xs = take(rule({}), weird, 4);
    expect(calls).toBeGreaterThan(0);
    expect(xs.every((x, i) => i === 0 || x > (xs[i - 1] as number))).toBe(true);
  });
  it('next / upcoming edge cases', () => {
    const r = rule({ maxOccurrences: 2 });
    expect(nextOccurrence(r, UTC, utc(2026, 1, 1, 9))).toBe(utc(2026, 1, 2, 9));
    expect(nextOccurrence(r, UTC, utc(2026, 1, 2, 9))).toBeNull();
    expect(listUpcoming(r, UTC, 0, 0)).toEqual([]);
    expect(listUpcoming(rule({}), UTC, 0, 1000)).toHaveLength(100);
    expect(listUpcoming(rule({}), UTC, utc(2026, 1, 1, 9), 1)).toEqual([utc(2026, 1, 2, 9)]);
    expect([...occurrences(rule({ maxOccurrences: 1 }), UTC)]).toHaveLength(1);
  });
});

describe('evaluateRecurrence (skipped / missed / never auto-send)', () => {
  const r = rule({});
  const now = utc(2026, 1, 10, 12); // Jan 10 12:00; occurrences Jan1..Jan10 09:00 passed
  const ev = (o: Record<string, unknown> = {}) =>
    evaluateRecurrence({ rule: r, tz: UTC, clock: fixed(now), lastHandledMs: null, ...o });

  it('latest-only: one prompt, the rest skipped, 3h overdue', () => {
    const e = ev();
    expect(e.due).toEqual([
      { dueAtMs: utc(2026, 1, 10, 9), overdueMs: 3 * 3_600_000, needsUserConfirm: true },
    ]);
    expect(e.skippedCount).toBe(9);
    expect(e.nextMs).toBe(utc(2026, 1, 11, 9));
  });
  it('max-age skips ancient occurrences even if latest', () => {
    const e = evaluateRecurrence({
      rule: r,
      tz: UTC,
      clock: fixed(utc(2026, 1, 20, 12)),
      lastHandledMs: null,
      maxAgeMs: 2 * MS_DAY,
    });
    expect(e.due.map((d) => d.dueAtMs)).toEqual([utc(2026, 1, 20, 9)]);
    const none = evaluateRecurrence({
      rule: rule({ endMs: utc(2026, 1, 3, 9) }),
      tz: UTC,
      clock: fixed(utc(2026, 1, 20, 12)),
      lastHandledMs: null,
    });
    expect(none.due).toEqual([]);
    expect(none.skippedCount).toBe(3);
    expect(none.nextMs).toBeNull();
  });
  it('catch-up: up to 5 within max age, in order', () => {
    const e = ev({ policy: 'catch-up' });
    expect(e.due).toHaveLength(5);
    expect(e.due[0]?.dueAtMs).toBe(utc(2026, 1, 6, 9));
    expect(e.due[4]?.dueAtMs).toBe(utc(2026, 1, 10, 9));
    expect(e.skippedCount).toBe(5);
    expect(ev({ policy: 'catch-up', maxCatchUp: 2 }).due).toHaveLength(2);
    expect(ev({ policy: 'catch-up', maxCatchUp: 99 }).due).toHaveLength(7); // max-age 7d => Jan 4..10
    expect(ev({ policy: 'catch-up', maxCatchUp: 0 }).due).toHaveLength(1);
  });
  it('respects lastHandled', () => {
    const e = ev({ lastHandledMs: utc(2026, 1, 10, 9) });
    expect(e.due).toEqual([]);
    expect(e.skippedCount).toBe(0);
  });
  it('nothing due before the first occurrence', () => {
    const e = evaluateRecurrence({ rule: r, tz: UTC, clock: fixed(utc(2025, 12, 31)), lastHandledMs: null });
    expect(e.due).toEqual([]);
    expect(e.nextMs).toBe(utc(2026, 1, 1, 9));
  });
  it('skipped list capped at last 100', () => {
    const e = evaluateRecurrence({ rule: r, tz: UTC, clock: fixed(utc(2027, 1, 1)), lastHandledMs: null });
    expect(e.skipped).toHaveLength(100);
    expect(e.skippedCount).toBeGreaterThan(300);
  });
  it('every due item requires confirm; bad inputs throw', () => {
    expect(ev({ policy: 'catch-up' }).due.every((d) => d.needsUserConfirm)).toBe(true);
    expect(() => ev({ maxAgeMs: -1 })).toThrow(RangeError);
    expect(() => evaluateRecurrence({ rule: r, tz: UTC, clock: () => NaN, lastHandledMs: null })).toThrow();
  });
});
