// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { expect, it, vi } from 'vitest';
import { SOURCE_CATALOG, type Catalog, type CatalogLoader } from './catalog';
import { I18nProvider } from './context';
import { LanguagePicker } from './LanguagePicker';
import { LOCALE_STORAGE_KEY } from './storage';

const fuzz = { seed: 5512026, numRuns: 64 };
const locales = ['ar', 'es', 'ja', 'fr'] as const;
const labels = { en: 'Language', ar: 'اللغة', es: 'Idioma', ja: '言語' } as const;
const silent = (): void => undefined;

it('resolves Automatic from the browser list or the available primary language', async () => {
  const regions = fc.constantFrom(
    { tag: 'ar-EG', locale: 'ar' } as const,
    { tag: 'es-419', locale: 'es' } as const,
    { tag: 'ja-JP', locale: 'ja' } as const,
  );
  const browser = fc.record({
    primary: fc.option(regions),
    preferred: regions,
    unsupported: fc.array(fc.stringMatching(/^[0-9!]{1,8}$/), { maxLength: 4 }),
    mode: fc.constantFrom('available', 'empty', 'unreadable'),
  });
  await fc.assert(fc.asyncProperty(browser, async ({ primary, preferred, unsupported, mode }) => {
    try {
      vi.spyOn(navigator, 'language', 'get').mockImplementation(() => {
        if (primary === null) throw new Error('primary language unavailable');
        return primary.tag;
      });
      vi.spyOn(navigator, 'languages', 'get').mockImplementation(() => {
        if (mode === 'unreadable') throw new Error('language list unavailable');
        return mode === 'available' ? [...unsupported, preferred.tag, 'en'] : [];
      });
      render(<I18nProvider onIssue={silent}><LanguagePicker /></I18nProvider>);
      const expected = mode === 'available' ? preferred.locale : primary?.locale ?? 'en';
      const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: labels[expected] });
      expect(select.value).toBe('auto');
      await waitFor(() => {
        expect(document.documentElement.lang).toBe(expected);
        expect(document.documentElement.dir).toBe(expected === 'ar' ? 'rtl' : 'ltr');
      });
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  }), { ...fuzz, examples: [[{
    primary: { tag: 'ar-EG', locale: 'ar' }, preferred: { tag: 'ja-JP', locale: 'ja' }, unsupported: [], mode: 'unreadable',
  }]] });
}, 30_000);

it('keeps the latest selection when catalog requests finish in different orders', async () => {
  const locale = fc.constantFrom(...locales);
  const different = fc.tuple(locale, locale, locale).filter(tags => new Set(tags).size === 3);
  const order = fc.shuffledSubarray([0, 1, 2] as const, { minLength: 3, maxLength: 3 });
  await fc.assert(fc.asyncProperty(different, fc.boolean(), order, fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
    async (choices, revisitFirst, completionOrder, failures) => {
      const [first, manual, third] = choices;
      const last = revisitFirst ? first : third;
      const requests: { locale: string; finish: (fail: boolean) => void }[] = [];
      const loader: CatalogLoader = (locale) => {
        if (locale === 'en') return Promise.resolve(SOURCE_CATALOG);
        return new Promise<Catalog | undefined>((resolve, reject) => {
          requests.push({ locale, finish: (fail) => {
            if (fail) reject(new Error('catalog unavailable'));
            else if (locale === 'ar' || locale === 'ja' || locale === 'es') {
              resolve({ _meta: { locale, status: 'test' }, messages: { 'i18n.picker.label': labels[locale] } });
            } else resolve(undefined);
          } });
        });
      };
      try {
        const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en']);
        const view = render(<I18nProvider loader={loader} onIssue={silent}><LanguagePicker /></I18nProvider>);
        const select = screen.getByRole<HTMLSelectElement>('combobox');
        languages.mockReturnValue([first]);
        fireEvent(window, new Event('languagechange'));
        fireEvent.change(select, { target: { value: manual } });
        languages.mockReturnValue([last]);
        fireEvent(window, new Event('languagechange'));
        expect(select.value).toBe(manual);
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(manual);
        expect(requests.map(r => r.locale)).toEqual([first, manual]);
        fireEvent.change(select, { target: { value: 'auto' } });
        expect(requests.map(r => r.locale)).toEqual([first, manual, last]);
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();

        let latestFinished = false;
        for (const index of completionOrder) {
          await act(async () => {
            requests[index]!.finish(failures[index]);
            await Promise.resolve();
          });
          if (index === 2) latestFinished = true;
          const visible = latestFinished && !failures[2] && last !== 'fr' ? last : 'en';
          expect(view.getByRole('combobox', { name: labels[visible] })).toBe(select);
          expect(select.getAttribute('aria-busy')).toBe(String(!latestFinished));
          expect(document.documentElement.lang).toBe(visible);
          expect(document.documentElement.dir).toBe(visible === 'ar' ? 'rtl' : 'ltr');
          expect(view.queryByRole('alert') !== null).toBe(latestFinished && failures[2]);
        }
      } finally {
        cleanup();
        localStorage.clear();
        vi.restoreAllMocks();
      }
    }), fuzz);
}, 30_000);
