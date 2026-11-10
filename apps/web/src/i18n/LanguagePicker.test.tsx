// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_CATALOG, type Catalog } from './catalog';
import { I18nProvider } from './context';
import { LanguagePicker } from './LanguagePicker';
import { LOCALE_STORAGE_KEY } from './storage';
import { SOURCE_TRANSLATOR } from './source';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const silent = (): void => undefined;

describe('native language picker', () => {
  it('has a labelled native select with native language names, explicit review state and honest missing-catalog options', () => {
    render(<I18nProvider initialPreference="en" onIssue={silent}><LanguagePicker allowPseudo={false} /></I18nProvider>);
    const select = screen.getByRole('combobox', { name: 'Language' });
    expect(select.tagName).toBe('SELECT');
    expect(select.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Español/ }).textContent).toMatch(/machine|draft/i);
    expect(screen.getByRole('option', { name: /Français/ }).textContent).toMatch(/English|catalog/i);
    expect(screen.getByRole('option', { name: /العربية/ }).getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('option', { name: /日本語/ }).getAttribute('lang')).toBe('ja');
    expect(screen.queryByRole('option', { name: /Pseudo/ })).toBeNull();
  });

  it('preserves the selected language after remount and supports the browser-default choice', async () => {
    const user = userEvent.setup();
    const first = render(<I18nProvider initialPreference="en" onIssue={silent}><LanguagePicker allowPseudo={false} /></I18nProvider>);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
    await user.selectOptions(screen.getByRole('combobox'), 'ja');
    await waitFor(() => { expect(document.documentElement.lang).toBe('ja'); });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
    first.unmount();
    render(<I18nProvider languages={['en']} onIssue={silent}><LanguagePicker allowPseudo={false} /></I18nProvider>);
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('ja');
    await user.selectOptions(screen.getByRole('combobox'), 'auto');
    await waitFor(() => { expect(document.documentElement.lang).toBe('en'); });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('announces loading and catalog failure while retaining an operable selector', async () => {
    let rejectLoad: ((reason: Error) => void) | undefined;
    const pending = new Promise<Catalog>((_resolve, reject) => { rejectLoad = reject; });
    const loader = (locale: string): Promise<Catalog> => locale === 'es' ? pending : Promise.resolve(SOURCE_CATALOG);
    render(<I18nProvider initialPreference="en" loader={loader} onIssue={silent}><LanguagePicker allowPseudo={false} /></I18nProvider>);
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    fireEvent.change(select, { target: { value: 'es' } });
    expect(select.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe(SOURCE_CATALOG.messages['i18n.picker.loading']);
    await act(async () => { rejectLoad?.(new Error('catalog unavailable')); await pending.catch(() => undefined); });
    expect(select.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('alert').textContent).toBe(SOURCE_CATALOG.messages['i18n.loadFailed']);
    expect(select.hasAttribute('disabled')).toBe(false);
  });

  it('explains when a storage failure leaves the choice local to the current page', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<I18nProvider initialPreference="en" onIssue={silent}><LanguagePicker allowPseudo={false} /></I18nProvider>);
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    fireEvent.change(select, { target: { value: 'fr' } });
    await waitFor(() => { expect(select.getAttribute('aria-busy')).toBe('false'); });
    expect(select.value).toBe('fr');
    expect(document.documentElement.lang).toBe('en');
    const status = screen.getByText(SOURCE_TRANSLATOR.t('i18n.picker.notPersisted'));
    expect(select.getAttribute('aria-describedby')?.split(' ')).toContain(status.id);
    expect(status.getAttribute('role')).toBe('status');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });
});
