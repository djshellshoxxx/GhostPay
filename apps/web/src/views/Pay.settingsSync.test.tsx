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

type Around = (method: string, params: readonly unknown[], answer: () => Promise<unknown>) => Promise<unknown>;

/** Opens an invoice up to its review; `around` can hold an RPC answer. */
async function toReview(wallet: MockWallet, around?: Around): Promise<{ user: ReturnType<typeof userEvent.setup>; opened: () => string[] }> {
  if (window.localStorage.getItem(SETTINGS_KEY) === null) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(BASE));
  const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
  const createRpc = vi.fn<Services['createRpc']>(() => {
    const rpc = withManifestChain(mockRpc(84532, (method) => (method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x')));
    return Promise.resolve(around === undefined ? rpc : { ...rpc, request: (method: string, params: readonly unknown[]) => around(method, params, () => rpc.request(method, params)) });
  });
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
  setHash(fragment);
  renderApp(makeServices({ createRpc, loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }), discoverWallets: () => Promise.resolve([info]) }));
  const user = userEvent.setup();
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: /^(?:Continue|Start the delay)$/ }).disabled).toBe(false); });
  return { user, opened: () => createRpc.mock.calls.map((call) => call[1]) };
}

async function toPrepared(wallet: MockWallet, around?: Around): Promise<{ user: ReturnType<typeof userEvent.setup>; opened: () => string[] }> {
  const { user, opened } = await toReview(wallet, around);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
  await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
  await screen.findByRole('heading', { name: FINAL });
  return { user, opened };
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

  it('asks the wallet for nothing when the RPC changes while the send is still being checked', async () => {
    let hold = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let held = 0;
    const wallet = new MockWallet();
    const { user } = await toPrepared(wallet, async (method, params, answer) => {
      if (hold && method === 'eth_call' && (params[0] as { from?: string }).from === wallet.account) { held++; await gate; }
      return answer();
    });
    hold = true;
    await user.click(screen.getByRole('button', { name: SEND }));
    await waitFor(() => { expect(held).toBe(1); });
    otherTabSaves(OTHER_RPC);
    await act(async () => { release(); await Promise.resolve(); });
    expect(await screen.findByText(/Check the details again/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Prepare payment' })).toBeTruthy();
    expect(wallet.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
    expect(readAttempts()).toEqual([]);
  });

  it('cancels a running delay when the RPC changes', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...BASE, delayMinSec: 60, delayMaxSec: 60 }));
    const wallet = new MockWallet();
    const { user } = await toReview(wallet);
    await user.click(screen.getByLabelText(/Wait a random time first/));
    await user.click(screen.getByRole('button', { name: 'Start the delay' }));
    await screen.findByText('Scheduled locally. Nothing has been signed or broadcast.');
    otherTabSaves({ ...OTHER_RPC, delayMinSec: 60, delayMaxSec: 60 });
    expect(await screen.findByText(/Check the details again/)).toBeTruthy();
    expect(screen.queryByText('Scheduled locally. Nothing has been signed or broadcast.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start the delay' })).toBeTruthy();
    expect(wallet.calls).toEqual([]);
  });

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
