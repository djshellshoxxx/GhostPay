// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { I18nProvider, useI18n } from '../i18n/context';
import { SOURCE_CATALOG } from '../i18n/sourceCatalog';
import * as languages from '../i18n/languages';
import * as session from '../lib/session';
import { renderWith } from '../test/render';
import es from '../../locales/es.json';

function SwitchLanguage(): React.ReactNode {
  const { setPreference } = useI18n();
  return <button onClick={() => { setPreference('es'); }}>Spanish fixture</button>;
}
beforeEach(() => { session.clearSession(); localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { session.clearSession(); vi.restoreAllMocks(); });

describe('passphrase validation localization', () => {
  it('rerenders a visible passphrase refusal without exporting or changing seller keys', async () => {
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const loaded = session.generateSession();
    const exportKeystore = vi.spyOn(session, 'exportKeystore');
    const user = userEvent.setup();
    renderWith(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? { ...es, messages: { ...es.messages, 'error.keystore.passphraseShort': 'Reviewed passphrase fixture: minimum {minimum}' } } : SOURCE_CATALOG)}><SwitchLanguage /><App /></I18nProvider>);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
    fireEvent.change(screen.getByLabelText('Passphrase (at least 14 characters)'), { target: { value: 'short' } });
    await user.click(screen.getByRole('button', { name: 'Download encrypted keystore' }));
    expect(await screen.findByText('Use a passphrase of at least 14 characters (four random words work well).')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Reviewed passphrase fixture: minimum 14'); });
    expect(exportKeystore).not.toHaveBeenCalled();
    expect(session.getSessionPublic()).toBe(loaded);
  });
});
