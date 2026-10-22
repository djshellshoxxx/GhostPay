import { describe, expect, it } from 'vitest';
import {
  detectLocale,
  directionOf,
  fallbackChain,
  findLanguage,
  isPseudoLocale,
  isReviewed,
  LANGUAGES,
  matchSupported,
  normalizeTag,
  pluralCategories,
  PSEUDO_LANGUAGES,
} from './languages';

describe('registry', () => {
  it('lists the required languages with autonyms and direction', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual([
      'en', 'es', 'fr', 'de', 'pt-BR', 'it', 'nl', 'pl', 'tr', 'ru', 'uk', 'ar', 'he', 'fa', 'hi', 'bn', 'id', 'vi', 'th', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'sw',
    ]);
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ar', 'he', 'fa']);
    expect(findLanguage('ja')?.name).toBe('日本語');
    expect(findLanguage('en-XB')?.dir).toBe('rtl');
    expect(findLanguage('xx')).toBeUndefined();
    expect(PSEUDO_LANGUAGES.every((l) => isPseudoLocale(l.code))).toBe(true);
    expect(isPseudoLocale('en')).toBe(false);
    expect(isReviewed('es')).toBe(false);
  });

  it('every registry code is a valid BCP 47 tag that Intl knows', () => {
    for (const l of LANGUAGES) {
      expect(normalizeTag(l.code)).toBeDefined();
      expect(directionOf(l.code)).toBe(l.dir);
      expect(pluralCategories(l.code, false)).toContain('other');
    }
  });
});

describe('direction', () => {
  it('is rtl for ar, he, fa, ur and rtl scripts, ltr otherwise', () => {
    for (const t of ['ar', 'ar-EG', 'he', 'iw', 'fa', 'fa-AF', 'ur', 'ur-PK', 'az-Arab', 'en-XB', 'yi']) expect(directionOf(t)).toBe('rtl');
    for (const t of ['en', 'ja', 'zh-Hant', 'ru', 'pt-BR', 'not a tag', 'sr-Latn']) expect(directionOf(t)).toBe('ltr');
  });
});

describe('matching and fallback chain', () => {
  it('maps regional and legacy tags to registry languages', () => {
    expect(matchSupported('pt-BR')).toBe('pt-BR');
    expect(matchSupported('pt-pt')).toBe('pt-BR');
    expect(matchSupported('en-GB')).toBe('en');
    expect(matchSupported('zh')).toBe('zh-Hans');
    expect(matchSupported('zh-CN')).toBe('zh-Hans');
    expect(matchSupported('zh-SG')).toBe('zh-Hans');
    expect(matchSupported('zh-TW')).toBe('zh-Hant');
    expect(matchSupported('zh-HK')).toBe('zh-Hant');
    expect(matchSupported('zh-Hant-TW')).toBe('zh-Hant');
    expect(matchSupported('iw')).toBe('he');
    expect(matchSupported('es_MX')).toBe('es');
    expect(matchSupported('xx-unknown')).toBeUndefined();
    expect(matchSupported('')).toBeUndefined();
    expect(matchSupported('qaa')).toBeUndefined();
  });

  it('builds chains that end in English', () => {
    expect(fallbackChain('pt-BR')).toEqual(['pt-BR', 'pt', 'en']);
    expect(fallbackChain('pt-PT')).toEqual(['pt-PT', 'pt-BR', 'pt', 'en']);
    expect(fallbackChain('pt')).toEqual(['pt', 'pt-BR', 'en']);
    expect(fallbackChain('zh-TW')).toEqual(['zh-TW', 'zh-Hant', 'zh', 'en']);
    expect(fallbackChain('es-MX')).toEqual(['es-MX', 'es', 'en']);
    expect(fallbackChain('en')).toEqual(['en']);
    expect(fallbackChain('qaa')).toEqual(['qaa', 'en']);
    expect(fallbackChain('garbage tag')).toEqual(['en']);
    expect(fallbackChain('en-XA')).toEqual(['en-XA', 'en']);
  });

  it('detects the first supported browser language and defaults to English', () => {
    expect(detectLocale(['xx', 'fr-CA', 'de'])).toBe('fr');
    expect(detectLocale(['nb', 'zh-TW'])).toBe('zh-Hant');
    expect(detectLocale(['xx'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
