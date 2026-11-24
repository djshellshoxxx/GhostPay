import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  fallbackChain,
  isRtl,
  negotiateLocale,
  parseAcceptLanguage,
  parseLocale,
  requireLocale,
  textDirection,
  I18nError,
} from './index.js';

describe('parseLocale', () => {
  it('canonicalises case', () => {
    expect(parseLocale('PT-br')?.tag).toBe('pt-BR');
    expect(parseLocale('zh-hant-tw')).toEqual({
      language: 'zh',
      script: 'Hant',
      region: 'TW',
      tag: 'zh-Hant-TW',
    });
    expect(parseLocale('es-419')?.region).toBe('419');
  });
  it('rejects hostile or unsupported input', () => {
    for (const bad of [
      '',
      'e',
      'en_US',
      'en-US-u-ca-x',
      '../../etc',
      'en-US\n',
      'x'.repeat(40),
      '<script>',
    ]) {
      expect(parseLocale(bad)).toBeUndefined();
    }
    expect(parseLocale(42)).toBeUndefined();
    expect(() => requireLocale('nope!')).toThrow(I18nError);
    expect(requireLocale('en-gb')).toBe('en-GB');
  });
  it('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        parseLocale(s);
        return true;
      }),
    );
  });
});

describe('rtl', () => {
  it('detects by language and script', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he-IL')).toBe(true);
    expect(isRtl('fa')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('az-Arab')).toBe(true);
    expect(isRtl('ar-Latn')).toBe(false);
    expect(isRtl('garbage!')).toBe(false);
    expect(textDirection('ur')).toBe('rtl');
    expect(textDirection('de')).toBe('ltr');
  });
});

describe('fallbackChain', () => {
  it('orders specific to general then defaults', () => {
    expect(fallbackChain('pt-BR')).toEqual(['pt-BR', 'pt', 'en']);
    expect(fallbackChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en']);
    expect(fallbackChain('zh-Hant')).toEqual(['zh-Hant', 'zh', 'en']);
    expect(fallbackChain('en')).toEqual(['en']);
    expect(fallbackChain('!!', ['en-GB', '!!'])).toEqual(['en-GB', 'en']);
  });
});

describe('negotiateLocale', () => {
  const sup = ['en', 'pt-BR', 'es', 'ar'];
  it('exact, language, sibling, default', () => {
    expect(negotiateLocale(['pt-br'], sup, 'en')).toEqual({ locale: 'pt-BR', matchedBy: 'exact' });
    expect(negotiateLocale(['es-MX'], sup, 'en')).toEqual({ locale: 'es', matchedBy: 'language' });
    expect(negotiateLocale(['pt-PT'], sup, 'en')).toEqual({ locale: 'pt-BR', matchedBy: 'sibling' });
    expect(negotiateLocale(['fr', '??', 'ja'], sup, 'en')).toEqual({ locale: 'en', matchedBy: 'default' });
    expect(negotiateLocale([], sup, '!!')).toEqual({ locale: 'en', matchedBy: 'default' });
  });
  it('honours order of preference and skips invalid', () => {
    expect(negotiateLocale(['??', 'fr', 'ar-EG', 'es'], sup, 'en').locale).toBe('ar');
  });
  it('always returns a supported or default locale', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (r) => {
        const n = negotiateLocale(r, sup, 'en');
        return [...sup, 'en'].includes(n.locale);
      }),
    );
  });
});

describe('parseAcceptLanguage', () => {
  it('sorts by q, drops wildcard, zero and invalid', () => {
    expect(parseAcceptLanguage('fr;q=0.5, en-US, de;q=0.9, *;q=0.1, xx_yy, ja;q=0')).toEqual([
      'en-US',
      'de',
      'fr',
    ]);
  });
  it('is stable for equal q and dedupes', () => {
    expect(parseAcceptLanguage('de, en, DE')).toEqual(['de', 'en']);
  });
  it('treats malformed q as 0', () => {
    expect(parseAcceptLanguage('en;q=abc, de;q=1.5, fr;q=0.8')).toEqual(['fr']);
    expect(parseAcceptLanguage('en;level=1')).toEqual(['en']);
  });
  it('rejects oversized header', () => {
    expect(parseAcceptLanguage('en,'.repeat(600))).toEqual([]);
    expect(parseAcceptLanguage(5 as unknown as string)).toEqual([]);
  });
  it('caps number of entries', () => {
    const h = Array.from(
      { length: 50 },
      (_, i) => `a${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
    ).join(',');
    expect(parseAcceptLanguage(h).length).toBeLessThanOrEqual(20);
  });
});
