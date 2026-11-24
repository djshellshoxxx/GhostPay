// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '../i18n/context';
import { SOURCE_CATALOG } from '../i18n/sourceCatalog';
import * as languages from '../i18n/languages';
import * as qr from '../lib/qr';
import es from '../../locales/es.json';
import ar from '../../locales/ar.json';
import { QrView } from './QrView';

function SwitchLanguage(): React.ReactNode {
  const { setPreference } = useI18n();
  return <><button onClick={() => { setPreference('es'); }}>Spanish fixture</button><button onClick={() => { setPreference('ar'); }}>Arabic fixture</button></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('QR renderer localization', () => {
  it('changes auxiliary labels without regenerating or modifying the QR payload', async () => {
    const make = vi.spyOn(qr, 'makeQr');
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined}><SwitchLanguage /><QrView text="https://example.test/#public-fixture" caption="Public invoice fixture" /></I18nProvider>);
    const path = screen.getByRole('img').querySelector('path')?.getAttribute('d');
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await screen.findByRole('button', { name: es.messages['qrView.download'] });
    await user.click(screen.getByRole('button', { name: 'Arabic fixture' }));
    await screen.findByRole('button', { name: ar.messages['qrView.download'] });
    expect(screen.getByRole('img').querySelector('path')?.getAttribute('d')).toBe(path);
    expect(make).toHaveBeenCalledExactlyOnceWith('https://example.test/#public-fixture');
  });

  it('redacts arbitrary failures and keeps failure details on reviewed-English fallback', async () => {
    vi.spyOn(qr, 'makeQr').mockImplementation(() => { throw new Error('private bearer material'); });
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? { ...es, messages: { ...es.messages, 'qrView.unavailable': 'UNREVIEWED FAILURE' } } : SOURCE_CATALOG)}><SwitchLanguage /><QrView text="public" caption="Public" /></I18nProvider>);
    expect(screen.getByText('QR code unavailable.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await screen.findByText(es.messages['qrView.none']);
    expect(screen.getByText('QR code unavailable.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private bearer');
    expect(document.body.textContent).not.toContain('UNREVIEWED');
  });

  it('rerenders an existing public error after reviewed language change without retrying QR generation', async () => {
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const make = vi.spyOn(qr, 'makeQr');
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? { ...es, messages: { ...es.messages, 'error.qr.thisLinkIsTooLongForAQRCodeShare': 'Reviewed QR capacity fixture' } } : SOURCE_CATALOG)}><SwitchLanguage /><QrView text={'x'.repeat(5000)} caption="Long" /></I18nProvider>);
    expect(screen.getByText(/This link is too long for a QR code/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await waitFor(() => { expect(screen.getByText('Reviewed QR capacity fixture')).toBeTruthy(); });
    expect(make).toHaveBeenCalledOnce();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
