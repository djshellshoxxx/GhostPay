import { describe, expect, it } from 'vitest';
import { checkCatalogs } from './completeness.js';
import { de, en, es, sampleCatalogs } from './catalogs/index.js';
import { I18nError } from './errors.js';
import { MissingKeyTracker, createI18n, type MissingKeyEvent } from './i18n.js';

describe('createI18n', () => {
  const mk = (extra: Record<string, Record<string, string>> = {}, o = {}) =>
    createI18n({ catalogs: { en: { a: 'A {x}', b: 'B' }, es: { a: 'Á {x}' }, ...extra }, defaultLocale: 'en', ...o });

  it('formats, falls back, reports', () => {
    const events: MissingKeyEvent[] = [];
    const i = mk({}, { onMissing: (e: MissingKeyEvent) => events.push(e) });
    expect(i.t('es', 'a', { x: 1 })).toBe('Á 1');
    expect(i.t('es-MX', 'a', { x: 1 })).toBe('Á 1');
    expect(i.t('es', 'b')).toBe('B');
    expect(i.t('fr', 'b')).toBe('B');
    expect(i.t('en', 'nope')).toBe('nope');
    expect(i.t('bad_tag', 'b')).toBe('B');
    expect(i.t('en', 'a')).toBe('A {x}');
    const kinds = events.map((e) => `${e.kind}:${e.locale}:${e.key}:${e.detail ?? ''}`);
    expect(kinds).toEqual([
      'fallback:es-MX:a:es',
      'fallback:es:b:en',
      'fallback:fr:b:en',
      'missing:en:nope:',
      'missing-arg:en:a:x',
    ]);
    expect(i.tracker.report().map((e) => e.kind)).toEqual(['fallback', 'fallback', 'fallback', 'missing-arg', 'missing']);
    i.tracker.clear();
    expect(i.tracker.size).toBe(0);
  });
  it('strict mode throws', () => {
    const i = mk({}, { strict: true });
    expect(() => i.t('es', 'b')).toThrow(/requested locale/);
    expect(() => i.t('en', 'zzz')).toThrow(/every locale/);
    expect(() => i.t('en', 'a')).toThrow(/missing argument/);
    expect(i.t('en', 'b')).toBe('B');
  });
  it('validates keys at call time and creation time', () => {
    const i = mk();
    for (const k of ['', 'a b', '<x>', 'a.', 'x'.repeat(129)]) expect(() => i.t('en', k)).toThrow(/key/);
    expect(() => createI18n({ catalogs: { en: { 'bad key': 'x' } }, defaultLocale: 'en' })).toThrow(/key/);
    expect(() => createI18n({ catalogs: { en: { k: 5 as unknown as string } }, defaultLocale: 'en' })).toThrow(/strings/);
    expect(() => createI18n({ catalogs: { en: { k: '{' } }, defaultLocale: 'en' })).toThrow(I18nError);
  });
  it('validates locales', () => {
    expect(() => createI18n({ catalogs: { en: {}, EN: {} }, defaultLocale: 'en' })).toThrow(/duplicate/);
    expect(() => createI18n({ catalogs: { es: {} }, defaultLocale: 'en' })).toThrow(/default/);
    expect(() => createI18n({ catalogs: { en_US: {} }, defaultLocale: 'en' })).toThrow(/BCP47/);
  });
  it('prototype-named keys are inert', () => {
    const i = createI18n({ catalogs: { en: { constructor: 'C', toString: 'T' } }, defaultLocale: 'en' });
    expect(i.t('en', 'constructor')).toBe('C');
    expect(i.t('en', 'hasOwnProperty')).toBe('hasOwnProperty');
  });
  it('negotiates, translators carry dir, has()', () => {
    const i = mk({ ar: { a: 'ا {x}' } });
    expect(i.locales).toEqual(['en', 'es', 'ar']);
    expect(i.negotiate(['ar-EG']).locale).toBe('ar');
    expect(i.translator('ar').dir).toBe('rtl');
    expect(i.translator('ar').t('a', { x: 'q' })).toBe('ا ⁨q⁩');
    expect(i.translator('???').locale).toBe('en');
    expect(i.has('es', 'a')).toBe(true);
    expect(i.has('es', 'b')).toBe(false);
    expect(i.has('??', 'a')).toBe(false);
    expect(i.has('de', 'a')).toBe(false);
  });
  it('passes escape option through', () => {
    const i = mk({}, { format: { escape: 'html' } });
    expect(i.t('en', 'a', { x: '<b>' })).toBe('A &#60;b&#62;');
  });
});

