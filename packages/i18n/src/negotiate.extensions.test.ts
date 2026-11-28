import { describe, expect, it } from 'vitest';
import { fallbackChain, negotiateLocale, parseAcceptLanguage, truncations } from './negotiate.js';

describe('locale negotiation with extensions', () => {
  it('prefers an exact supported extension tag over its base locale', () => {
    expect(negotiateLocale(['en-US-u-ca-gregory'], ['en-US', 'en-US-u-ca-gregory'], 'en-US')).toEqual({
      locale: 'en-US-u-ca-gregory',
      how: 'exact',
    });
  });

  it('canonicalises a private-use tag before preferring an exact match', () => {
    expect(negotiateLocale(['EN-x-DEMO'], ['en-GB', 'en-x-demo'], 'en-GB')).toEqual({
      locale: 'en-x-demo',
      how: 'exact',
    });
  });

  it('classifies an unsupported extension as a truncation and retains preference order', () => {
    expect(negotiateLocale(['en-US-u-ca-gregory'], ['en-US', 'en'], 'en')).toEqual({
      locale: 'en-US',
      how: 'truncated',
    });
    expect(negotiateLocale(['en-US-u-ca-gregory', 'de'], ['en-US', 'de'], 'de')).toEqual({
      locale: 'en-US',
      how: 'truncated',
    });
  });

  it('preserves the extension-free fallback and duplicate-q rejection', () => {
    expect(truncations('en-US-u-ca-gregory')).toEqual(['en-US', 'en']);
    expect(fallbackChain('en-US-u-ca-gregory', 'de')).toEqual(['en-US', 'en', 'de']);
    expect(parseAcceptLanguage('en;q=0;q=1,fr;q=0.5')).toEqual(['fr']);
  });
});
