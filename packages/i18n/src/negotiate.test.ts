import { describe, expect, it } from 'vitest';
import { fallbackChain, negotiateLocale, parseAcceptLanguage, truncations } from './negotiate.js';

describe('fallbackChain', () => {
  it('truncates then appends default', () => {
    expect(fallbackChain('zh-Hant-TW', 'en')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en']);
    expect(fallbackChain('es-MX', 'en-GB')).toEqual(['es-MX', 'es', 'en-GB', 'en']);
    expect(fallbackChain('en', 'en')).toEqual(['en']);
    expect(fallbackChain('sl-rozaj-biske', 'en')).toEqual(['sl-rozaj-biske', 'sl', 'en']);
  });
  it('invalid locale gives default chain', () => {
    expect(fallbackChain('en_US', 'de')).toEqual(['de']);
    expect(fallbackChain('', 'de-AT')).toEqual(['de-AT', 'de']);
  });
  it('drops extensions', () => {
    expect(truncations('en-US-u-ca-gregory')).toEqual(['en-US', 'en']);
  });
});

describe('negotiateLocale', () => {
  const sup = ['en', 'es', 'de'];
  it('exact, truncated, language, default', () => {
    expect(negotiateLocale(['es'], sup, 'en')).toEqual({ locale: 'es', how: 'exact' });
    expect(negotiateLocale(['fr-CA', 'es-MX'], sup, 'en')).toEqual({ locale: 'es', how: 'truncated' });
    expect(negotiateLocale(['de-AT'], ['de', 'en'], 'en')).toEqual({ locale: 'de', how: 'truncated' });
    expect(negotiateLocale(['pt'], ['pt-BR', 'en'], 'en')).toEqual({ locale: 'pt-BR', how: 'language' });
    expect(negotiateLocale(['ja'], sup, 'en')).toEqual({ locale: 'en', how: 'default' });
    expect(negotiateLocale([], sup, 'en')).toEqual({ locale: 'en', how: 'default' });
  });
  it('ignores invalid tags and canonicalises', () => {
    expect(negotiateLocale(['xx_YY', '<script>', 'DE'], sup, 'en').locale).toBe('de');
  });
  it('requires default in supported', () => {
    expect(() => negotiateLocale(['de'], ['de'], 'en')).toThrow(/default/);
    expect(() => negotiateLocale(['de'], ['de'], 'bad_tag')).toThrow(/BCP47/);
  });
  it('caps scanned preferences at 32', () => {
    const reqs = [...Array.from({ length: 32 }, () => 'ja'), 'de'];
    expect(negotiateLocale(reqs, sup, 'en').locale).toBe('en');
  });
});

describe('parseAcceptLanguage', () => {
  it('orders by q, stable, drops junk', () => {
    expect(parseAcceptLanguage('fr;q=0.5, de, EN-us;q=0.9, es;q=0, *;q=0.1, !!!, ja;q=1.5, it;q=abc, pt;x=1')).toEqual([
      'de',
      'en-US',
      'fr',
    ]);
    expect(parseAcceptLanguage('en;q=1.000,de;q=1')).toEqual(['en', 'de']);
    expect(parseAcceptLanguage('')).toEqual([]);
  });
  it('bounds size and entry count', () => {
    expect(parseAcceptLanguage('en,'.repeat(400))).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => `a${String.fromCharCode(97 + (i % 26))}`).join(',');
    expect(parseAcceptLanguage(many).length).toBeLessThanOrEqual(32);
    expect(parseAcceptLanguage(5 as unknown as string)).toEqual([]);
  });
});
