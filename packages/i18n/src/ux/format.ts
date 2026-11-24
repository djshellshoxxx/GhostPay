import { I18nError } from './errors.js';
import { type IntlLike, defaultIntl } from './intl.js';
import { parseLocale } from './locale.js';

/** A formatted piece (mirrors Intl parts) so UIs can style/ARIA-label segments without HTML. */
export interface FormatPart {
  readonly type: string;
  readonly value: string;
}

/** Subset of number options accepted (allow-listed; no arbitrary pass-through). */
export interface NumberFormatSpec {
  readonly style?: 'decimal' | 'percent' | 'currency' | 'unit';
  readonly currency?: string;
  readonly unit?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly notation?: 'standard' | 'compact';
  readonly signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
}

/** Subset of date options accepted. */
export interface DateFormatSpec {
  readonly dateStyle?: 'full' | 'long' | 'medium' | 'short';
  readonly timeStyle?: 'full' | 'long' | 'medium' | 'short';
  /** IANA zone or `UTC`. Defaults to `UTC` so output is deterministic. */
  readonly timeZone?: string;
}

function loc(locale: string): string {
  return parseLocale(locale)?.tag ?? 'en';
}

function digits(n: number | undefined): number | undefined {
  if (n === undefined) return undefined;
  if (!Number.isInteger(n) || n < 0 || n > 20)
    throw new I18nError('bad-input', 'fraction digits out of range');
  return n;
}

/**
 * Format a number into parts. Locale falls back to `en` when invalid or unsupported.
 * @security Rejects NaN/Infinity so garbage never renders as an amount. Bigint allowed.
 */
export function formatNumberParts(
  value: number | bigint,
  locale: string,
  spec: NumberFormatSpec = {},
  intl: IntlLike = defaultIntl,
): FormatPart[] {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new I18nError('bad-number', 'number must be finite');
  if (typeof value !== 'number' && typeof value !== 'bigint')
    throw new I18nError('bad-number', 'not a number');
  if (spec.style === 'currency' && !/^[A-Z]{3}$/.test(spec.currency ?? '')) {
    throw new I18nError('bad-input', 'currency must be a 3-letter upper-case code');
  }
  if (spec.style === 'unit' && !/^[a-z-]{1,30}$/.test(spec.unit ?? '')) {
    throw new I18nError('bad-input', 'invalid unit');
  }
  const min = digits(spec.minimumFractionDigits);
  const max = digits(spec.maximumFractionDigits);
  if (min !== undefined && max !== undefined && min > max)
    throw new I18nError('bad-input', 'min > max digits');
  const o: Intl.NumberFormatOptions = {};
  if (spec.style !== undefined) o.style = spec.style;
  if (spec.currency !== undefined) o.currency = spec.currency;
  if (spec.unit !== undefined) o.unit = spec.unit;
  if (min !== undefined) o.minimumFractionDigits = min;
  if (max !== undefined) o.maximumFractionDigits = max;
  if (spec.notation !== undefined) o.notation = spec.notation;
  if (spec.signDisplay !== undefined) o.signDisplay = spec.signDisplay;
  try {
    return new intl.NumberFormat(loc(locale), o).formatToParts(value);
  } catch (e) {
    if (e instanceof RangeError) {
      try {
        return new intl.NumberFormat('en', o).formatToParts(value);
      } catch {
        throw new I18nError('bad-input', 'unsupported number format options');
      }
    }
    throw e;
  }
}

/** Join parts into a string. */
export function partsToString(parts: readonly FormatPart[]): string {
  return parts.map((p) => p.value).join('');
}

/** Format a number to a string. */
export function formatNumber(
  value: number | bigint,
  locale: string,
  spec: NumberFormatSpec = {},
  intl: IntlLike = defaultIntl,
): string {
  return partsToString(formatNumberParts(value, locale, spec, intl));
}

/**
 * Format a date/timestamp (ms since epoch or Date) into parts. Time zone defaults to UTC
 * so results do not depend on the host. The clock is never read.
 * @security Invalid dates are rejected rather than rendered as "Invalid Date".
 */
export function formatDateParts(
  when: number | Date,
  locale: string,
  spec: DateFormatSpec = {},
  intl: IntlLike = defaultIntl,
): FormatPart[] {
  const ms = when instanceof Date ? when.getTime() : when;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || Math.abs(ms) > 8.64e15) {
    throw new I18nError('bad-date', 'invalid date');
  }
  if (spec.timeZone !== undefined && !/^[A-Za-z0-9_+\-/]{1,40}$/.test(spec.timeZone)) {
    throw new I18nError('bad-input', 'invalid time zone');
  }
  const o: Intl.DateTimeFormatOptions = {
    dateStyle: spec.dateStyle ?? 'medium',
    timeZone: spec.timeZone ?? 'UTC',
  };
  if (spec.timeStyle !== undefined) o.timeStyle = spec.timeStyle;
  try {
    return new intl.DateTimeFormat(loc(locale), o).formatToParts(ms);
  } catch (e) {
    if (e instanceof RangeError) {
      try {
        return new intl.DateTimeFormat('en', o).formatToParts(ms);
      } catch {
        throw new I18nError('bad-input', 'unsupported date format options');
      }
    }
    throw e;
  }
}

/** Format a date to a string. */
export function formatDate(
  when: number | Date,
  locale: string,
  spec: DateFormatSpec = {},
  intl: IntlLike = defaultIntl,
): string {
  return partsToString(formatDateParts(when, locale, spec, intl));
}
