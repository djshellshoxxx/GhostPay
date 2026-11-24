// @vitest-environment jsdom
import { ERC6538_ENTRY_TYPEHASH } from '@ghostpay/chain-adapters';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { I18nProvider, useI18n } from '../../i18n/context';
import * as languages from '../../i18n/languages';
import { clearSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { generateWaivedSession } from '../../test/keys';
import { mockRpc } from '../../test/mockRpc';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderWith } from '../../test/render';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';

const SEPOLIA = 11155111;
function LocaleControl(): ReactNode {
  const { setPreference } = useI18n();
  return <><button type="button" onClick={() => { setPreference('es'); }}>Test Spanish</button><button type="button" onClick={() => { setPreference('en'); }}>Test English</button></>;
}
beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

describe('registry publication outcomes retain semantic parts until render', () => {
  it.each(['publish', 'clear'] as const)('updates a %s outcome after a locale change during the wallet request, without another request or byte changes', async (action) => {
    generateWaivedSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(SEPOLIA)]: 'https://rpc.test' } }));
    let release: (() => void) | undefined;
    class WaitingWallet extends MockWallet {
      public override async request(args: Parameters<MockWallet['request']>[0]): Promise<unknown> {
        const result = await super.request(args);
        if (args.method === 'eth_sendTransaction') await new Promise<void>((resolve) => { release = resolve; });
        return result;
      }
    }
    const wallet = new WaitingWallet({ chainId: SEPOLIA });
    const rpc = mockRpc(SEPOLIA, (method, params) => {
      if (method === 'eth_getCode') return '0x6001';
      if (method === 'eth_call') return ERC6538_ENTRY_TYPEHASH;
      if (method === 'eth_getTransactionByHash') {
        const sent = wallet.sent;
        return sent === undefined ? null : { hash: params[0], from: sent['from'], to: sent['to'], input: sent['data'], value: sent['value'], chainId: `0x${SEPOLIA.toString(16)}` };
      }
      throw new Error('unexpected mock request');
    });
    renderWith(<I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? {
      ...es, messages: { ...en.messages,
        'registry.what.registration': 'Registro', 'registry.what.clear': 'Borrado',
        'registry.submitted': '{what}: {hash}.', 'registry.verified': 'Coincide con la revisión.',
        'registry.clearNote': 'El historial público permanece.', 'registry.announceSubmitted': '{what} enviado.',
      },
    } : en)}><LocaleControl /><App /></I18nProvider>, makeServices({ createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([{ id: 'test', name: 'Locale Wallet', kind: 'injected', provider: wallet }]) }));
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Locale Wallet' }));
    await user.click(await screen.findByRole('button', { name: action === 'publish' ? 'Review publish transaction' : 'Review clear transaction' }));
    await user.click(screen.getByRole('button', { name: action === 'publish' ? 'Publish to registry' : 'Clear registry entry' }));
    await waitFor(() => { expect(release).toBeTypeOf('function'); });
    const bytes = JSON.stringify(wallet.sent);
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    await act(async () => { release?.(); await Promise.resolve(); });
    const message = await screen.findByText(/Coincide con la revisión/);
    expect(message.textContent).toContain(action === 'publish' ? 'Registro:' : 'Borrado:');
    if (action === 'clear') expect(message.textContent).toContain('El historial público permanece.');
    const hash = message.textContent?.match(/0x[0-9a-f]{64}/)?.[0];
    expect(hash).toBeTruthy();
    expect(JSON.stringify(wallet.sent)).toBe(bytes);
    expect(wallet.calls.filter((request) => request.method === 'eth_sendTransaction')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    const source = await screen.findByText(/Your RPC saw the same transaction you reviewed/);
    expect(source.textContent).toContain(hash);
    expect(source.textContent).toContain(action === 'publish' ? 'Registration submitted:' : 'Clear submitted:');
    expect(JSON.stringify(wallet.sent)).toBe(bytes);
    expect(wallet.calls.filter((request) => request.method === 'eth_sendTransaction')).toHaveLength(1);
  });
});
