// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAttempts } from '../lib/duplicateAttemptJournal';
import type { InvoiceForm } from '../lib/invoiceCreate';
import type { Services } from '../lib/services';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { WalletInfo } from '../lib/wallet';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc, type RpcHandler } from '../test/mockRpc';
import { MockWallet } from '../test/mockWallet';
import { makeServices, renderApp, setHash } from '../test/render';
import { useAutoApprovedWalletDisclosures } from '../test/walletDisclosure';
import en from '../../locales/en.json';

const BASE = { rpcUrls: { '84532': 'https://rpc.test' } };
const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const L2_FEE_ORACLE = '0x420000000000000000000000000000000000000F';
const APPROVE = 'Approve exactly, then send payment in my wallet';
const UNKNOWN = /unknown outcome and may already have been submitted/;
const OTHER_RPC = { rpcUrls: { '84532': 'https://other.test' } };
const PINS = { pinnedSigners: [`02${'11'.repeat(32)}`] };
const HASH = `0x${'9'.repeat(64)}`;
const SEND = 'Send payment in my wallet';
const FINAL = 'Final check before your wallet';
const RETRY = en.messages['pay.retryCheck'];
const ALREADY = en.messages['pay.alreadyRequested.title'];

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

const NATIVE: Partial<InvoiceForm> = { token: 'native', tokenAmount: '0.5' };
/** Chain answers for a native payment: no transaction is found for any hash. */
const nativeAnswers: RpcHandler = (method) => (method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x');

const settle = (): Promise<void> => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

function deferred(): { readonly wait: Promise<void>; readonly release: () => void } {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release: () => { release(); } };
}

/** Opens an invoice up to its review; `around` can hold an RPC answer. */
async function toReview(wallet: MockWallet, around?: Around, form = NATIVE, answers = nativeAnswers): Promise<{ user: ReturnType<typeof userEvent.setup>; opened: () => string[] }> {
  if (window.localStorage.getItem(SETTINGS_KEY) === null) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(BASE));
  const { fragment } = await makeParsed(form);
  const createRpc = vi.fn<Services['createRpc']>(() => {
    const rpc = withManifestChain(mockRpc(84532, answers));
    return Promise.resolve(around === undefined ? rpc : { ...rpc, request: (method: string, params: readonly unknown[]) => around(method, params, () => rpc.request(method, params)) });
  });
  const info: WalletInfo = { id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet };
  setHash(fragment);
  renderApp(makeServices({ createRpc, loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }), discoverWallets: () => Promise.resolve([info]) }));
  const user = userEvent.setup();
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: /^(?:Continue|Start the delay)$/ }).disabled).toBe(false); });
  return { user, opened: () => createRpc.mock.calls.map((call) => call[1]) };
}

/** From the review back to the wallet step, once the chain check under the current settings has finished. */
async function toWallet(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(false); });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

async function toPrepared(wallet: MockWallet, around?: Around, form?: Partial<InvoiceForm>, answers?: RpcHandler): Promise<{ user: ReturnType<typeof userEvent.setup>; opened: () => string[] }> {
  const { user, opened } = await toReview(wallet, around, form, answers);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: /Connect Mock Wallet/ }));
  await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
  await screen.findByRole('heading', { name: FINAL });
  return { user, opened };
}

/**
 * A token checkout at its final check. `before` runs ahead of the nth wallet send and may hold or refuse it; an approval
 * or revocation that goes through sets the allowance the chain reports.
 */
async function toPreparedToken(before: (nth: number) => Promise<void>, around?: Around) {
  const wallet = new MockWallet();
  const real = wallet.request.bind(wallet);
  let allowance = 0n;
  let sends = 0;
  vi.spyOn(wallet, 'request').mockImplementation(async (args) => {
    if (args.method !== 'eth_sendTransaction') return real(args);
    await before(++sends);
    const hash = await real(args);
    const [tx] = args.params as [{ readonly to: string; readonly data: string }];
    if (tx.to.toLowerCase() === USDC) allowance = BigInt(`0x${tx.data.slice(-64)}`);
    return hash;
  });
  const answers: RpcHandler = (method, params) => {
    const sent = wallet.sent;
    if (method === 'eth_getTransactionByHash') return sent === undefined ? null : { hash: params[0], from: sent['from'], to: sent['to'], input: sent['data'], value: sent['value'], chainId: '0x14a34' };
    if (method === 'eth_getTransactionReceipt') return sent === undefined ? null : { transactionHash: params[0], status: '0x1', blockNumber: '0x64', to: sent['to'] };
    if (method === 'eth_gasPrice') return '0x3b9aca00';
    // Every other contract read answers one word: the allowance, and zero for the L2 fee oracle.
    if (method === 'eth_call') return `0x${((params[0] as { to?: string }).to === L2_FEE_ORACLE ? 0n : allowance).toString(16).padStart(64, '0')}`;
    return '0x';
  };
  const { user } = await toPrepared(wallet, around, {}, answers);
  return { user, wallet, sends: (): number => sends };
}

