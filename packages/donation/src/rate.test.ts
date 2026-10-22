import { describe, expect, it } from 'vitest';
import {
  DonationError,
  MAX_DONATION_PPM,
  formatPercent,
  parsePercentInput,
  validatePpm,
  DEFAULT_DONATION_PPM,
} from './index.js';

describe('validatePpm', () => {
  it('accepts 0, default and MAX; rejects MAX+1, fractions, NaN, negatives, non-numbers', () => {
    expect(validatePpm(0)).toEqual({ ok: true, ppm: 0 });
    expect(validatePpm(DEFAULT_DONATION_PPM)).toEqual({ ok: true, ppm: 965 });
    expect(validatePpm(MAX_DONATION_PPM)).toEqual({ ok: true, ppm: 50_000 });
    expect(validatePpm(MAX_DONATION_PPM + 1)).toEqual({ ok: false, reason: 'out_of_range' });
    expect(validatePpm(-1)).toEqual({ ok: false, reason: 'out_of_range' });
    expect(validatePpm(1.5)).toEqual({ ok: false, reason: 'not_integer' });
    expect(validatePpm(NaN)).toEqual({ ok: false, reason: 'not_integer' });
    expect(validatePpm('5')).toEqual({ ok: false, reason: 'not_integer' });
  });
});

describe('parsePercentInput', () => {
  const ok: [string, number][] = [
    ['0.0965', 965],
    ['0', 0],
    ['5', 50_000],
    ['5.0000', 50_000],
    ['0.0001', 1],
    ['1.5', 15_000],
    ['0.1', 1000],
  ];
  it.each(ok)('accepts %s', (s, ppm) => {
    expect(parsePercentInput(s)).toEqual({ ok: true, ppm });
  });
  const bad: [unknown, string][] = [
    ['5.0001', 'out_of_range'],
    ['1e-4', 'bad_format'],
    ['-1', 'bad_format'],
    ['+1', 'bad_format'],
    ['NaN', 'bad_format'],
    ['0x10', 'bad_format'],
    [' 1', 'bad_format'],
    ['.5', 'bad_format'],
    ['1.', 'bad_format'],
    ['0.00001', 'too_precise'],
    ['', 'empty'],
    ['1'.repeat(40), 'too_long'],
    ['999', 'out_of_range'],
    [5, 'not_a_string'],
    [null, 'not_a_string'],
  ];
  it.each(bad)('rejects %j', (s, reason) => {
    expect(parsePercentInput(s)).toEqual({ ok: false, reason });
  });
});

describe('formatPercent', () => {
  it('round trips for all table values', () => {
    expect(formatPercent(965)).toBe('0.0965');
    expect(formatPercent(0)).toBe('0');
    expect(formatPercent(50_000)).toBe('5');
    expect(formatPercent(15_000)).toBe('1.5');
    for (const p of [1, 10, 100, 965, 12_345, 50_000]) {
      expect(parsePercentInput(formatPercent(p))).toEqual({ ok: true, ppm: p });
    }
  });
  it('throws on invalid rate', () => {
    expect(() => formatPercent(-1)).toThrow(DonationError);
  });
});
