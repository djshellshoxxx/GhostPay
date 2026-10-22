import { describe, expect, it } from 'vitest';
import { canonicalizeLocale, isValidLocale, parseLocale } from './bcp47.js';
import { isRtl, textDirection } from './rtl.js';

describe('parseLocale', () => {
  it.each([
    ['en', 'en'],
    ['EN-us', 'en-US'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['es-419', 'es-419'],
    ['de-DE-1996', 'de-DE-1996'],
    ['sl-rozaj-biske', 'sl-rozaj-biske'],
    ['en-US-u-ca-gregory', 'en-US-u-ca-gregory'],
    ['en-x-a', 'en-x-a'],
    ['en-u-ca-gregory-t-fr', 'en-u-ca-gregory-t-fr'],
    ['fil', 'fil'],
    ['abcde', 'abcde'],
  ])('accepts %s', (i, o) => {
    expect(canonicalizeLocale(i)).toBe(o);
    expect(isValidLocale(i)).toBe(true);
  });

  it.each([
    '', 'e', 'en_US', 'en-', '-en', 'en--US', 'x-foo', 'i-klingon', 'abcd', 'en-Latn-Latn', 'en-US-US',
    'en-1', 'en-u', 'en-u-a-', 'en-a-b', 'en-u-ca-u-ca', 'en-x', 'en-x-', 'en-x-toolongsubtag', 
    'en-abcdefghi', 'a'.repeat(36), 'en us', 'en-US\n', 'zh-yue', 'en-<script>', 'en-12345678-x',
  ])('rejects %j', (i) => {
    expect(isValidLocale(i)).toBe(false);
    expect(() => parseLocale(i)).toThrow(/BCP47/);
  });

  it('rejects non-strings and duplicate variants', () => {
    expect(isValidLocale(42)).toBe(false);
    expect(isValidLocale(null)).toBe(false);
    expect(() => parseLocale(undefined as unknown as string)).toThrow();
    expect(isValidLocale('sl-rozaj-rozaj')).toBe(false);
  });

  it('exposes subtags', () => {
    const p = parseLocale('zh-Hant-TW-u-nu-hanidec');
    expect([p.language, p.script, p.region, p.extensions]).toEqual(['zh', 'Hant', 'TW', 'u-nu-hanidec']);
    expect(parseLocale('sl-rozaj').variants).toEqual(['rozaj']);
  });
});

describe('rtl', () => {
  it('flags RTL languages and scripts', () => {
    for (const t of ['ar', 'ar-EG', 'he', 'fa-IR', 'ur', 'az-Arab', 'pa-Arab', 'ku-Arab-IQ']) expect(isRtl(t)).toBe(true);
    for (const t of ['en', 'es', 'de', 'ar-Latn', 'zh-Hant', 'ru']) expect(isRtl(t)).toBe(false);
  });
  it('treats invalid tags as LTR and maps dir', () => {
    expect(isRtl('ar_EG')).toBe(false);
    expect(textDirection('he')).toBe('rtl');
    expect(textDirection('de')).toBe('ltr');
  });
});