describe('MissingKeyTracker', () => {
  it('dedupes and is bounded', () => {
    const t = new MissingKeyTracker(2);
    const e: MissingKeyEvent = { kind: 'missing', locale: 'en', key: 'k' };
    t.record(e);
    t.record(e);
    t.record({ ...e, key: 'j' });
    t.record({ ...e, key: 'z' });
    expect(t.report().map((x) => x.key)).toEqual(['j', 'k']);
  });
});

describe('checkCatalogs', () => {
  it('shipped samples are complete', () => {
    const r = checkCatalogs(sampleCatalogs, 'en');
    expect(r.ok).toBe(true);
    expect(r.locales.map((l) => l.locale)).toEqual(['de', 'en', 'es']);
    expect(r.locales.every((l) => l.translated === l.total && l.total === Object.keys(en).length)).toBe(true);
    expect(Object.keys(es).sort()).toEqual(Object.keys(de).sort());
  });
  it('samples render through createI18n', () => {
    const i = createI18n({ catalogs: sampleCatalogs, defaultLocale: 'en', strict: true });
    expect(i.t('es', 'checkout.items', { count: 1 })).toBe('1 artículo');
    expect(i.t('es', 'checkout.items', { count: 1000000 })).toBe('1000000 de artículos');
    expect(i.t('de', 'checkout.expires_in', { minutes: 5 })).toBe('Diese Rechnung läuft in 5 Minuten ab.');
    expect(i.t('en', 'errors.literal_braces')).toBe('Use {curly braces} for placeholders.');
    expect(i.t('en', 'checkout.amount_due', { amount: '12.50', asset: 'USDC' })).toBe('Amount due: 12.50 USDC');
  });
  it('reports every defect class', () => {
    const base = { a: 'Hi {x}', b: 'Plain', c: '{n, plural, one{#} other{#}}', d: 'ok' };
    const es2 = {
      a: 'Hola',
      c: '{n, plural, one{#} other{#}}',
      d: '<b>ok</b>',
      e: 'extra',
    };
    const r = checkCatalogs({ en: base, es: es2, de: { ...base, a: '{', b: 'Klar' } }, 'en');
    expect(r.ok).toBe(false);
    const es = r.locales.find((l) => l.locale === 'es')!;
    expect(es.missing).toEqual(['b']);
    expect(es.extra).toEqual(['e']);
    expect(es.placeholderMismatches).toEqual([{ key: 'a', expected: ['x'], actual: [] }]);
    expect(es.htmlLike).toEqual(['d']);
    expect(es.missingPluralCategories).toEqual([{ key: 'c', categories: ['many'] }]);
    expect(es.translated).toBe(3);
    expect(es.ok).toBe(false);
    const de = r.locales.find((l) => l.locale === 'de')!;
    expect(de.syntaxErrors).toEqual([{ key: 'a', code: 'syntax' }]);
  });
  it('requires a base catalog and tolerates a broken base message', () => {
    expect(() => checkCatalogs({ es: {} }, 'en')).toThrow(/base/);
    const r = checkCatalogs({ en: { a: '{' }, es: { a: '{' } }, 'en');
    expect(r.ok).toBe(false);
    expect(r.locales.every((l) => l.syntaxErrors.length === 1)).toBe(true);
  });
});
