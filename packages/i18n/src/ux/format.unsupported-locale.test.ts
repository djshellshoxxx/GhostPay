import { describe, expect, it } from 'vitest';
import { formatDate, formatDateParts, formatNumber, formatNumberParts } from './format.js';
import { defaultIntl } from './intl.js';

// Simulate a host that silently resolves an unsupported locale to German, independently
// of the CI machine's real default locale. The constructors retain native locale support.
const nonEnglishHost = {
  ...defaultIntl,
  NumberFormat: class extends Intl.NumberFormat {
    public constructor(locale?: string | string[], options?: Intl.NumberFormatOptions) {
      super(locale === 'zz' ? 'de' : locale, options);
    }
  },
  DateTimeFormat: class extends Intl.DateTimeFormat {
    public constructor(locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
      super(locale === 'zz' ? 'de' : locale, options);
    }
  },
};

describe('unsupported formatting locale', () => {
  it('uses English number parts instead of the host default', () => {
    expect(formatNumberParts(1234.5, 'zz', {}, nonEnglishHost)).toEqual(
      formatNumberParts(1234.5, 'en', {}, nonEnglishHost),
    );
  });

  it('uses English date parts instead of the host default', () => {
    expect(formatDateParts(0, 'zz', {}, nonEnglishHost)).toEqual(
      formatDateParts(0, 'en', {}, nonEnglishHost),
    );
  });

  it('retains supported locales and the invalid-locale fallback', () => {
    expect(formatNumber(1234.5, 'de', {}, nonEnglishHost)).toBe('1.234,5');
    expect(formatDate(0, 'de', {}, nonEnglishHost)).toBe('01.01.1970');
    expect(formatNumber(1234.5, '??', {}, nonEnglishHost)).toBe('1,234.5');
    expect(formatDate(0, '??', {}, nonEnglishHost)).toBe('Jan 1, 1970');
  });
});
