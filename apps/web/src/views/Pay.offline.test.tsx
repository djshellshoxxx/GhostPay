// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { Services } from '../lib/services';
import type { WalletInfo } from '../lib/wallet';
import { makeParsed, NOW } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import { useAutoApprovedWalletDisclosures } from '../test/walletDisclosure';

let online = true;
beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => { vi.restoreAllMocks(); });

useAutoApprovedWalletDisclosures();

const loaded = (id: number): Services['loadManifest'] => () => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) });
const walletInfo = (w: MockWallet): WalletInfo => ({ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: w });

function connectivity(next: boolean): void {
  online = next;
  act(() => { window.dispatchEvent(new Event(next ? 'online' : 'offline')); });
}

async function open(wallet = new MockWallet()): Promise<{ user: ReturnType<typeof userEvent.setup>; createRpc: ReturnType<typeof vi.fn> }> {
  const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
  const createRpc = vi.fn(() => Promise.resolve(withManifestChain(mockRpc(84532, (m) => (m === 'eth_getTransactionByHash' || m === 'eth_getTransactionReceipt' ? null : '0x')))));
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  setHash(fragment);
  renderApp(makeServices({ loadManifest: loaded(84532), createRpc, discoverWallets: () => Promise.resolve([walletInfo(wallet)]) }));
  return { user: userEvent.setup(), createRpc };
}

const continueButton = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' });

describe('Pay: a connection loss fails closed and recovers only on an explicit retry', () => {
  it('reads an invoice offline without chain verification, then verifies after an explicit retry', async () => {
    online = false;
    const { user, createRpc } = await open();
    expect(await screen.findByText('Chain verification is unavailable while offline. Reconnect and check again.')).toBeTruthy();
    expect(screen.getByText(/Your browser is offline/)).toBeTruthy();
    expect(continueButton().disabled).toBe(true);
    // No retry is offered while offline, and nothing was asked of the RPC.
    expect(screen.queryByRole('button', { name: 'Retry chain verification' })).toBeNull();
    expect(createRpc).not.toHaveBeenCalled();

    connectivity(true);
    expect(screen.queryByText(/Your browser is offline/)).toBeNull();
    // Reconnecting alone does not verify anything.
    expect(continueButton().disabled).toBe(true);
    expect(createRpc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry chain verification' }));
    await waitFor(() => { expect(continueButton().disabled).toBe(false); });
    expect(createRpc).toHaveBeenCalled();
    expect(screen.queryByText(/Chain verification is unavailable while offline/)).toBeNull();
  });

  it('cancels a prepared payment when the connection drops and never offers send offline', async () => {
    const wallet = new MockWallet();
    const { user } = await open(wallet);
    await waitFor(() => { expect(continueButton().disabled).toBe(false); });
    await user.click(continueButton());
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });

    connectivity(false);
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(screen.getByText('Chain verification is unavailable while offline. Reconnect and check again.')).toBeTruthy();
    expect(continueButton().disabled).toBe(true);
    expect(wallet.sent).toBeUndefined();

    connectivity(true);
    expect(continueButton().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Retry chain verification' }));
    await waitFor(() => { expect(continueButton().disabled).toBe(false); });
    expect(wallet.sent).toBeUndefined();
  });

  it('does not carry an offline notice from the input screen to an invoice opened after reconnecting', async () => {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    // Expired when opened, so no chain check runs that would replace an older notice.
    renderApp(makeServices({ loadManifest: loaded(84532), nowMs: () => (NOW + 48 * 3600) * 1000 }));
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /^Pay$/ }));
    connectivity(false);
    connectivity(true);
    act(() => { setHash(fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(await screen.findByText('This invoice has expired.')).toBeTruthy();
    expect(screen.queryByText(/Chain verification is unavailable while offline/)).toBeNull();
  });

  it('discards a chain verification that was in flight when the connection dropped', async () => {
    let release: (() => void) | undefined;
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
    const rpc = withManifestChain(mockRpc(84532, (m) => (m === 'eth_getTransactionByHash' || m === 'eth_getTransactionReceipt' ? null : '0x')));
    const createRpc = vi.fn(() => new Promise<typeof rpc>((resolve) => { release = () => { resolve(rpc); }; }));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    setHash(fragment);
    renderApp(makeServices({ loadManifest: loaded(84532), createRpc }));
    await waitFor(() => { expect(createRpc).toHaveBeenCalled(); });
    connectivity(false);
    online = true; // The late answer arrives after reconnecting, but belongs to the cancelled check.
    await act(async () => { release?.(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(continueButton().disabled).toBe(true);
    expect(screen.getByText('Chain verification is unavailable while offline. Reconnect and check again.')).toBeTruthy();
  });
});
