import { describe, expect, it } from 'vitest';
import { ExportError } from './errors.js';
import { formatTimestamp, MAX_TIMESTAMP_MS, parseTimestamp } from './time.js';

describe('parseTimestamp pre-epoch boundary', () => {
  it.each([
    ['1969-12-31', 'date'],
    ['1968-02-29', 'date'],
    ['1900-01-01', 'date'],
    ['1969-12-31T23:59:59.999Z', 'iso'],
    ['1969-12-31T23:59:59Z', 'iso'],
    ['1968-02-29T12:30:45.5Z', 'iso'],
  ] as const)('rejects unsupported pre-epoch timestamp %s (%s)', (text, format) => {
    expect(() => parseTimestamp(text, format)).toThrow(ExportError);
    try {
      parseTimestamp(text, format);
      expect.unreachable();
    } catch (e) {
      expect((e as ExportError).code).toBe('INVALID_DATE');
    }
  });

  it('still accepts epoch boundary and valid UTC calendar dates', () => {
    expect(parseTimestamp('1970-01-01', 'date')).toBe(0);
    expect(parseTimestamp('1970-01-01T00:00:00.000Z', 'iso')).toBe(0);
    expect(parseTimestamp('1970-01-01T00:00:00.001Z', 'iso')).toBe(1);
    expect(parseTimestamp('2024-02-29', 'date')).toBe(Date.UTC(2024, 1, 29));
    expect(parseTimestamp('2024-02-29T12:30:45.500Z', 'iso')).toBe(Date.UTC(2024, 1, 29, 12, 30, 45, 500));
    expect(parseTimestamp('0', 'unix')).toBe(0);
    expect(parseTimestamp('1704164645', 'unix')).toBe(1_704_164_645_000);
    expect(parseTimestamp(formatTimestamp(MAX_TIMESTAMP_MS))).toBe(MAX_TIMESTAMP_MS);
  });

  it('continues to reject post-maximum timestamps and invalid calendar dates', () => {
    expect(() => parseTimestamp('9999-12-31T23:59:59.999Z')).not.toThrow();
    expect(() => parseTimestamp('2023-02-29', 'date')).toThrow(ExportError);
    expect(() => parseTimestamp('2024-13-01', 'date')).toThrow(ExportError);
    expect(() => parseTimestamp('9999-12-32', 'date')).toThrow(ExportError);
  });
});
