import { describe, expect, it, vi } from 'vitest';
import { SOURCE_CATALOG, type CatalogLayer } from './catalog';
import { createTranslator, type I18nIssue } from './translator';

const en: CatalogLayer = { locale: 'en', messages: SOURCE_CATALOG.messages };

describe('translator fallback and diagnostics', () => {
  it('canonicalizes a valid locale and falls back past a broken translation', () => {
    const issues: I18nIssue[] = [];
    const broken: CatalogLayer = { locale: 'fr', messages: { 'settings.title': '{oops' } };
    const tr = createTranslator('FR-ca', [broken, en], { onIssue: (issue) => issues.push(issue) });
    expect(tr.locale).toBe('fr-CA');
    expect(tr.t('settings.title')).toBe('Settings');
    expect(tr.parts('settings.title')).toEqual(['Settings']);
    expect(issues.map((issue) => issue.kind)).toEqual(['syntax', 'fallback']);
    expect(issues[0]).toMatchObject({ kind: 'syntax', locale: 'fr', key: 'settings.title' });
    expect(issues[1]).toMatchObject({ kind: 'fallback', locale: 'fr', usedLocale: 'en' });
    tr.t('settings.title');
    expect(issues).toHaveLength(2);
  });

  it('returns the key for missing messages and reports argument problems once', () => {
    const issues: I18nIssue[] = [];
    const tr = createTranslator('invalid locale!', [en], { onIssue: (issue) => issues.push(issue) });
    expect(tr.locale).toBe('en');
    expect(tr.t('settings.title')).toBe('Settings');
    const custom: CatalogLayer = { locale: 'en', messages: { 'settings.title': 'Hello {name}' } };
    const withBadArgs = createTranslator('en', [custom], { onIssue: (issue) => issues.push(issue) });
    expect(withBadArgs.t('settings.title')).toBe('Hello {name}');
    expect(withBadArgs.t('settings.title')).toBe('Hello {name}');
    expect(issues.filter((issue) => issue.kind === 'argument')).toEqual([
      { kind: 'argument', key: 'settings.title', locale: 'en', name: 'name', problem: 'missing-argument' },
    ]);
    const missing = withBadArgs.t('settings.rpc.test');
    expect(missing).toBe('settings.rpc.test');
    expect(issues.at(-1)).toMatchObject({ kind: 'missing-key', key: 'settings.rpc.test', locale: 'en' });
  });

  it('formats number, date, relative time, and lists using the canonical locale', () => {
    const tr = createTranslator('de-DE', [en]);
    expect(tr.number(1234.5)).toBe('1.234,5');
    expect(tr.date(Date.UTC(2025, 0, 2))).toContain('2025');
    expect(tr.relativeTime(-2, 'day')).toMatch(/2/);
    expect(tr.list(['Äpfel', 'Birnen'])).toMatch(/Äpfel.*Birnen/);
  });

  it('does not require diagnostics to be configured', () => {
    const warn = vi.fn();
    const tr = createTranslator('en', [en]);
    expect(tr.t('settings.title')).toBe('Settings');
    expect(warn).not.toHaveBeenCalled();
  });
});
