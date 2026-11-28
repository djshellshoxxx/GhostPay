// @vitest-environment jsdom
// A wallet change and a connection loss, in either order. A public invoice whose payment was requested stays terminal; one
// that was never requested returns to the review with its explicit chain check and never resumes by itself.
import type { RpcClient } from '@ghostpay/chain-adapters';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAttempts } from '../lib/duplicateAttemptJournal';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import { useAutoApprovedWalletDisclosures } from '../test/walletDisclosure';

const OFFLINE = 'Chain verification is unavailable while offline. Reconnect and check again.';
const RETRY = 'Retry chain verification';
const WAIT = { timeout: 10_000 };

let online = true;
beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setHash('');
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

useAutoApprovedWalletDisclosures();

class EventWallet extends MockWallet {
  private readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(listener); this.listeners.set(event, set);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
}

function connectivity(next: boolean): void {
  online = next;
  act(() => { window.dispatchEvent(new Event(next ? 'online' : 'offline')); });
}

type Order = 'wallet change first' | 'connection loss first';
type Change = 'accountsChanged' | 'chainChanged';

function disrupt(wallet: EventWallet, order: Order, change: Change): void {
  const revoke = (): void => { act(() => { wallet.emit(change); }); };
  if (order === 'wallet change first') { revoke(); connectivity(false); }
  else { connectivity(false); revoke(); }
}

const settle = (): Promise<void> => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

/** Opens a public native invoice and connects the wallet. `reads` counts every checkout RPC call. */
async function toConnected(wallet: EventWallet) {
  const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.5' });
  let calls = 0;
  const inner = withManifestChain(mockRpc(84532, () => '0x'));
  const rpc: RpcClient = {
    chainId: inner.chainId,
    request: (method, params) => { calls++; return inner.request(method, params); },
    blockNumber: () => { calls++; return inner.blockNumber(); },
    getBlock: (number) => { calls++; return inner.getBlock(number); },
    getLogs: (filter) => { calls++; return inner.getLogs(filter); },
  };
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  setHash(fragment);
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
  renderApp(makeServices({
    loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
    createRpc: () => Promise.resolve(rpc), discoverWallets: () => Promise.resolve([info]),
  }));
  const user = userEvent.setup();
  const proceed = await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' }, WAIT);
  await waitFor(() => { expect(proceed.disabled).toBe(false); }, WAIT);
  await user.click(proceed);
  await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }, WAIT));
  await screen.findByRole('button', { name: 'Prepare payment' }, WAIT);
  return { user, reads: (): number => calls };
}

async function prepare(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Prepare payment' }));
  await screen.findByRole('heading', { name: 'Final check before your wallet' }, WAIT);
}

/** Account, signing and network requests; reads of the current account or chain are not counted. */
const asked = (wallet: EventWallet): number => wallet.calls.filter(({ method }) => /^(?:eth_requestAccounts|eth_send|eth_sign|personal_sign|wallet_)/.test(method)).length;

function expectTerminal(): void {
  expect(screen.getByText('Payment already requested')).toBeTruthy();
  for (const name of [RETRY, 'Continue', 'Start the delay', 'Prepare payment', 'Send payment in my wallet']) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  expect(screen.queryByRole('button', { name: /Connect Mock Wallet/ })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: /Wait a random time first/ })).toBeNull();
  expect(screen.queryByText(OFFLINE)).toBeNull();
}

describe('Pay: a requested public payment stays terminal across a wallet change and a connection loss', () => {
  it.each([
    ['rejected', 'wallet change first', 'accountsChanged'],
    ['rejected', 'connection loss first', 'chainChanged'],
    ['pending', 'wallet change first', 'chainChanged'],
    ['pending', 'connection loss first', 'accountsChanged'],
  ] as const)('%s request, %s (%s)', async (stage, order, change) => {
    const wallet = new EventWallet({ rejectSend: true });
    const original = wallet.request.bind(wallet);
    let sends = 0;
    let refuse: (() => void) | undefined;
    wallet.request = (args) => {
      if (args.method !== 'eth_sendTransaction') return original(args);
      sends++;
      if (stage === 'rejected') return original(args);
      return new Promise((_, reject) => { refuse = () => { reject(Object.assign(new Error('user rejected'), { code: 4001 })); }; });
    };
    const { user, reads } = await toConnected(wallet);
    await prepare(user);
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await waitFor(() => { expect(sends).toBe(1); }, WAIT);
    if (stage === 'rejected') await screen.findByText('You rejected the request in your wallet.', undefined, WAIT);
    await settle();
    const recorded = readAttempts();
    expect(recorded).toHaveLength(1);
    const before = { reads: reads(), asked: asked(wallet) };

    disrupt(wallet, order, change);
    await settle();
    expectTerminal();
    connectivity(true);
    await settle();
    expectTerminal();
    expect({ reads: reads(), asked: asked(wallet) }).toEqual(before);
    expect(sends).toBe(1);
    expect(readAttempts()).toEqual(recorded);

    // Forgetting is the explicit way out, and another invoice opens and verifies as usual.
    await user.click(screen.getByRole('button', { name: 'Forget this invoice' }));
    expect(screen.queryByText('Payment already requested')).toBeNull();
    const next = await makeParsed({ token: 'native', tokenAmount: '0.7' });
    act(() => { setHash(next.fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    const proceed = await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' }, WAIT);
    await waitFor(() => { expect(proceed.disabled).toBe(false); }, WAIT);
    await act(async () => { refuse?.(); await Promise.resolve(); });
    expect(sends).toBe(1);
  }, 60_000);
});

describe('Pay: a public invoice never requested returns to an explicit chain check', () => {
  it.each([
    ['connection loss first', 'accountsChanged', false],
    ['connection loss first', 'chainChanged', true],
    ['wallet change first', 'accountsChanged', true],
    ['wallet change first', 'chainChanged', false],
  ] as const)('%s (%s, prepared: %s)', async (order, change, prepared) => {
    const wallet = new EventWallet();
    const { user, reads } = await toConnected(wallet);
    if (prepared) await prepare(user);
    const askedBefore = asked(wallet);

    disrupt(wallet, order, change);
    await settle();
    const readsOffline = reads();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull(); // Not offered while offline.
    connectivity(true);
    await settle();

    // Reconnecting alone verifies nothing: the review waits for the explicit retry.
    const retry = screen.getByRole('button', { name: RETRY });
    expect(screen.getByText(OFFLINE)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Prepare payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(screen.queryByText('Payment already requested')).toBeNull();
    expect(reads()).toBe(readsOffline);
    expect(asked(wallet)).toBe(askedBefore);

    await user.click(retry);
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(false); }, WAIT);
    expect(reads()).toBeGreaterThan(readsOffline);
    expect(screen.queryByText(OFFLINE)).toBeNull();
    expect(readAttempts()).toEqual([]);
    expect(asked(wallet)).toBe(askedBefore);
  }, 60_000);
});
