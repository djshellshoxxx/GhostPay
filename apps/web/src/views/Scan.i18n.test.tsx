// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { I18nProvider, useI18n } from '../i18n/context';
import { SOURCE_CATALOG, type MessageKey } from '../i18n/catalog';
import { NEUTRAL_KEYS, SECURITY_KEYS } from '../i18n/securityKeys';
import es from '../../locales/es.json';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { clearSession, generateSession } from '../lib/session';
import type { Services } from '../lib/services';
import { SETTINGS_KEY } from '../lib/settings';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderWith } from '../test/render';

const draft = (key: string): string => (es.messages as Record<string, string>)[key] ?? `MISSING ${key}`;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function openScanIn(locale: string): Promise<void> {
  const user = userEvent.setup();
  renderWith(<I18nProvider initialPreference={locale} target={document.documentElement}><App /></I18nProvider>, makeServices());
  await user.click(within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
}

describe('Scan localization (neutral vs critical)', () => {
  it('classifies every scan.* key, and critical scan text is never marked neutral', () => {
    const keys = Object.keys(SOURCE_CATALOG.messages).filter((k) => k.startsWith('scan.'));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) expect(NEUTRAL_KEYS.has(k as MessageKey) !== SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
    for (const k of ['scan.rpcPrivacy.body', 'scan.intro', 'scan.error.backlog', 'scan.match.claimedRouter', 'scan.tags.deleteConfirm']) expect(SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
  });

  it('shows the Spanish draft for neutral labels when no keys are loaded', async () => {
    await openScanIn('es');
    expect(await screen.findByRole('heading', { level: 2, name: draft('scan.title') })).toBeTruthy();
    expect(screen.getByText(draft('scan.needKeys'))).toBeTruthy();
    expect(screen.getByRole('button', { name: draft('scan.goSeller') })).toBeTruthy();
  });

  it('keeps critical privacy text in English in a draft locale while neutral controls translate', async () => {
    generateSession();
    await openScanIn('es');
    expect(await screen.findByRole('button', { name: draft('scan.start') })).toBeTruthy();
    expect(screen.getByLabelText(draft('scan.startBlock'))).toBeTruthy();
    expect(screen.getByText('RPC privacy')).toBeTruthy();
    expect(screen.getByText(/Your RPC provider sees your IP address/)).toBeTruthy();
    expect(screen.getByText(/The worker gets public logs and your viewing key/)).toBeTruthy();
  });

  it('renders a scan error that settles after a language change in the current language, not the one at start', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let releaseRpc: (() => void) | undefined;
    let rpcRequested = false;
    const rpc = withManifestChain(chainWithLogs(84532, 10, []));
    const rpcOpened = new Promise<RpcClient>((resolve) => { releaseRpc = () => { resolve(rpc); }; });
    const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });
    function LocaleSwitch(): React.ReactNode {
      const { setPreference } = useI18n();
      return (
        <>
          <button type="button" onClick={() => { setPreference('es'); }}>Switch to es</button>
          <button type="button" onClick={() => { setPreference('en'); }}>Switch to en</button>
        </>
      );
    }
    const user = userEvent.setup();
    renderWith(
      <I18nProvider initialPreference="en" target={null}><LocaleSwitch /><App /></I18nProvider>,
      makeServices({ loadManifest: loaded, createRpc: () => { rpcRequested = true; return rpcOpened; } }),
    );
    await user.click(within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
    await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
    // No start block and no checkpoint: once RPC setup settles, the scan stops with the neutral start-block error.
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(rpcRequested).toBe(true); });
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Switch to es' }));
    expect(await screen.findByRole('heading', { level: 2, name: draft('scan.title') })).toBeTruthy();
    await act(async () => { releaseRpc?.(); await rpcOpened; });
    expect((await screen.findByRole('alert')).textContent).toContain(draft('scan.error.startBlock'));
    expect(screen.queryByText(SOURCE_CATALOG.messages['scan.error.startBlock'] ?? 'MISSING')).toBeNull();
    // The stored descriptor follows any later change too.
    await user.click(screen.getByRole('button', { name: 'Switch to en' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(SOURCE_CATALOG.messages['scan.error.startBlock']); });
  });
});
