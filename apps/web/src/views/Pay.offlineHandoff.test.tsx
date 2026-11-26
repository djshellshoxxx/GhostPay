// @vitest-environment jsdom
// A connection loss while wallet work has not reached the wallet: the pending request is refused, even after the browser
// reconnects, and nothing is sent. Disclosures are approved one by one here, so the loss can happen while one is open.
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import { approveWalletDisclosure } from '../test/walletDisclosure';

const OFFLINE = 'Chain verification is unavailable while offline. Reconnect and check again.';
const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const word = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

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

function connectivity(next: boolean): void {
  online = next;
  act(() => { window.dispatchEvent(new Event(next ? 'online' : 'offline')); });
}

/** A wallet that signs the first transaction and refuses every later one, recording all requests. */
class OneSendWallet extends MockWallet {
  private sends = 0;
  public override request(args: Parameters<MockWallet['request']>[0]): Promise<unknown> {
    if (args.method === 'eth_sendTransaction' && ++this.sends > 1) {
      this.calls.push({ method: args.method, params: args.params });
      return Promise.reject(Object.assign(new Error('user rejected'), { code: 4001 }));
    }
    return super.request(args);
  }
}

/** Opens a 100 USDC invoice up to the wallet list. `allowance` answers every token read. */
async function toWalletList(wallet: MockWallet, allowance: () => unknown = () => word(10n ** 12n)): Promise<ReturnType<typeof userEvent.setup>> {
  const { fragment } = await makeParsed();
  const rpc = mockRpc(84532, (method, params) => {
    if (method === 'eth_call') return allowance();
    const sent = wallet.sent;
    if (method === 'eth_getTransactionByHash') {
      return sent === undefined ? null : { hash: params[0], from: sent['from'], to: sent['to'], input: sent['data'], value: sent['value'], chainId: '0x14a34' };
    }
    if (method === 'eth_getTransactionReceipt') return { transactionHash: params[0], status: '0x1', blockNumber: '0x64', to: sent?.['to'] };
    if (method === 'eth_gasPrice') return '0x3b9aca00';
    throw new Error(`unexpected ${method}`);
  });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  setHash(fragment);
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
  renderApp(makeServices({
    loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
    createRpc: () => Promise.resolve(withManifestChain(rpc)), discoverWallets: () => Promise.resolve([info]),
  }));
  const user = userEvent.setup();
  const proceed = await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' });
  await waitFor(() => { expect(proceed.disabled).toBe(false); });
  await user.click(proceed);
  return user;
}

async function connect(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
  await approveWalletDisclosure(user, 'eth_requestAccounts');
}

const asked = (wallet: MockWallet, method: string): number => wallet.calls.filter((c) => c.method === method).length;
const dialogClosed = (): Promise<void> => waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Review wallet disclosure' })).toBeNull(); });

describe('Pay: a connection loss before the wallet is asked', () => {
  it.each([['stays offline', false], ['reconnects', true]] as const)('asks for no account when the browser %s during the connection review', async (_, reconnects) => {
    const wallet = new MockWallet();
    const user = await toWalletList(wallet);
    await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
    await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
    connectivity(false);
    if (reconnects) connectivity(true);
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    await dialogClosed();
    await waitFor(() => { expect(screen.getAllByText(OFFLINE).length).toBeGreaterThan(0); });
    expect(asked(wallet, 'eth_requestAccounts')).toBe(0);
  });

  it('discards a preparation that spanned a connection loss and asks the wallet for no signature', async () => {
    const wallet = new MockWallet();
    let hold = false;
    let release: (() => void) | undefined;
    const user = await toWalletList(wallet, () => {
      if (!hold) return word(10n ** 12n);
      hold = false;
      return new Promise((resolve) => { release = () => { resolve(word(10n ** 12n)); }; });
    });
    await connect(user);
    const prepare = await screen.findByRole('button', { name: 'Prepare payment' });
    hold = true;
    await user.click(prepare);
    await waitFor(() => { expect(release).toBeDefined(); });
    connectivity(false);
    connectivity(true);
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(await screen.findByRole('button', { name: 'Retry chain verification' })).toBeTruthy();
    expect(screen.getByText(OFFLINE)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    expect(asked(wallet, 'eth_signTypedData_v4') + asked(wallet, 'eth_sendTransaction')).toBe(0);
  });

  it('sends no revocation when the connection drops during its review, and keeps the granted allowance', async () => {
    const wallet = new OneSendWallet();
    // The permit domain cannot be read (a zero word), so the exact approval path is used; it takes effect once sent.
    const user = await toWalletList(wallet, () => word((wallet.sent?.['to'] as string | undefined)?.toLowerCase() === USDC ? 10n ** 12n : 0n));
    await connect(user);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await user.click(await screen.findByRole('button', { name: 'Approve exactly, then send payment in my wallet' }, { timeout: 5000 }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    // The confirmed allowance is shown before the payment request is reviewed; that request is declined here.
    await screen.findByText('Revoke approval', undefined, { timeout: 5000 });
    await screen.findByRole('dialog', { name: 'Review wallet disclosure' }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Cancel wallet request' }));
    await dialogClosed();
    const revoke = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>('button', { name: 'Revoke approval' });
    await waitFor(() => { expect(revoke().disabled).toBe(false); });
    await user.click(revoke());
    await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
    connectivity(false);
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await dialogClosed();
    await waitFor(() => { expect(screen.getAllByText(OFFLINE).length).toBeGreaterThan(0); });
    expect(asked(wallet, 'eth_sendTransaction')).toBe(1);
    expect(revoke()).toBeTruthy();
  });
});
