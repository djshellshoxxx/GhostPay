import { describe, expect, it } from 'vitest';
import { checkCatalogs } from './completeness.js';
import { I18nError } from './errors.js';
import { createI18n, type Catalog } from './i18n.js';

const duplicatePairs = [
  ['en', 'EN'],
  ['fr', 'FR'],
  ['pt-br', 'pt-BR'],
  ['zh-hant', 'zh-Hant'],
] as const;

describe('catalog completeness canonical locale identity', () => {
  it.each(duplicatePairs)('rejects %s / %s duplicates in either insertion order', (first, second) => {
    for (const [left, right] of [[first, second], [second, first]]) {
      const catalogs: Record<string, Catalog> = {
        de: { greeting: 'Hallo {name}' },
        [left!]: { greeting: 'Hello {name}' },
        [right!]: { greeting: 'Another {name}' },
      };
      for (const check of [() => createI18n({ catalogs, defaultLocale: 'de' }), () => checkCatalogs(catalogs, 'de')]) {
        expect(check).toThrowError(expect.objectContaining({
          name: 'I18nError',
          code: 'bad_locale',
          message: 'duplicate locale after canonicalisation',
        }));
      }
    }
  });

  it('does not silently replace the base catalog and its required keys', () => {
    const catalogs = { en: { required: 'Required', extra: 'Also required' }, EN: { required: 'Required' } };
    expect(() => checkCatalogs(catalogs, 'en')).toThrowError(I18nError);
    expect(() => checkCatalogs(catalogs, 'EN')).toThrowError(/duplicate locale/);
  });

  it('rejects an identical catalog under a second spelling', () => {
    const catalog = { greeting: 'Hello {name}' };
    expect(() => checkCatalogs({ en: catalog, EN: catalog }, 'en')).toThrowError(
      expect.objectContaining({ code: 'bad_locale' }),
    );
  });

  it('retains distinct regional and script locales with canonical report names', () => {
    const catalog = { greeting: 'Hello {name}' };
    const catalogs = { EN: catalog, 'en-us': catalog, 'pt-br': catalog, 'zh-hant': catalog };
    const report = checkCatalogs(catalogs, 'en');
    expect(report.base).toBe('en');
    expect(report.ok).toBe(true);
    expect(report.locales.map(({ locale }) => locale)).toEqual(['en', 'en-US', 'pt-BR', 'zh-Hant']);
    expect(report.locales.every(({ translated, total }) => translated === 1 && total === 1)).toBe(true);
    expect(createI18n({ catalogs, defaultLocale: 'en' }).locales).toHaveLength(4);
  });

  it('keeps missing-base and invalid-locale errors distinct', () => {
    expect(() => checkCatalogs({ fr: {} }, 'en')).toThrowError(expect.objectContaining({ code: 'bad_catalog' }));
    expect(() => checkCatalogs({ en_US: {} }, 'en')).toThrowError(expect.objectContaining({ code: 'bad_locale' }));
  });
});
