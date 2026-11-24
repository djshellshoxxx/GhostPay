// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { approveWalletDisclosure } from '../test/walletDisclosure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuiltPayment } from '@ghostpay/chain-adapters';
import * as payExec from '../lib/payExec';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  setHash('');
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

async function connected() {
  const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
  const wallet = new MockWallet();
  const rpc = withManifestChain(mockRpc(84532, (method) => method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x'));
  const requests = vi.spyOn(rpc, 'request');
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test/' } }));
  setHash(fragment);
  renderApp(makeServices({
    loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
    createRpc: () => Promise.resolve(rpc),
    discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]),
  }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
  await approveWalletDisclosure(user, 'eth_requestAccounts');
  await screen.findByRole('button', { name: 'Prepare payment' });
  return { wallet, requests, user };
}

const banner = () => within(screen.getByRole('banner'));
const maskControl = () => banner().getByRole('switch', { name: 'Privacy mode' });
const revealControl = () => banner().getByRole('button', { name: 'Reveal details for 30 seconds' });
const finalHeading = () => screen.getByRole('heading', { name: 'Final check before your wallet' });

describe('Pay presentation privacy and prepared authority', () => {
  it('preserves the exact prepared payment through hide and reveal without more wallet or RPC requests', async () => {
    const prepare = vi.spyOn(payExec, 'preparePayment');
    const { wallet, requests, user } = await connected();
    await user.click(screen.getByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const first = prepare.mock.results[0];
    if (first?.type !== 'return') throw new Error('Expected the original preparation result');
    const prepared = await first.value;
    const heading = finalHeading();
    const settings = localStorage.getItem(SETTINGS_KEY);
    const rpcCalls = requests.mock.calls.length;
    const walletCalls = [...wallet.calls];
    await user.click(maskControl());
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    await user.click(revealControl());
    expect(finalHeading()).toBe(heading);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(requests).toHaveBeenCalledTimes(rpcCalls);
    expect(wallet.calls).toEqual(walletCalls);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(settings);
    expect(wallet.sent).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await screen.findByRole('heading', { name: 'Submitted' });
    expect(wallet.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(1);
    expect(wallet.sent).toMatchObject({ to: prepared.tx.to, data: prepared.tx.data, value: `0x${prepared.tx.value.toString(16)}` });
  });

  it.each(['privacy preference', 'execution settings'] as const)('handles an in-flight preparation after changing %s', async (change) => {
    const originalPrepare = payExec.preparePayment;
    let release!: () => void;
    let reportPrepared!: (value: BuiltPayment) => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const preparedReady = new Promise<BuiltPayment>((resolve) => { reportPrepared = resolve; });
    const prepare = vi.spyOn(payExec, 'preparePayment').mockImplementation(async (...args) => {
      const prepared = await originalPrepare(...args);
      reportPrepared(prepared);
      await gate;
      return prepared;
    });
    try {
      const { wallet, requests, user } = await connected();
      await user.click(screen.getByRole('button', { name: 'Prepare payment' }));
      await preparedReady;
      const rpcCalls = requests.mock.calls.length;
      const walletCalls = [...wallet.calls];
      if (change === 'privacy preference') await user.click(maskControl());
      else act(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://different.test/' } }));
        window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY, storageArea: localStorage }));
      });
      await act(async () => { release(); await gate; });
      if (change === 'privacy preference') {
        expect(screen.queryByText('Final check before your wallet')).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
        await user.click(revealControl());
        await waitFor(() => { expect(finalHeading()).toBeTruthy(); });
        expect(requests).toHaveBeenCalledTimes(rpcCalls);
        expect(wallet.calls).toEqual(walletCalls);
      } else expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(wallet.sent).toBeUndefined();
      expect(wallet.calls.some((call) => call.method === 'eth_sendTransaction')).toBe(false);
    } finally { release(); }
  });
});
