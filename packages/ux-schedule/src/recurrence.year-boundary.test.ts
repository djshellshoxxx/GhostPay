import { describe, expect, it } from 'vitest';
import { listUpcoming, validateRule, type RecurrenceRule } from './recurrence.js';
import { UTC } from './time.js';

function finalWeekRule(weekdays: number[]): RecurrenceRule {
  const result = validateRule({
    frequency: 'weekly',
    interval: 1,
    startDate: { year: 2200, month: 12, day: 28 },
    timeOfDayMinutes: 540,
    weekdays,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('weekly recurrence MAX_YEAR boundary', () => {
  it('does not yield a Thursday or Friday that belongs to year 2201', () => {
    const after = Date.UTC(2200, 11, 27);
    expect(listUpcoming(finalWeekRule([4, 5]), UTC, after, 10)).toEqual([]);
  });

  it('retains the last valid year-2200 occurrence while excluding 2201', () => {
    const after = Date.UTC(2200, 11, 27);
    expect(listUpcoming(finalWeekRule([3, 4]), UTC, after, 10)).toEqual([
      Date.UTC(2200, 11, 31, 9),
    ]);
  });

  it('preserves earlier last-week dates within the final supported year', () => {
    const after = Date.UTC(2200, 11, 27);
    expect(listUpcoming(finalWeekRule([0, 2]), UTC, after, 10)).toEqual([
      Date.UTC(2200, 11, 28, 9),
      Date.UTC(2200, 11, 30, 9),
    ]);
  });
});
