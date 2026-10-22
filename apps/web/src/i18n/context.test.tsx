// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n, useI18nOptional, useT } from './context';
import type { Catalog } from './catalog';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Probe(): React.ReactNode {
  const state = useI18n();
  const t = useT();
  return (
    <>
      <output data-testid="state">{`${state.status}|${state.requestedLocale}|${state.dir}|${String(state.persisted)}|${state.preference}`}</output>
      <p>{t('settings.title')}</p>
      <button type="button" onClick={() => state.setPreference('es')}>Spanish</button>
      <button type="button" onClick={() => state.setPreference('invalid-tag')}>Invalid</button>
    </>
  );
}

describe('I18n context lifecycle', () => {
  it('loads a translated catalog and updates document language and direction', async () => {
    const target = { setAttribute: vi.fn() };
    const ar: Catalog = { _meta: { locale: 'ar', status: 'test' }, messages: { 'settings.title': 'الإعدادات' } };
    render(<I18nProvider initialPreference="ar" loader={(locale) => Promise.resolve(locale === 'ar' ? ar : undefined)} target={target}><Probe /></I18nProvider>);
    expect(screen.getByTestId('state').textContent).toContain('loading|ar|ltr');
    expect(await screen.findByText('الإعدادات')).toBeTruthy();
    expect(screen.getByTestId('state').textContent).toContain('ready|ar|rtl|true|ar');
    await waitFor(() => {
      expect(target.setAttribute).toHaveBeenCalledWith('lang', 'ar');
      expect(target.setAttribute).toHaveBeenCalledWith('dir', 'rtl');
    });
  });

  it('falls back to English on catalog load failure and records the error state', async () => {
    const target = { setAttribute: vi.fn() };
    render(<I18nProvider initialPreference="es" loader={() => Promise.reject(new Error('offline'))} target={target}><Probe /></I18nProvider>);
    expect(screen.getByTestId('state').textContent).toContain('loading|es');
    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(screen.getByTestId('state').textContent).toContain('error|es|ltr|true|es');
    await waitFor(() => { expect(target.setAttribute).toHaveBeenCalledWith('lang', 'en'); });
  });

  it('ignores invalid preferences and applies a valid choice when browser storage rejects it', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage disabled'); });
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" target={null}><Probe /></I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Invalid' }));
    expect(screen.getByTestId('state').textContent).toContain('ready|en|ltr|true|en');
    await user.click(screen.getByRole('button', { name: 'Spanish' }));
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toContain('ready|es|ltr|false|es'); });
  });

  it('supports optional context access and rejects required access without its provider', () => {
    function OptionalProbe(): React.ReactNode { return <output>{String(useI18nOptional() === undefined)}</output>; }
    render(<OptionalProbe />);
    expect(screen.getByText('true')).toBeTruthy();
    function RequiredProbe(): React.ReactNode { useI18n(); return null; }
    expect(() => render(<RequiredProbe />)).toThrow('I18nProvider missing');
  });
});
