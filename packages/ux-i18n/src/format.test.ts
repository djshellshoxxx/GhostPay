import { describe, expect, it } from 'vitest';
import {
  I18nError,
  defaultIntl,
  formatDate,
  formatDateParts,
  formatNumber,
  formatNumberParts,
  partsToString,
} from './index.js';

describe('number formatting', () => {
  it('formats by locale with parts', () => {
    expect(formatNumber(1234567.891, 'en')).toBe('1,234,567.891');
    expect(formatNumber(1234567.891, 'de')).toBe('1.234.567,891');
    const parts = formatNumberParts(1234.5, 'en', { style: 'currency', currency: 'USD' });
    expect(parts.map((p) => p.type)).toEqual([
      'currency',
      'integer',
      'group',
      'integer',
      'decimal',
      'fraction',
    ]);
    expect(partsToString(parts)).toBe('$1,234.50');
  });
  it('percent, digits, compact, sign, bigint, unit', () => {
    expect(formatNumber(0.256, 'en', { style: 'percent', maximumFractionDigits: 1 })).toBe('25.6%');
    expect(formatNumber(2, 'en', { minimumFractionDigits: 2 })).toBe('2.00');
    expect(formatNumber(1500, 'en', { notation: 'compact' })).toBe('1.5K');
    expect(formatNumber(5, 'en', { signDisplay: 'always' })).toBe('+5');
    expect(formatNumber(10n ** 20n, 'en')).toBe('100,000,000,000,000,000,000');
    expect(formatNumber(16, 'en', { style: 'unit', unit: 'kilometer-per-hour' })).toContain('16');
  });
  it('invalid locale falls back to en; unsupported locale-specific failure falls back', () => {
    expect(formatNumber(1000, '??')).toBe('1,000');
    const throwsFirst = {
      ...defaultIntl,
      NumberFormat: class extends Intl.NumberFormat {
        public constructor(l?: string | string[], o?: Intl.NumberFormatOptions) {
          if (l === 'fr') throw new RangeError('x');
          super(l, o);
        }
      } as typeof Intl.NumberFormat,
    };
    expect(formatNumber(1000, 'fr', {}, throwsFirst)).toBe('1,000');
  });
  it('rejects bad numbers and options', () => {
    expect(() => formatNumber(NaN, 'en')).toThrow(I18nError);
    expect(() => formatNumber(Infinity, 'en')).toThrow(I18nError);
    expect(() => formatNumber('1' as unknown as number, 'en')).toThrow(I18nError);
    expect(() => formatNumber(1, 'en', { style: 'currency' })).toThrow(I18nError);
    expect(() => formatNumber(1, 'en', { style: 'currency', currency: 'usd' })).toThrow(I18nError);
    expect(() => formatNumber(1, 'en', { style: 'unit', unit: 'x y' })).toThrow(I18nError);
    expect(() => formatNumber(1, 'en', { maximumFractionDigits: 99 })).toThrow(I18nError);
    expect(() => formatNumber(1, 'en', { minimumFractionDigits: 1.5 })).toThrow(I18nError);
    expect(() => formatNumber(1, 'en', { minimumFractionDigits: 3, maximumFractionDigits: 1 })).toThrow(
      I18nError,
    );
    expect(() => formatNumber(1, 'en', { style: 'unit', unit: 'notaunit' })).toThrow(I18nError);
  });
  it('rethrows non-RangeError failures', () => {
    const intl = {
      ...defaultIntl,
      NumberFormat: (() => {
        throw new TypeError('t');
      }) as unknown as typeof Intl.NumberFormat,
    };
    expect(() => formatNumber(1, 'en', {}, intl)).toThrow(TypeError);
  });
});

describe('date formatting', () => {
  const t = Date.UTC(2024, 1, 29, 13, 5, 9); // 2024-02-29T13:05:09Z
  it('formats deterministically in UTC', () => {
    expect(formatDate(t, 'en')).toBe('Feb 29, 2024');
    expect(formatDate(new Date(t), 'en', { dateStyle: 'short', timeStyle: 'short' })).toMatch(
      /2\/29\/24.*1:05\sPM/,
    );
    expect(formatDate(t, 'de', { dateStyle: 'long' })).toBe('29. Februar 2024');
    expect(formatDate(t, 'en', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tokyo' })).toMatch(
      /10:05\sPM/,
    );
  });
  it('returns parts', () => {
    const p = formatDateParts(t, 'en', { dateStyle: 'medium' });
    expect(p.find((x) => x.type === 'year')?.value).toBe('2024');
    expect(p.find((x) => x.type === 'day')?.value).toBe('29');
  });
  it('rejects invalid dates and zones', () => {
    expect(() => formatDate(NaN, 'en')).toThrow(I18nError);
    expect(() => formatDate(new Date('x'), 'en')).toThrow(I18nError);
    expect(() => formatDate(9e15, 'en')).toThrow(I18nError);
    expect(() => formatDate('1' as unknown as number, 'en')).toThrow(I18nError);
    expect(() => formatDate(t, 'en', { timeZone: '<script>' })).toThrow(I18nError);
    expect(() => formatDate(t, 'en', { timeZone: 'Not/AZone' })).toThrow(I18nError);
  });
  it('locale fallback and non-Range rethrow', () => {
    expect(formatDate(t, '!!')).toBe('Feb 29, 2024');
    const intl = {
      ...defaultIntl,
      DateTimeFormat: (() => {
        throw new TypeError('t');
      }) as unknown as typeof Intl.DateTimeFormat,
    };
    expect(() => formatDate(t, 'en', {}, intl)).toThrow(TypeError);
    const rangeFirst = {
      ...defaultIntl,
      DateTimeFormat: class extends Intl.DateTimeFormat {
        public constructor(l?: string | string[], o?: Intl.DateTimeFormatOptions) {
          if (l === 'fr') throw new RangeError('x');
          super(l, o);
        }
      } as typeof Intl.DateTimeFormat,
    };
    expect(formatDate(t, 'fr', {}, rangeFirst)).toBe('Feb 29, 2024');
  });
});
