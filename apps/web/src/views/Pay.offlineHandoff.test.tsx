// @vitest-environment jsdom
// A connection loss while wallet work has not reached the wallet: the pending request is refused, even after the browser
// reconnects, and nothing is sent. Disclosures are approved one by one here, so the loss can happen while one is open.
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

/** A wallet with account events, whose next request of one method can be held and then settled by the test. */
class ControlledWallet extends MockWallet {
  public held: { readonly resolve: () => void; readonly reject: (error: Error) => void } | undefined;
  private holding: string | undefined;
  private readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(listener); this.listeners.set(event, set);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
  public hold(method: string): void { this.holding = method; this.held = undefined; }
  public override request(args: Parameters<MockWallet['request']>[0]): Promise<unknown> {
    if (args.method !== this.holding) return super.request(args);
    this.holding = undefined;
    return new Promise((resolve, reject) => {
      this.held = {
        resolve: () => { super.request(args).then(resolve, reject); },
        reject: (error) => { this.calls.push({ method: args.method, params: args.params }); reject(error); },
      };
    });
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

const RETRY = 'Retry chain verification';
const WAIT = { timeout: 10_000 };
const APPROVE = 'Approve exactly, then send payment in my wallet';
const SEND = 'Send payment in my wallet';

/** Up to the open Send review: the exact-approval path (no allowance) or the direct payment (allowance already there). */
async function toSendReview(wallet: MockWallet, step: 'approval' | 'payment'): Promise<ReturnType<typeof userEvent.setup>> {
  const user = await toWalletList(wallet, () => word(step === 'approval' ? 0n : 10n ** 12n));
  await connect(user);
  await user.click(await screen.findByRole('button', { name: 'Prepare payment' }, WAIT));
  await user.click(await screen.findByRole('button', { name: step === 'approval' ? APPROVE : SEND }, WAIT));
  await screen.findByRole('dialog', { name: 'Review wallet disclosure' }, WAIT);
  return user;
}

/** Back on the review: the offline reason and the explicit retry, with nothing left to prepare, connect or send. */
async function expectReview(): Promise<void> {
  expect(await screen.findByRole('button', { name: RETRY }, WAIT)).toBeTruthy();
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
  for (const name of [/Connect Mock Wallet/, 'Prepare payment', SEND, APPROVE]) expect(screen.queryByRole('button', { name })).toBeNull();
}

describe('Pay: a connection loss while the Send review is open', () => {
  it.each(['payment', 'approval'] as const)('sends nothing for the %s step approved after the browser reconnected', async (step) => {
    const wallet = new MockWallet();
    const user = await toSendReview(wallet, step);
    connectivity(false);
    connectivity(true);
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await dialogClosed();
    await expectReview();
    expect(asked(wallet, 'eth_sendTransaction')).toBe(0);
    expect(readAttempts()).toEqual([]);
  });

  it('sends no payment after a confirmed approval when the connection dropped during its review, and keeps the allowance', async () => {
    const wallet = new OneSendWallet();
    const user = await toWalletList(wallet, () => word((wallet.sent?.['to'] as string | undefined)?.toLowerCase() === USDC ? 10n ** 12n : 0n));
    await connect(user);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }, WAIT));
    await user.click(await screen.findByRole('button', { name: APPROVE }, WAIT));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await screen.findByText('Revoke approval', undefined, WAIT);
    await screen.findByRole('dialog', { name: 'Review wallet disclosure' }, WAIT);
    connectivity(false);
    connectivity(true);
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await dialogClosed();
    expect(await screen.findByText(/Approval was confirmed, but no payment was sent/, undefined, WAIT)).toBeTruthy();
    expect(asked(wallet, 'eth_sendTransaction')).toBe(1); // The approval only.
    expect(screen.getByRole('button', { name: 'Revoke approval' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
  });
});

describe('Pay: a connection loss that surfaces as another error during Send', () => {
  it.each(['payment', 'approval'] as const)('returns the %s step to the explicit chain check when the wallet was asked for nothing', async (step) => {
    const wallet = new ControlledWallet();
    const user = await toSendReview(wallet, step);
    wallet.hold('eth_accounts'); // The account recheck just before the hand-off.
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await waitFor(() => { expect(wallet.held).toBeDefined(); }, WAIT);
    connectivity(false);
    connectivity(true);
    await act(async () => { wallet.held?.reject(new Error('wallet read failed')); await Promise.resolve(); });
    await expectReview();
    expect(asked(wallet, 'eth_sendTransaction')).toBe(0);
    expect(readAttempts()).toEqual([]);
  });

  it('keeps the wallet answer when the approval request itself fails across a connection loss', async () => {
    const wallet = new ControlledWallet();
    const user = await toSendReview(wallet, 'approval');
    wallet.hold('eth_sendTransaction');
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await waitFor(() => { expect(wallet.held).toBeDefined(); }, WAIT);
    connectivity(false);
    connectivity(true);
    await act(async () => { wallet.held?.reject(Object.assign(new Error('user rejected'), { code: 4001 })); await Promise.resolve(); });
    expect(await screen.findByText('You rejected the request in your wallet.', undefined, WAIT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    expect(asked(wallet, 'eth_sendTransaction')).toBe(1);
  });
});

describe('Pay: a wallet change after a connection loss during work in flight', () => {
  const ORDERS = [['while offline', true], ['after reconnecting', false]] as const;

  /** After the explicit retry the context is current again: a later wallet change goes back to the wallet list. */
  async function expectRecovery(user: ReturnType<typeof userEvent.setup>, wallet: ControlledWallet): Promise<void> {
    await user.click(screen.getByRole('button', { name: RETRY }));
    const proceed = screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' });
    await waitFor(() => { expect(proceed.disabled).toBe(false); }, WAIT);
    await user.click(proceed);
    await connect(user);
    await screen.findByRole('button', { name: 'Prepare payment' }, WAIT);
    act(() => { wallet.emit('accountsChanged'); });
    expect(await screen.findByRole('button', { name: /Connect Mock Wallet/ }, WAIT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
  }

  it.each(ORDERS)('returns a preparation to the explicit chain check when the wallet changes %s', async (_, changesOffline) => {
    const wallet = new ControlledWallet();
    let hold = false;
    let release: (() => void) | undefined;
    const user = await toWalletList(wallet, () => {
      if (!hold) return word(10n ** 12n);
      hold = false;
      return new Promise((resolve) => { release = () => { resolve(word(10n ** 12n)); }; });
    });
    await connect(user);
    const prepare = await screen.findByRole('button', { name: 'Prepare payment' }, WAIT);
    hold = true;
    await user.click(prepare);
    await waitFor(() => { expect(release).toBeDefined(); }, WAIT);
    connectivity(false);
    if (!changesOffline) connectivity(true);
    act(() => { wallet.emit('accountsChanged'); });
    if (changesOffline) connectivity(true);
    await act(async () => { release?.(); await Promise.resolve(); });
    await expectReview();
    expect(asked(wallet, 'eth_signTypedData_v4') + asked(wallet, 'eth_sendTransaction')).toBe(0);
    await expectRecovery(user, wallet);
  });

  it.each(ORDERS)('returns a send under review to the explicit chain check when the wallet changes %s', async (_, changesOffline) => {
    const wallet = new ControlledWallet();
    const user = await toSendReview(wallet, 'payment');
    connectivity(false);
    if (!changesOffline) connectivity(true);
    act(() => { wallet.emit('chainChanged'); });
    if (changesOffline) connectivity(true);
    await dialogClosed();
    await expectReview();
    expect(asked(wallet, 'eth_sendTransaction')).toBe(0);
    expect(readAttempts()).toEqual([]);
    await expectRecovery(user, wallet);
  });
});