/** A wallet that reports account changes. */
class EventWallet extends MockWallet {
  private readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    this.listeners.set(event, (this.listeners.get(event) ?? new Set<() => void>()).add(listener));
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
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
    expect(screen.queryByRole('button', { name: 'Prepare payment' })).toBeNull();
    await toWallet(user);
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

  it('offers the chain check again when the new RPC fails it', async () => {
    let failing = false;
    const wallet = new MockWallet();
    const { user, opened } = await toPrepared(wallet, (method, _params, answer) => (failing && method === 'eth_getCode' ? Promise.reject(new Error('down')) : answer()));
    failing = true;
    otherTabSaves(OTHER_RPC);
    const retry = await screen.findByRole('button', { name: RETRY });
    expect(screen.queryByRole('button', { name: 'Prepare payment' })).toBeNull();
    failing = false;
    await user.click(retry);
    await toWallet(user);
    expect(await screen.findByRole('button', { name: 'Prepare payment' })).toBeTruthy();
    expect(opened().at(-1)).toBe('https://other.test/');
  });

  it.each([
    ['the RPC changes after', OTHER_RPC, false],
    ['the signer pins change after', PINS, false],
    ['the signer pins changed before', PINS, true],
  ] as const)('leaves a requested payment closed when %s a wallet change', async (_name, patch, before) => {
    const wallet = new EventWallet();
    const { user } = await toPrepared(wallet);
    await user.click(screen.getByRole('button', { name: SEND }));
    await screen.findByRole('heading', { name: 'Submitted' });
    if (before) otherTabSaves(patch);
    act(() => { wallet.emit('accountsChanged'); });
    await settle();
    if (!before) otherTabSaves(patch);
    await settle();
    expect(screen.getByText(ALREADY)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('button', { name: SEND })).toBeNull();
    expect(readAttempts().filter((attempt) => attempt.hash === HASH)).toHaveLength(1);
  });

