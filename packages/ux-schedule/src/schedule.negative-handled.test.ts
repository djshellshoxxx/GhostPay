import { describe, expect, it } from 'vitest';
import { evaluateSchedule, markHandled, type RecurringSchedule } from './schedule.js';
import { UTC } from './time.js';

const schedule: RecurringSchedule = {
  id: 'rent',
  templateId: 'rent-template',
  rule: {
    frequency: 'daily',
    interval: 1,
    startDate: { year: 2026, month: 1, day: 1 },
    timeOfDayMinutes: 600,
  },
  paused: false,
  policy: 'latest-only',
  lastHandledMs: null,
};
const now = Date.UTC(2026, 0, 1, 10);

describe('handled occurrence timestamp validation', () => {
  it('rejects a negative timestamp before it can invalidate a new schedule', () => {
    expect(() => markHandled(schedule, -1)).toThrow(RangeError);
    expect(schedule.lastHandledMs).toBeNull();
    expect(evaluateSchedule(schedule, UTC, () => now).due.map((d) => d.dueAtMs)).toEqual([now]);
  });

  it('rejects a negative timestamp even when an occurrence was already handled', () => {
    const handled = markHandled(schedule, now);
    expect(() => markHandled(handled, -1)).toThrow(RangeError);
    expect(handled.lastHandledMs).toBe(now);
    expect(evaluateSchedule(handled, UTC, () => now).due).toEqual([]);
  });

  it('preserves zero, monotonic nonnegative updates and normal evaluation', () => {
    const zero = markHandled(schedule, 0);
    expect(zero.lastHandledMs).toBe(0);
    const handled = markHandled(zero, now);
    expect(markHandled(handled, now - 1).lastHandledMs).toBe(now);
    expect(markHandled(handled, now + 1).lastHandledMs).toBe(now + 1);
    expect(evaluateSchedule(handled, UTC, () => now).nextMs).toBe(now + 86_400_000);
    expect(() => markHandled(schedule, NaN)).toThrow(RangeError);
    expect(() => markHandled(schedule, 0.5)).toThrow(RangeError);
  });
});
