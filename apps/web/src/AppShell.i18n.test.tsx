// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { I18nProvider, useI18n } from './i18n/context';
import { clearSession } from './lib/session';
import { makeServices, renderWith } from './test/render';
import { SETTINGS_KEY } from './lib/settings';
import { SOURCE_CATALOG } from './i18n/catalog';
import { SOURCE_TRANSLATOR } from './i18n/source';
import es from '../locales/es.json';
import ar from '../locales/ar.json';

function SwitchLanguage(): React.ReactNode {
  const { setPreference } = useI18n();
  return <><button onClick={() => { setPreference('es'); }}>Spanish fixture</button><button onClick={() => { setPreference('ar'); }}>Arabic fixture</button></>;
}
beforeEach(() => { clearSession(); localStorage.clear(); history.replaceState(null, '', '/'); });

describe('navigation localization', () => {
  it('translates neutral routes while preserving the selected route and unsubmitted input', async () => {
    const user = userEvent.setup();
    renderWith(<I18nProvider initialPreference="en" onIssue={() => undefined}><SwitchLanguage /><App /></I18nProvider>);
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.click(nav.getByRole('button', { name: 'Pay' }));
    const input = document.querySelector<HTMLTextAreaElement>('#paste')!;
    fireEvent.change(input, { target: { value: '#ghostpay-unsubmitted-fixture' } });
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    expect((await nav.findByRole('button', { name: es.messages['app.nav.pay'] })).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('button', { name: es.messages['app.nav.settings'] }).getAttribute('data-view')).toBe('settings');
    await user.click(screen.getByRole('button', { name: 'Arabic fixture' }));
    expect((await nav.findByRole('button', { name: ar.messages['app.nav.pay'] })).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('button', { name: 'Seller keys' })).toBeTruthy();
    expect(nav.getByRole('button', { name: 'Public registry' })).toBeTruthy();
    expect(nav.getByRole('button', { name: 'About and privacy' })).toBeTruthy();
    expect(document.querySelector('#paste')).toBe(input);
    expect(input.value).toBe('#ghostpay-unsubmitted-fixture');
    expect(input.getAttribute('dir')).toBe('ltr');
    expect(location.hash).toBe('');
  });

  it('localizes landmarks and the skip link while preserving critical English disclosures', async () => {
    const user = userEvent.setup();
    renderWith(<I18nProvider initialPreference="es" onIssue={() => undefined}><App /></I18nProvider>);
    const skip = await screen.findByRole('link', { name: es.messages['app.shell.skip'] });
    expect(screen.getByRole('navigation', { name: es.messages['app.shell.main'] })).toBeTruthy();
    expect(screen.getByText(SOURCE_TRANSLATOR.t('app.shell.tagline'))).toBeTruthy();
    expect(screen.getByText(SOURCE_TRANSLATOR.t('app.shell.footer'))).toBeTruthy();
    await user.click(skip);
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('opens support and source links separately so the current memory-only session is retained', () => {
    renderWith(<App />);
    for (const [name, href] of [
      ['Help and getting started', './help.html'],
      ['Privacy and verification limits', './privacy.html'],
      ['Source repository', 'https://github.com/djshellshoxxx/GhostPay'],
    ]) {
      const link = screen.getByRole('link', { name: `${name} (opens in a new tab)` });
      expect(link.getAttribute('href')).toBe(href);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
  });

  it('does not reset the security idle deadline when only the language changes', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
    const services = makeServices();
    let changeLanguage: ((locale: string) => void) | undefined;
    function Switch(): React.ReactNode { changeLanguage = useI18n().setPreference; return null; }
    const loader = (locale: string) => Promise.resolve(locale === 'es' ? es : SOURCE_CATALOG);
    vi.useFakeTimers();
    try {
      renderWith(<I18nProvider initialPreference="en" loader={loader} onIssue={() => undefined}><Switch /><App /></I18nProvider>, services);
      await services.vault.unlock(new Uint8Array(32).fill(3));
      act(() => { vi.advanceTimersByTime(30_000); });
      await act(async () => { changeLanguage?.('es'); await Promise.resolve(); });
      expect(document.documentElement.lang).toBe('es');
      act(() => { vi.advanceTimersByTime(30_001); });
      expect(services.vault.unlocked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => { expect(screen.getByText(SOURCE_TRANSLATOR.t('app.idle.tagsLocked'))).toBeTruthy(); });
  });
});