  it('keeps what the wallet answered about an approval when pins were saved while it was asked', async () => {
    const gate = deferred();
    const t = await toPreparedToken(async () => { await gate.wait; throw new Error('lost'); });
    await t.user.click(screen.getByRole('button', { name: APPROVE }));
    await waitFor(() => { expect(t.sends()).toBe(1); });
    otherTabSaves(PINS);
    gate.release();
    await settle();
    expect(document.body.textContent).toMatch(UNKNOWN);
    // Checkout was not opened again, so the wallet is still connected.
    await toWallet(t.user);
    expect(await screen.findByRole('button', { name: 'Prepare payment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Connect Mock Wallet/ })).toBeNull();
  });

  it('does not open the invoice again after a revocation during which pins were saved', async () => {
    const approving = deferred();
    const revoking = deferred();
    const t = await toPreparedToken(async (nth) => { await (nth === 1 ? approving : revoking).wait; });
    await t.user.click(screen.getByRole('button', { name: APPROVE }));
    await waitFor(() => { expect(t.sends()).toBe(1); });
    // A change saved while the approval is asked refuses the payment before the wallet hears of it: only an allowance is
    // left. (Once a payment was requested, checkout keeps its context whatever is revoked.)
    otherTabSaves({ theme: 'light' });
    approving.release();
    const revoke = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>('button', { name: 'Revoke approval' });
    await waitFor(() => { expect(revoke().disabled).toBe(false); });
    await t.user.click(revoke());
    await waitFor(() => { expect(t.sends()).toBe(2); });
    otherTabSaves(PINS);
    revoking.release();
    await toWallet(t.user);
    expect(await screen.findByRole('button', { name: 'Prepare payment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Connect Mock Wallet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke approval' })).toBeNull();
    expect(t.sends()).toBe(2);
  });

  /** The signer key the open invoice's signature label names, with that label's claim about pinning. */
  function signerLabel(): { readonly key: string; readonly pinned: boolean } {
    const found = /Signature matches key ([0-9a-f]{66}) \((pinned by you|not pinned)\)/.exec(document.body.textContent ?? '');
    return { key: found?.[1] ?? '', pinned: found?.[2] === 'pinned by you' };
  }

  it.each([
    ['a payment was submitted', false],
    ['the requested invoice was closed by a wallet change', true],
  ] as const)('labels the held invoice by the pins saved now, without opening it again, after %s', async (_name, closed) => {
    const wallet = new EventWallet();
    const { user } = await toPrepared(wallet);
    await user.click(screen.getByRole('button', { name: SEND }));
    await screen.findByRole('heading', { name: 'Submitted' });
    if (closed) {
      act(() => { wallet.emit('accountsChanged'); });
      await screen.findByText(ALREADY);
    }
    const { key, pinned } = signerLabel();
    expect(key).not.toBe('');
    expect(pinned).toBe(false);
    for (const now of [true, false]) {
      otherTabSaves(now ? { pinnedSigners: [key] } : {});
      await settle();
      expect(signerLabel()).toEqual({ key, pinned: now });
      if (closed) expect(screen.getByText(ALREADY)).toBeTruthy();
      else expect(document.body.textContent).toContain(HASH);
      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
      expect(screen.queryByRole('button', { name: SEND })).toBeNull();
    }
    expect(readAttempts().filter((attempt) => attempt.hash === HASH)).toHaveLength(1);
  });

  it('keeps an unanswered approval on screen while the signer label follows the pins', async () => {
    const t = await toPreparedToken(() => Promise.reject(new Error('lost')));
    await t.user.click(screen.getByRole('button', { name: APPROVE }));
    await waitFor(() => { expect(document.body.textContent).toMatch(UNKNOWN); });
    const { key } = signerLabel();
    for (const now of [true, false]) {
      otherTabSaves(now ? { pinnedSigners: [key] } : {});
      await settle();
      expect(signerLabel()).toEqual({ key, pinned: now });
      expect(document.body.textContent).toMatch(UNKNOWN);
    }
    expect(t.sends()).toBe(1);
  });

  it('opens the next invoice with the pins saved while the last one kept its own', async () => {
    const next = await makeParsed({ token: 'native', tokenAmount: '0.4' });
    const { user } = await toPrepared(new MockWallet());
    await user.click(screen.getByRole('button', { name: SEND }));
    await screen.findByRole('heading', { name: 'Submitted' });
    otherTabSaves({ pinnedSigners: [next.parsed.invoice.signer] });
    act(() => {
      setHash(next.fragment);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => { expect(document.body.textContent).toMatch(/\(pinned by you\)/); });
  });

  it.each([
    ['no RPC is saved any more', { rpcUrls: {} }],
    ['the saved RPC cannot show the contracts', OTHER_RPC],
  ])('asks for no payment after an approval when %s, and pays once a usable one is saved', async (_name, patch) => {
    const gate = deferred();
    let broken = false;
    const t = await toPreparedToken(async (nth) => { if (nth === 1) await gate.wait; },
      (method, _params, answer) => (broken && method === 'eth_getCode' ? Promise.reject(new Error('down')) : answer()));
    await t.user.click(screen.getByRole('button', { name: APPROVE }));
    await waitFor(() => { expect(t.sends()).toBe(1); });
    otherTabSaves(patch);
    gate.release();
    const send = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>('button', { name: SEND });
    await waitFor(() => { expect(send().disabled).toBe(false); });

    broken = true;
    await t.user.click(send());
    await settle();
    expect(t.sends()).toBe(1);
    expect(send().disabled).toBe(false);
    expect(document.body.textContent).toMatch(/no payment was sent/i);

    broken = false;
    otherTabSaves({ rpcUrls: { '84532': 'https://third.test' } });
    await t.user.click(send());
    await screen.findByRole('heading', { name: 'Submitted' });
    expect(t.sends()).toBe(2);
  });

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
    await toWallet(user);
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
