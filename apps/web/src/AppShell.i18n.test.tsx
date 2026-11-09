// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { I18nProvider, useI18n } from './i18n/context';
import { clearSession } from './lib/session';
import { renderWith } from './test/render';
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
});
