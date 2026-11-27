// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAttempts } from '../lib/duplicateAttemptJournal';
import type { Services } from '../lib/services';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { MockWallet } from '../test/mockWallet';
import { makeServices, renderApp, setHash } from '../test/render';
import { useAutoApprovedWalletDisclosures } from '../test/walletDisclosure';

const BASE = { rpcUrls: { '84532': 'https://rpc.test' } };
const OTHER_RPC = { rpcUrls: { '84532': 'https://other.test' } };
const PINS = { pinnedSigners: [`02${'11'.repeat(32)}`] };
const HASH = `0x${'9'.repeat(64)}`;
const SEND = 'Send payment in my wallet';
const FINAL = 'Final check before your wallet';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
});
useAutoApprovedWalletDisclosures();

function otherTabSaves(patch: Record<string, unknown>): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...BASE, ...patch }));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY })); });
}

async function toPrepared(wallet: MockWallet): Promise<{ user: ReturnType<typeof userEvent.setup>; opened: () => string[] }> {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(BASE));
  const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
  const createRpc = vi.fn<Services['createRpc']>(() => Promise.resolve(withManifestChain(mockRpc(84532, (method) => (method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x')))));
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
  setHash(fragment);
  renderApp(makeServices({ createRpc, loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }), discoverWallets: () => Promise.resolve([info]) }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
  await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
  await screen.findByRole('heading', { name: FINAL });
  return { user, opened: () => createRpc.mock.calls.map((call) => call[1]) };
}

/** A wallet whose send prompt stays open until released. */
function holdingWallet(): { wallet: MockWallet; asked: () => number; release: () => void } {
  const wallet = new MockWallet();
  const real = wallet.request.bind(wallet);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const request = vi.spyOn(wallet, 'request').mockImplementation(async (args) => {
    if (args.method === 'eth_sendTransaction') await gate;
    return real(args);
  });
  return { wallet, release: () => { release(); }, asked: () => request.mock.calls.filter(([args]) => args.method === 'eth_sendTransaction').length };
}

describe('Pay: settings saved by another tab', () => {
  it('drops a prepared payment when the RPC changes, asks the wallet for nothing and prepares again on the new one', async () => {
    const wallet = new MockWallet();
    const { user, opened } = await toPrepared(wallet);
    otherTabSaves(OTHER_RPC);
    await waitFor(() => { expect(screen.queryByRole('heading', { name: FINAL })).toBeNull(); });
    expect(screen.getByText(/Check the details again/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: SEND })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: FINAL });
    expect(opened().at(-1)).toBe('https://other.test/');
    expect(wallet.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
  });

  it.each([['the RPC', OTHER_RPC], ['the signer pins', PINS], ['the theme', { theme: 'light' }]] as const)(
    'keeps the outcome of a payment already in the wallet when %s changes',
    async (_name, patch) => {
      const held = holdingWallet();
      const { user } = await toPrepared(held.wallet);
      await user.click(screen.getByRole('button', { name: SEND }));
      await waitFor(() => { expect(held.asked()).toBe(1); });

      otherTabSaves(patch);
      await act(async () => { held.release(); await Promise.resolve(); });

      await screen.findByRole('heading', { name: 'Submitted' });
      expect(document.body.textContent).toContain(HASH);
      expect(screen.queryByRole('button', { name: SEND })).toBeNull();
      expect(readAttempts().filter((attempt) => attempt.hash === HASH)).toHaveLength(1);
      expect(held.asked()).toBe(1);
    },
  );

  it.each([['the RPC', OTHER_RPC], ['the signer pins', PINS]] as const)(
    'keeps a shown outcome when %s changes afterwards',
    async (_name, patch) => {
      const wallet = new MockWallet();
      const { user } = await toPrepared(wallet);
      await user.click(screen.getByRole('button', { name: SEND }));
      await screen.findByRole('heading', { name: 'Submitted' });
      otherTabSaves(patch);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(screen.getByRole('heading', { name: 'Submitted' })).toBeTruthy();
      expect(document.body.textContent).toContain(HASH);
      expect(screen.getByRole('button', { name: 'Download local receipt' })).toBeTruthy();
    },
  );
});
