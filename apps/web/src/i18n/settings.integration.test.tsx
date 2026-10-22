// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { renderWith } from '../test/render';
import { I18nProvider } from './context';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

describe('Settings localization in the app', () => {
  it('translates Settings, preserves the English tamper warning, updates document direction, and falls back to English', async () => {
    const user = userEvent.setup();
    renderWith(
      <I18nProvider initialPreference="es" target={document.documentElement}>
        <App />
      </I18nProvider>,
    );

    await waitFor(() => { expect(document.documentElement.getAttribute('lang')).toBe('es'); });
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeTruthy();
    expect(screen.getByLabelText('Idioma')).toBeTruthy();
    expect(screen.getByText('Settings can be changed outside this page')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Idioma'), 'ar');
    await waitFor(() => {
      expect(document.documentElement.getAttribute('lang')).toBe('ar');
      expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    });
    expect(await screen.findByRole('heading', { name: 'الإعدادات' })).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('اللغة'), 'fr');
    await waitFor(() => {
      expect(document.documentElement.getAttribute('lang')).toBe('en');
      expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
  });
});
