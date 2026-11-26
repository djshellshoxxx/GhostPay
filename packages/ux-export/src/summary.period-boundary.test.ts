import { describe, expect, it } from 'vitest';
import { ExportError } from './errors.js';
import { row } from './fixtures.testutil.js';
import { periodKey, summarize, type SummaryPeriod } from './summary.js';

const april = Date.UTC(2024, 3, 2);

describe('summary period runtime boundary', () => {
  it('rejects unknown periods even when the summary has no rows', () => {
    const malformed: readonly unknown[] = ['hour', 'DAY', '', null, undefined, 1];
    for (const value of malformed) {
      const period = value as SummaryPeriod;
      expect(() => periodKey(april, period)).toThrowError(ExportError);
      expect(() => summarize([], { period })).toThrowError(ExportError);
      expect(() => summarize([row({ timestampMs: april })], { period })).toThrowError(ExportError);
    }
  });

  it('preserves the five supported UTC groupings', () => {
    const expected: readonly (readonly [SummaryPeriod, string])[] = [
      ['day', '2024-04-02'],
      ['month', '2024-04'],
      ['quarter', '2024-Q2'],
      ['year', '2024'],
      ['all', 'ALL'],
    ];
    for (const [period, key] of expected) {
      expect(periodKey(april, period)).toBe(key);
      expect(summarize([row({ timestampMs: april })], { period })[0]?.period).toBe(key);
    }
  });
});
