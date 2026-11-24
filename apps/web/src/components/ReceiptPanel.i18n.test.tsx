// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_CATALOG } from '../i18n/catalog';
import { I18nProvider, useI18n } from '../i18n/context';
import * as languages from '../i18n/languages';
import es from '../../locales/es.json';
import ar from '../../locales/ar.json';
import { clearSession, generateSession } from '../lib/session';
import type { ScanMatch } from '../lib/scanClient';
import { ReceiptPanel } from './ReceiptPanel';

function match(): ScanMatch {
  return {
    chainId: 84532,
    announcement: { transactionHash: `0x${'c'.repeat(64)}` },
    stealthAddress: `0x${'a'.repeat(40)}`,
    metadata: { kind: 'erc20', token: `0x${'b'.repeat(40)}`, netAmount: 123_456n, viewTag: 1 },
    viaRouter: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
}
function SwitchLocale(): React.ReactNode {
  const { setPreference } = useI18n();
  return <><button onClick={() => { setPreference('es'); }}>Spanish fixture</button><button onClick={() => { setPreference('ar'); }}>Arabic fixture</button></>;
}

beforeEach(clearSession);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ReceiptPanel locale changes', () => {
  it('translates neutral labels while keeping consent, receipts and their exact JSON unchanged', async () => {
    const seller = generateSession();
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined}><SwitchLocale /><ReceiptPanel match={match()} sellerSignerPublicKey={seller.signerPublicKey} profile="full" /></I18nProvider>);
    await user.type(screen.getByLabelText('Invoice digest (entered manually)'), `0x${'d'.repeat(64)}`);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    const json = screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value;
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await waitFor(() => { expect(screen.getAllByText(es.messages['receipt.network'])).toHaveLength(2); });
    expect(screen.getByText(SOURCE_CATALOG.messages['receipt.attestation'] ?? '')).toBeTruthy();
    expect(screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value).toBe(json);
    await user.click(screen.getByRole('button', { name: 'Arabic fixture' }));
    await waitFor(() => { expect(screen.getAllByText(ar.messages['receipt.transaction'])).toHaveLength(2); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value).toBe(json);
    expect(screen.getByLabelText('Signed receipt JSON').getAttribute('dir')).toBe('ltr');
    expect(screen.getByLabelText('Signed invoice link or fragment').getAttribute('dir')).toBe('ltr');
  });

  it('reformats an existing typed error after a language change without re-running signing', async () => {
    // Simulates a future human-reviewed locale, without changing the production review registry.
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const seller = generateSession();
    const user = userEvent.setup();
    render(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? {
      _meta: es._meta,
      messages: { ...es.messages, 'receipt.validation.digest': 'Reviewed Spanish digest error fixture' },
    } : SOURCE_CATALOG)}><SwitchLocale /><ReceiptPanel match={match()} sellerSignerPublicKey={seller.signerPublicKey} profile="full" /></I18nProvider>);
    await user.type(screen.getByLabelText('Invoice digest (entered manually)'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    expect(screen.getByRole('alert').textContent).toContain('Receipt invoice digest is invalid.');
    await user.click(screen.getByRole('button', { name: 'Spanish fixture' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Reviewed Spanish digest error fixture'); });
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });
});
