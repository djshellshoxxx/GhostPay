import { describe, expect, it, vi } from 'vitest';
import {
  EN_CATALOG,
  I18nError,
  checkCatalogCompleteness,
  checkCatalogSet,
  createTranslator,
  parseMessage,
  type I18nIssue,
} from './index.js';

const catalogs = {
  en: { 'a.hello': 'Hello {name}', 'a.items': '{n, plural, one {# item} other {# items}}', 'a.bad': '{oops' },
  'pt-BR': { 'a.hello': 'Ola {name}' },
  pt: { 'a.items': '{n, plural, one {# coisa} other {# coisas}}' },
};

describe('createTranslator', () => {
  it('uses chain: exact, language, base', () => {
    const t = createTranslator({ locale: 'pt-BR', catalogs });
    expect(t.locale).toBe('pt-BR');
    expect(t.t('a.hello', { name: 'Ana' })).toBe('Ola Ana');
    expect(t.t('a.items', { n: 2 })).toBe('2 coisas');
    expect(t.has('a.items')).toBe(true);
  });
  it('reports missing keys and returns the key', () => {
    const issues: I18nIssue[] = [];
    const t = createTranslator({ locale: 'en', catalogs, onIssue: (i) => issues.push(i) });
    expect(t.t('a.nothing')).toBe('a.nothing');
    expect(t.has('a.nothing')).toBe(false);
    expect(issues).toEqual([{ kind: 'missing-key', key: 'a.nothing', locale: 'en' }]);
  });
  it('rejects prototype and malformed keys', () => {
    const issues: I18nIssue[] = [];
    const t = createTranslator({ locale: 'en', catalogs, onIssue: (i) => issues.push(i) });
    expect(t.t('__proto__')).toBe('__proto__');
    expect(t.t('constructor')).toBe('constructor');
    expect(t.t('x'.repeat(200) + ' bad').length).toBe(80);
    expect(t.has('toString')).toBe(false);
    expect(issues.every((i) => i.kind === 'invalid-key' || i.kind === 'missing-key')).toBe(true);
    expect(issues[2]?.kind).toBe('invalid-key');
  });
  it('catches format errors and reports them', () => {
    const onIssue = vi.fn();
    const t = createTranslator({ locale: 'en', catalogs, onIssue });
    expect(t.t('a.bad')).toBe('a.bad');
    expect(t.t('a.hello')).toBe('a.hello');
    expect(onIssue).toHaveBeenCalledWith({
      kind: 'format-error',
      key: 'a.bad',
      locale: 'en',
      code: 'syntax',
    });
    expect(onIssue).toHaveBeenCalledWith({
      kind: 'format-error',
      key: 'a.hello',
      locale: 'en',
      code: 'missing-param',
    });
  });
  it('reports unknown error codes for non-I18nError throws', () => {
    const onIssue = vi.fn();
    const intl = {
      ...globalThis.Intl,
      NumberFormat: (() => {
        throw new TypeError('boom');
      }) as unknown as typeof Intl.NumberFormat,
      PluralRules: Intl.PluralRules,
      DateTimeFormat: Intl.DateTimeFormat,
    };
    const t = createTranslator({ locale: 'en', catalogs, intl, onIssue });
    t.t('a.items', { n: 1 });
    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({ code: 'unknown' }));
  });
  it('caches parses, applies escape mode, defaults invalid locale to en, tolerates sparse sets', () => {
    const t = createTranslator({ locale: 'zz!', catalogs, escape: 'text', fallbacks: ['xx', 'en'] });
    expect(t.locale).toBe('en');
    expect(t.t('a.hello', { name: '<b>' })).toBe('Hello <b>');
    expect(t.t('a.hello', { name: '<b>' })).toBe('Hello <b>');
    const h = createTranslator({ locale: 'en', catalogs });
    expect(h.t('a.hello', { name: '<b>' })).toBe('Hello &lt;b&gt;');
  });
  it('safe against __proto__ locale in catalogs', () => {
    const t = createTranslator({
      locale: 'en',
      catalogs: JSON.parse('{"__proto__":{"a.x":"pwn"},"en":{}}') as never,
    });
    expect(t.t('a.x')).toBe('a.x');
  });
});

describe('checkCatalogCompleteness', () => {
  const base = { 'a.x': 'Hi {n}', 'a.y': 'Yo', 'a.z': 'Z' };
  it('ok when identical shapes', () => {
    const r = checkCatalogCompleteness(base, { 'a.x': 'Hola {n}', 'a.y': 'Eh', 'a.z': 'Z!' }, 'es');
    expect(r).toMatchObject({ ok: true, coverage: 1, locale: 'es' });
  });
  it('flags missing, extra, mismatch, invalid', () => {
    const r = checkCatalogCompleteness(base, {
      'a.x': 'Hola {m}',
      'a.q': 'new',
      'Bad Key': 'x',
      'a.z': '{broken',
    });
    expect(r.missing).toEqual(['a.y']);
    expect(r.extra).toEqual(['Bad Key', 'a.q']);
    expect(r.paramMismatch).toEqual([{ key: 'a.x', expected: ['n'], actual: ['m'] }]);
    expect(r.invalid.map((i) => i.key).sort()).toEqual(['Bad Key', 'a.z']);
    expect(r.ok).toBe(false);
    expect(r.coverage).toBeCloseTo(2 / 3, 5);
    expect(r.locale).toBe('und');
  });
  it('handles empty base and unparsable base templates', () => {
    expect(checkCatalogCompleteness({}, {}).coverage).toBe(1);
    expect(checkCatalogCompleteness({ 'a.x': '{bad' }, { 'a.x': 'fine' }).ok).toBe(true);
  });
  it('checkCatalogSet compares all non-base locales; throws without base', () => {
    const reps = checkCatalogSet({ en: base, fr: { 'a.x': '{n}' }, de: base }, 'en');
    expect(reps.map((r) => r.locale)).toEqual(['de', 'fr']);
    expect(reps[0]?.ok).toBe(true);
    expect(reps[1]?.missing).toEqual(['a.y', 'a.z']);
    expect(() => checkCatalogSet({ fr: {} }, 'en')).toThrow(I18nError);
  });
});

describe('English catalog', () => {
  it('has valid keys and templates, and renders with real values', () => {
    expect(checkCatalogCompleteness(EN_CATALOG, EN_CATALOG).ok).toBe(true);
    for (const v of Object.values(EN_CATALOG)) parseMessage(v);
    const t = createTranslator({ locale: 'en', catalogs: { en: EN_CATALOG } });
    expect(t.t('activity.count', { count: 0 })).toBe('No payments');
    expect(t.t('activity.count', { count: 1 })).toBe('1 payment');
    expect(t.t('activity.count', { count: 12 })).toBe('12 payments');
    expect(t.t('settings.lock.after', { minutes: 5 })).toBe('Lock after 5 minutes of inactivity');
    expect(t.t('settings.lock.after', { minutes: 1 })).toBe('Lock after 1 minute of inactivity');
    expect(t.t('send.privacy.select', { level: 'high' })).toBe('High privacy');
    expect(t.t('a11y.step', { current: 2, total: 4 })).toBe('Step 2 of 4');
    expect(t.t('send.review.summary', { amount: '0.5 ETH', recipient: '<x>' })).toBe(
      'You are sending 0.5 ETH to &lt;x&gt;.',
    );
    expect(t.t('help.readingLevel', { band: 'plain' })).toBe('Reading level: easy');
  });
});
