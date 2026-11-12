// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { App } from '../App';
import { I18nProvider, useI18n } from '../i18n/context';
import * as languages from '../i18n/languages';
import { makeServices, renderWith, setHash } from '../test/render';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import ar from '../../locales/ar.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

function LocaleControl(): ReactNode {
  const { setPreference } = useI18n();
  return <button type="button" onClick={() => { setPreference('es'); }}>Switch test locale</button>;
}

describe('Pay localization', () => {
  it('translates neutral Pay labels in a draft locale while critical privacy warnings stay in English', async () => {
    const user = userEvent.setup();
    renderWith(
      <I18nProvider initialPreference="es" target={document.documentElement}>
        <App />
      </I18nProvider>,
    );
    await waitFor(() => { expect(document.documentElement.getAttribute('lang')).toBe('es'); });
    await user.click(within(screen.getByRole('navigation', { name: es.messages['app.shell.main'] })).getByRole('button', { name: es.messages['app.nav.pay'] }));

    // Neutral label: the drafted es text is allowed.
    expect(await screen.findByRole('heading', { name: 'Pagar una factura' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Pay an invoice' })).toBeNull();
    expect(screen.getByLabelText('Pegar un enlace de factura')).toBeTruthy();
    // Critical privacy warning: no reviewed translation yet, so the English source text is shown.
    expect(screen.getByText(/Pasting is safer than clicking: a browser may keep a clicked invoice URL/)).toBeTruthy();
    expect(screen.getByText('The link is read in this page only. It is never sent to a server.')).toBeTruthy();
  });

  it('changes a pending wallet-status locale without repeating the wallet request or altering submitted bytes', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    setHash(fragment);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let release: (() => void) | undefined;
    class WaitingWallet extends MockWallet {
      public override async request(args: Parameters<MockWallet['request']>[0]): Promise<unknown> {
        const result = await super.request(args);
        if (args.method === 'eth_sendTransaction') await new Promise<void>((resolve) => { release = resolve; });
        return result;
      }
    }
    const wallet = new WaitingWallet();
    const services = makeServices({
      loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
      createRpc: () => Promise.resolve(withManifestChain(mockRpc(84532, (method) => method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x'))),
      discoverWallets: () => Promise.resolve([{ id: 'test', name: 'Locale Wallet', kind: 'injected', provider: wallet }]),
    });
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    renderWith(<I18nProvider initialPreference="en" loader={(locale) => Promise.resolve(locale === 'es'
      ? { ...es, messages: { ...es.messages, 'transaction.phase.authorization': 'Esperando confirmación de cartera…' } }
      : en)} onIssue={() => undefined}><LocaleControl /><App /></I18nProvider>, services);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Connect Locale Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await user.click(await screen.findByRole('button', { name: 'Send payment in my wallet' }));
    await screen.findByText(/Waiting for wallet confirmation/);
    await waitFor(() => { expect(release).toBeDefined(); });
    const submittedBytes = JSON.stringify(wallet.sent);
    const location = window.location.hash;
    await user.click(screen.getByRole('button', { name: 'Switch test locale' }));
    await screen.findByText(/Esperando confirmación de cartera/);
    expect(JSON.stringify(wallet.sent)).toBe(submittedBytes);
    expect(window.location.hash).toBe(location);
    expect(wallet.calls.filter((entry) => entry.method === 'eth_sendTransaction')).toHaveLength(1);
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(wallet.calls.filter((entry) => entry.method === 'eth_sendTransaction')).toHaveLength(1);
  });

  // The scanner disclosure and its Clear button are both neutral keys, so draft locales render them. Two different
  // actions in one control group must never share a label (Arabic "مسح" means both "scan" and "erase").
  it.each([
    ['en', en.messages],
    ['es', es.messages],
    ['ja', ja.messages],
    ['ar', ar.messages],
  ] as const)('keeps the invoice-QR scan and clear actions distinguishable in %s', (_locale, messages) => {
    const m = messages as Record<string, string>;
    expect(m['pay.scan.summary']).toBeTruthy();
    expect(m['pay.scan.clear']).toBeTruthy();
    expect(m['pay.scan.summary']).not.toBe(m['pay.scan.clear']);
  });
});
