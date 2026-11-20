// @vitest-environment jsdom
import { act, cleanup, fireEvent, isInaccessible, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell, CORE_ORDER } from './AppShell';
import { clearSession, generateSession, getSessionPublic, revealViewingKey } from './lib/session';
import { SETTINGS_KEY, UI_PRIVACY_KEY } from './lib/settings';
import { makeServices, renderApp, renderWith, setHash } from './test/render';
import { makeParsed } from './test/invoiceFixtures';
import { MemoryTagStore, TagVault } from './lib/tags';
import { createNetworkAuthority, type NetworkAuthorization } from './lib/networkAuthorization';
import type { Services } from './lib/services';
import { backedManifest, withManifestChain } from './test/manifestChain';
import { MockWallet } from './test/mockWallet';
import { mockRpc } from './test/mockRpc';
import { useApp, type AppState } from './state';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe('required global privacy masking', () => {
  it('hides an invoice draft from display and accessibility while preserving its mounted input and sole-copy keys', async () => {
    const user = userEvent.setup();
    const session = generateSession();
    renderWith(<AppShell order={CORE_ORDER} profile="lean" />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Pay' }));
    const draft = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Paste an invoice link' });
    fireEvent.change(draft, { target: { value: '#private-invoice-draft' } });
    await user.click(screen.getByRole('switch', { name: 'Privacy mode' }));
    expect(isInaccessible(draft)).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Paste an invoice link' })).toBeNull();
    expect(getSessionPublic()).toBe(session);
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(screen.getByRole('textbox', { name: 'Paste an invoice link' })).toBe(draft);
    expect(draft.value).toBe('#private-invoice-draft');
    expect(getSessionPublic()).toBe(session);
  });

  it('starts sensitive routes masked when the user saved privacy mode', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ privacyMode: true }));
    renderWith(<AppShell order={CORE_ORDER} profile="lean" />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Pay' }));
    expect(screen.queryByRole('textbox', { name: 'Paste an invoice link' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(screen.getByRole('textbox', { name: 'Paste an invoice link' })).toBeTruthy();
  });

  // Promoted from qa_review_gen3's independent issue-286 boundary probes.
  it('masks Settings signer keys and provider credentials while keeping neutral controls accessible', async () => {
    const user = userEvent.setup();
    const pin = `02${'11'.repeat(32)}`;
    const endpoint = 'https://rpc.test/v2/PRIVATE-PROVIDER-CREDENTIAL-286';
    const seller = generateSession();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ privacyMode: true, pinnedSigners: [pin], rpcUrls: { '84532': endpoint } }));
    renderWith(<AppShell order={CORE_ORDER} profile="lean" />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    const keyField = screen.getByDisplayValue(pin);
    const providerField = screen.getByDisplayValue(endpoint);
    expect(getSessionPublic()).toBe(seller);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Reveal details for 30 seconds' })).toBeTruthy();
    expect(isInaccessible(keyField)).toBe(true);
    expect(isInaccessible(providerField)).toBe(true);
  });

  it('requires fresh reveal for a replacement encrypted invoice on the same Pay route', async () => {
    const first = await makeParsed({ encrypt: true, memo: 'FIRST-PRIVATE-INVOICE-286' });
    const next = await makeParsed({ encrypt: true, memo: 'NEXT-PRIVATE-INVOICE-286' });
    const seller = getSessionPublic();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ privacyMode: true }));
    const createRpc = vi.fn(() => Promise.reject(new Error('No RPC is needed for this privacy probe')));
    setHash(first.fragment);
    renderApp(makeServices({ createRpc }));
    const user = userEvent.setup();
    const firstMemo = await screen.findByText('FIRST-PRIVATE-INVOICE-286', { exact: false });
    expect(isInaccessible(firstMemo)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    expect(isInaccessible(firstMemo)).toBe(false);
    await act(async () => {
      setHash(next.fragment);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    const nextMemo = await screen.findByText('NEXT-PRIVATE-INVOICE-286', { exact: false });
    expect(screen.queryByText('FIRST-PRIVATE-INVOICE-286', { exact: false })).toBeNull();
    expect(createRpc).not.toHaveBeenCalled();
    expect(getSessionPublic()).toBe(seller);
    expect(isInaccessible(nextMemo)).toBe(true);
  });

  it('revokes visual reveal on explicit tag lock without deleting keys or encrypted tag history', async () => {
    const user = userEvent.setup();
    const seller = generateSession();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ privacyMode: true }));
    const store = new MemoryTagStore();
    const vault = new TagVault(store);
    await vault.unlock(revealViewingKey());
    await vault.save(84532, { stealthAddress: `0x${'a'.repeat(40)}`, announcementId: `0x${'b'.repeat(64)}:0`,
      logIndex: 0, clientLabel: 'Private client', invoiceLabel: 'Private invoice', notes: 'Retained encrypted note' });
    const ciphertext = await store.getSnapshot();
    renderWith(<AppShell order={CORE_ORDER} profile="lean" />, makeServices({ vault }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Lock tags' }));
    expect(vault.unlocked).toBe(false);
    expect(getSessionPublic()).toBe(seller);
    expect(await store.getSnapshot()).toEqual(ciphertext);
    expect(screen.getByRole('button', { name: 'Reveal details for 30 seconds' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reveal details for 30 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
    expect(await screen.findByRole('button', { name: 'Lock tags' })).toBeTruthy();
    expect(await vault.find(84532, `0x${'a'.repeat(40)}`)).toMatchObject({ clientLabel: 'Private client' });
  });

  it('preserves active preflight authority and exact execution-settings bytes when only masking changes', async () => {
    const { fragment } = await makeParsed({ encrypt: true, token: 'native', tokenAmount: '0.5' });
    const rawSettings = '{ "rpcUrls": { "84532": "https://rpc.test/" } }';
    localStorage.setItem(SETTINGS_KEY, rawSettings);
    setHash(fragment);
    const authority = createNetworkAuthority();
    const grants: NetworkAuthorization[] = [];
    const rpc = withManifestChain(mockRpc(84532, () => '0x'));
    const wallet = new MockWallet();
    const createRpc = vi.fn<Services['createRpc']>((chain, url, grant) => {
      authority.assertRpcAuthorization(grant, chain.chainId, url);
      if (grant === undefined) throw new Error('Expected real network authorization');
      grants.push(grant);
      return Promise.resolve(rpc);
    });
    try {
      renderApp(makeServices({ network: authority, createRpc,
        loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
        discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]),
      }));
      const user = userEvent.setup();
      await screen.findByText('Seller receives (net)');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
      await screen.findByRole('button', { name: 'Prepare payment' });
      expect(grants).toHaveLength(2);
      const active = grants.at(-1)!;
      expect(() => active.assertCurrent()).not.toThrow();
      await user.click(within(screen.getByRole('banner')).getByRole('switch', { name: 'Privacy mode' }));
      await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Reveal details for 30 seconds' }));
      expect(wallet.sent).toBeUndefined();
      expect(localStorage.getItem(SETTINGS_KEY)).toBe(rawSettings);
      expect(() => active.assertCurrent()).not.toThrow();
      expect(screen.getByRole('button', { name: 'Prepare payment' })).toBeTruthy();
    } finally { authority.dispose(); }
  });

  it('keeps this tab masked and reports when its privacy preference cannot be persisted', async () => {
    const user = userEvent.setup();
    renderWith(<AppShell order={CORE_ORDER} profile="lean" />);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Pay' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    await user.click(screen.getByRole('switch', { name: 'Privacy mode' }));
    expect(screen.queryByRole('textbox', { name: 'Paste an invoice link' })).toBeNull();
    expect(screen.getByText('Browser storage is unavailable, so these settings apply to this tab only.')).toBeTruthy();
  });

  it('syncs only private preferences across tabs while retaining existing execution-storage revocation', () => {
    const rawSettings = '{ "rpcUrls": { "84532": "https://rpc.test/" } }';
    localStorage.setItem(SETTINGS_KEY, rawSettings);
    const authority = createNetworkAuthority();
    let observed: AppState | undefined;
    function Observe() { observed = useApp(); return null; }
    try {
      renderWith(<AppShell order={CORE_ORDER} profile="lean" mainPrelude={<Observe />} />, makeServices({ network: authority }));
      const initial = observed!.settings;
      const grant = authority.authorize({ action: 'payment-preflight', category: 'rpc', endpoint: 'https://rpc.test/', network: { kind: 'evm', chainId: 84532 } });
      act(() => {
        localStorage.setItem(UI_PRIVACY_KEY, JSON.stringify({ privacyMode: true, clipboardClearAfterMs: 30_000 }));
        window.dispatchEvent(new StorageEvent('storage', { key: UI_PRIVACY_KEY, storageArea: localStorage }));
      });
      expect(observed!.settings.privacyMode).toBe(true);
      expect(observed!.settings.clipboardClearAfterMs).toBe(30_000);
      expect(observed!.settings.rpcUrls).toBe(initial.rpcUrls);
      expect(observed!.settings.pinnedSigners).toBe(initial.pinnedSigners);
      expect(localStorage.getItem(SETTINGS_KEY)).toBe(rawSettings);
      expect(() => grant.assertCurrent()).not.toThrow();
      act(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://other.test/' } }));
        window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY, storageArea: localStorage }));
      });
      expect(() => grant.assertCurrent()).toThrow();
      expect(observed!.settings.rpcUrls['84532']).toBe('https://other.test/');
      expect(observed!.settings.privacyMode).toBe(true);
    } finally { authority.dispose(); }
  });
});
