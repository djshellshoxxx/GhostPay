// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { approveWalletDisclosure } from '../test/walletDisclosure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { ATTEMPT_JOURNAL_KEY, readAttempts, readReturnedAttempts, retryReturnedAttempts } from '../lib/duplicateAttemptJournal';
import { buildInvoiceLink, type InvoiceForm } from '../lib/invoiceCreate';
import * as embedHost from '../lib/embedHost';
import * as payExec from '../lib/payExec';
import { clearSession, getSessionPublic } from '../lib/session';
import type { Services } from '../lib/services';
import { SETTINGS_KEY } from '../lib/settings';
import { type WalletInfo } from '../lib/wallet';
import { generateWaivedSession } from '../test/keys';
import { BASE_FORM, NOW, makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';

class EventWallet extends MockWallet {
  public readonly listeners = new Map<string, Set<() => void>>();
  public on(event: string, listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(listener); this.listeners.set(event, set);
  }
  public removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  public emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
}
const info = (wallet: EventWallet): WalletInfo => ({ id: 'fixture', name: 'Lifecycle Wallet', kind: 'injected', provider: wallet });
type Route = 'Pay' | 'Public registry';
const routes: readonly Route[] = ['Pay', 'Public registry'];
const PRIVATE_MEMO = 'private checkout context must disappear';
const INVOICE_PASSPHRASE = 'cedar orbit velvet lantern meadow';
const WALLET_CHANGE_REASON = 'The wallet account, network or provider changed. Reconnect and review again.';
type PrivateInvoice = 'encrypted' | 'passphrase';

interface Fiber { readonly tag: number; readonly memoizedState: unknown; readonly child: Fiber | null; readonly sibling: Fiber | null }
interface Hook { readonly memoizedState: unknown; readonly next: Hook | null }
/**
 * True when a committed hook (state, ref or memo) of the mounted app still holds `needle`. Functions and DOM nodes are
 * skipped, so this reports what components keep, not what the closure of an unsettled wallet request captured.
 */
function appStateHolds(needle: string): boolean {
  const roots = [...document.body.children].flatMap((element) => Object.entries(element)
    .filter(([key]) => key.startsWith('__reactContainer$')).map(([, root]) => (root as { stateNode: { current: Fiber } }).stateNode.current));
  if (roots.length !== 1) throw new Error('Expected exactly one React root');
  const seen = new Set<object>();
  const holds = (value: unknown): boolean => {
    if (typeof value === 'string') return value.includes(needle);
    if (typeof value !== 'object' || value === null || value instanceof Node || seen.has(value)) return false;
    seen.add(value);
    return (value instanceof Map || value instanceof Set ? [...value] : Object.values(value)).some(holds);
  };
  const fibers: Fiber[] = [...roots];
  for (let fiber = fibers.pop(); fiber !== undefined; fiber = fibers.pop()) {
    // Function, forwardRef and memo components keep their hooks as a linked list.
    if (fiber.tag === 0 || fiber.tag === 11 || fiber.tag === 15) {
      for (let hook = fiber.memoizedState as Hook | null; hook !== null; hook = hook.next) if (holds(hook.memoizedState)) return true;
    }
    if (fiber.child !== null) fibers.push(fiber.child);
    if (fiber.sibling !== null) fibers.push(fiber.sibling);
  }
  return false;
}

beforeEach(() => {
  clearSession(); window.localStorage.clear(); window.sessionStorage.clear(); setHash('');
});
afterEach(async () => { vi.restoreAllMocks(); await retryReturnedAttempts(); clearSession(); });

async function open(route: Route, wallet: EventWallet, overrides: Partial<Services> = {}, protection?: PrivateInvoice, form: Partial<InvoiceForm> = {}) {
  const user = userEvent.setup();
  if (route === 'Pay') {
    const invoice = { ...BASE_FORM, token: 'native', tokenAmount: '0.1', ...form };
    if (protection !== undefined) generateWaivedSession();
    const { fragment } = protection === undefined
      ? await makeParsed(invoice)
      : await buildInvoiceLink({ ...invoice, memo: PRIVATE_MEMO, encrypt: true,
        ...(protection === 'passphrase' ? { passphrase: INVOICE_PASSPHRASE } : {}),
      }, 'https://app.test/', NOW);
    setHash(fragment);
  } else if (route === 'Public registry') generateWaivedSession();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test', '11155111': 'https://rpc.test' } }));
  renderApp(makeServices({
    loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
    createRpc: () => Promise.resolve(withManifestChain(mockRpc(84532, () => '0x'))),
    discoverWallets: () => Promise.resolve([info(wallet)]),
    ...overrides,
  }));
  if (route === 'Pay') {
    if (protection === 'passphrase') {
      await user.type(await screen.findByLabelText('Invoice passphrase'), INVOICE_PASSPHRASE);
      await user.click(screen.getByRole('button', { name: 'Open invoice' }));
    }
    await user.click(await screen.findByRole('button', { name: 'Continue' }, { timeout: 120_000 }));
  }
  else {
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: route }));
    if (route === 'Public registry') await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  }
  await user.click(await screen.findByRole('button', { name: /Connect Lifecycle Wallet/ }));
  await approveWalletDisclosure(user, 'eth_requestAccounts');
  return user;
}

describe('required wallet lifecycle privacy in real EVM views', () => {
  it.each([
    { protection: 'encrypted', mismatch: 'network' },
    { protection: 'encrypted', mismatch: 'account' },
    { protection: 'passphrase', mismatch: 'network' },
    { protection: 'passphrase', mismatch: 'account' },
  ] as const)('Pay retains public notice after a silent $mismatch change for a $protection invoice', async ({ protection, mismatch }) => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet, {}, protection);
    expect(screen.getByText(PRIVATE_MEMO, { exact: true })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const original = wallet.request.bind(wallet);
    if (mismatch === 'network') wallet.chainId = 31337;
    else wallet.request = (args) => args.method === 'eth_accounts'
      ? Promise.resolve(['0x6666666666666666666666666666666666666666'])
      : original(args);
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await screen.findByRole('heading', { name: 'Pay an invoice' });
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Payment sent, verifying' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
    expect(screen.queryByLabelText('Invoice passphrase')).toBeNull();
    expect(screen.getByLabelText<HTMLTextAreaElement>('Paste an invoice link').value).toBe('');
    expect(window.location.hash).toBe('');
    expect(wallet.calls.filter(({ method }) => /^(?:eth_send|eth_sign|personal_sign)/.test(method))).toEqual([]);
    expect(readAttempts()).toEqual([]);
    await screen.findByText(WALLET_CHANGE_REASON, { exact: true });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(screen.getByRole('alert')).getByText(WALLET_CHANGE_REASON, { exact: true })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Nothing was sent');

    // Returning to Pay cannot reopen the erased private capability from the app context.
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.click(nav.getByRole('button', { name: 'Home' }));
    await user.click(nav.getByRole('button', { name: 'Pay' }));
    await screen.findByRole('heading', { name: 'Pay an invoice' });
    expect(screen.queryByRole('heading', { name: 'Review payment' })).toBeNull();
    expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
    expect(readAttempts()).toEqual([]);
  }, 180_000);

  it.each(['lock', 'session', 'new invoice'] as const)('clears the public wallet-change notice on %s after private checkout revocation', async (change) => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet, {}, 'encrypted');
    act(() => { wallet.emit('accountsChanged'); });
    await screen.findByText(WALLET_CHANGE_REASON, { exact: true });
    if (change === 'lock') act(() => { notifyAppLock('manual'); });
    else if (change === 'session') act(() => { clearSession(); });
    else {
      // Build with the existing seller session so only the new invoice clears the notice.
      const next = await buildInvoiceLink({ ...BASE_FORM, token: 'native', tokenAmount: '0.2', memo: 'new invoice context' }, 'https://app.test/', NOW);
      expect(screen.getByText(WALLET_CHANGE_REASON, { exact: true })).toBeTruthy();
      await user.type(screen.getByLabelText('Paste an invoice link'), next.link);
      await user.click(screen.getByRole('button', { name: 'Read invoice' }));
      await screen.findByRole('heading', { name: 'Review payment' });
      expect(screen.getByText('new invoice context', { exact: true })).toBeTruthy();
    }
    expect(screen.queryByText(WALLET_CHANGE_REASON, { exact: true })).toBeNull();
    expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(wallet.calls.filter(({ method }) => /^(?:eth_send|eth_sign|personal_sign)/.test(method))).toEqual([]);
    expect(readAttempts()).toEqual([]);
  });

  it.each(['network', 'account'] as const)('Pay explains a silent %s mismatch without submitting or retaining the old wallet', async (kind) => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const original = wallet.request.bind(wallet);
    if (kind === 'network') wallet.chainId = 31337;
    else wallet.request = (args) => args.method === 'eth_accounts'
      ? Promise.resolve(['0x6666666666666666666666666666666666666666'])
      : original(args);
    // No provider event fires: the final explicit reread must revoke the view and explain why.
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await screen.findByText('The wallet account, network or provider changed. Reconnect and review again.', { exact: true });
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Final check before your wallet' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Payment sent, verifying' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(wallet.calls.filter(({ method }) => method === 'eth_sendTransaction' || method.startsWith('eth_sign'))).toEqual([]);
    expect(readAttempts()).toEqual([]);
  });

  it.each(routes)('%s conceals the old connected account immediately on provider account change', async (route) => {
    const wallet = new EventWallet({ chainId: route === 'Pay' ? 84532 : 11155111 });
    const user = await open(route, wallet);
    await screen.findByText(MOCK_ACCOUNT, { exact: true });
    const seller = getSessionPublic();
    act(() => { wallet.emit('accountsChanged'); });
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare transaction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review publish transaction' })).toBeNull();
    expect(getSessionPublic()).toEqual(seller);
    const find = screen.queryByRole('button', { name: 'Find wallets' });
    if (find !== null) await user.click(find);
    await user.click(await screen.findByRole('button', { name: /Connect Lifecycle Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    expect(await screen.findByText(MOCK_ACCOUNT, { exact: true })).toBeTruthy();
  });

  it.each(routes)('%s stops a pending connection after app lock before any follow-up RPC', async (route) => {
    const wallet = new EventWallet({ chainId: route === 'Pay' ? 84532 : 11155111 });
    const original = wallet.request.bind(wallet);
    let release!: (value: unknown) => void;
    const held = new Promise<unknown>((resolve) => { release = resolve; });
    let asked = false;
    wallet.request = (args) => { if (args.method === 'eth_requestAccounts') { asked = true; return held; } return original(args); };
    await open(route, wallet);
    expect(asked).toBe(true);
    act(() => { notifyAppLock('manual'); });
    await act(async () => { release([MOCK_ACCOUNT]); await held; await Promise.resolve(); });
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(wallet.calls).toHaveLength(0);
  });

  it.each(routes)('%s ignores a superseded connection that completes after a newer connection', async (route) => {
    const wallet = new EventWallet({ chainId: route === 'Pay' ? 84532 : 11155111 });
    const original = wallet.request.bind(wallet);
    const replacement = '0x6666666666666666666666666666666666666666';
    let release!: (value: unknown) => void;
    const held = new Promise<unknown>((resolve) => { release = resolve; });
    let permissions = 0;
    wallet.request = (args) => {
      if (args.method === 'eth_requestAccounts') {
        permissions++;
        return permissions === 1 ? held : Promise.resolve([replacement]);
      }
      if (args.method === 'eth_accounts') return Promise.resolve([replacement]);
      return original(args);
    };
    const user = await open(route, wallet);
    await user.click(screen.getByRole('button', { name: /Connect Lifecycle Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    await screen.findByText(replacement, { exact: true });
    const reads = wallet.calls.length;
    await act(async () => { release([MOCK_ACCOUNT]); await held; await Promise.resolve(); });
    expect(screen.getByText(replacement, { exact: true })).toBeTruthy();
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(wallet.calls).toHaveLength(reads);
    expect(permissions).toBe(2);
    // Pay also retains three account-scoped local reuse listeners and history retains three; neither path retains the obsolete connection.
    expect([...wallet.listeners.values()].reduce((sum, set) => sum + set.size, 0)).toBe(route === 'Pay' ? 9 : 6);
  });

  it.each((['lock', 'accountsChanged', 'chainChanged', 'disconnect'] as const).flatMap((change) =>
    (['known hash', 'lost response'] as const).map((outcome) => ({ change, outcome }))))(
    'retains $outcome bookkeeping after $change without continuing the revoked checkout', async ({ change, outcome }) => {
      const wallet = new EventWallet();
      const rpc = mockRpc(84532, () => '0x');
      const user = await open('Pay', wallet, { createRpc: () => Promise.resolve(withManifestChain(rpc)) }, 'encrypted');
      await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
      await screen.findByRole('heading', { name: 'Final check before your wallet' });
      const original = wallet.request.bind(wallet);
      let release!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const held = new Promise<unknown>((resolve, fail) => { release = resolve; reject = fail; });
      let sends = 0;
      wallet.request = (args) => {
        if (args.method === 'eth_sendTransaction') { sends++; return held; }
        return original(args);
      };
      await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
      await approveWalletDisclosure(user, 'eth_sendTransaction');
      await vi.waitFor(() => { expect(sends).toBe(1); });
      expect(readAttempts()).toMatchObject([{ status: 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
      act(() => { if (change === 'lock') notifyAppLock('manual'); else wallet.emit(change); });
      const rpcCount = rpc.calls.length;
      const walletCount = wallet.calls.length;
      const hash = `0x${'9'.repeat(64)}`;
      await act(async () => {
        if (outcome === 'known hash') release(hash);
        else reject(new Error('private provider diagnostics'));
        await held.catch(() => undefined);
      });
      await vi.waitFor(() => {
        expect(readAttempts()).toMatchObject([{ status: outcome === 'known hash' ? 'submitted' : 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
        expect(readReturnedAttempts()).toEqual([]);
      });
      expect(readAttempts()[0]?.hash).toBe(outcome === 'known hash' ? hash : undefined);
      expect(document.body.textContent).not.toContain(hash);
      expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
      expect(document.body.textContent).not.toContain('private provider diagnostics');
      expect(document.body.textContent).not.toContain('Nothing was sent');
      expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Pay an invoice' })).toBeTruthy();
      expect(screen.getByText(/A previous wallet request may already have been submitted/)).toBeTruthy();
      expect(window.location.hash).toBe('');
      expect(sends).toBe(1);
      expect(wallet.calls).toHaveLength(walletCount);
      expect(rpc.calls).toHaveLength(rpcCount);
    });

  it.each((['route leave', 'idle expiry'] as const).flatMap((change) =>
    (['result', 'post-broadcast refusal'] as const).map((completion) => ({ change, completion }))))(
    'does not publish a late $completion after $change, while retaining its journal outcome', async ({ completion, change }) => {
    const wallet = new EventWallet();
    const rpc = mockRpc(84532, (method) => method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt' ? null : '0x');
    const notify = vi.spyOn(embedHost, 'notifyEmbedDone').mockImplementation(() => undefined);
    const original = payExec.sendPayment;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let ready = false;
    let settled = false;
    vi.spyOn(payExec, 'sendPayment').mockImplementation(async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      ready = true;
      await held;
      settled = true;
      if (completion === 'post-broadcast refusal') throw new payExec.PostBroadcastError(result.hash, { key: 'transaction.detail.saveHash' });
      return result;
    });
    const user = await open('Pay', wallet, { createRpc: () => Promise.resolve(withManifestChain(rpc)) }, 'encrypted');
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => { expect(ready).toBe(true); });
    const hash = `0x${'9'.repeat(64)}`;
    expect(readAttempts()).toMatchObject([{ status: 'submitted', hash, account: MOCK_ACCOUNT }]);
    if (change === 'route leave') {
      await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Home' }));
    } else {
      // No restoration event or interval has run: completion must synchronously check the fifteen-minute idle lease.
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
    }
    const announcementRegion = screen.getAllByRole('status').find((element) => element.getAttribute('aria-atomic') === 'true');
    if (announcementRegion === undefined) throw new Error('Expected the shared app announcement region');
    const announcement = announcementRegion.textContent;
    const rpcReads = rpc.calls.length;
    await act(async () => { release(); await held; await Promise.resolve(); });
    await vi.waitFor(() => { expect(settled).toBe(true); });
    expect(notify).not.toHaveBeenCalled();
    if (change === 'route leave') expect(announcementRegion.textContent).toBe(announcement);
    else expect(screen.getByText('Session locked after inactivity')).toBeTruthy();
    expect(document.body.textContent).not.toContain(hash);
    expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
    expect(document.body.textContent).not.toContain(MOCK_ACCOUNT);
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(rpc.calls).toHaveLength(rpcReads);
    expect(wallet.calls.filter(({ method }) => method === 'eth_sendTransaction')).toHaveLength(1);
    expect(readAttempts()).toMatchObject([{ status: 'submitted', hash, account: MOCK_ACCOUNT }]);
    if (change === 'route leave') {
      await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Pay' }));
      expect(screen.getByRole('heading', { name: 'Pay an invoice' })).toBeTruthy();
    }
    expect(document.body.textContent).not.toContain(hash);
    expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
    expect(window.location.hash).toBe('');
  });

  it('recovers a returned private-checkout hash only to its owner after mirror persistence failed', async () => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet, {}, 'encrypted');
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const original = wallet.request.bind(wallet);
    let release!: (value: unknown) => void;
    const held = new Promise<unknown>((resolve) => { release = resolve; });
    let sends = 0;
    let account = MOCK_ACCOUNT;
    wallet.request = (args) => {
      if (args.method === 'eth_sendTransaction') { sends++; return held; }
      if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') return Promise.resolve([account]);
      return original(args);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => { expect(sends).toBe(1); });
    const before = localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    act(() => { wallet.emit('accountsChanged'); });
    const writeLocal = localStorage.setItem.bind(localStorage);
    const writeSession = sessionStorage.setItem.bind(sessionStorage);
    let rejectedWrites = 0;
    const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === localStorage && key === ATTEMPT_JOURNAL_KEY) { rejectedWrites++; throw new Error('synthetic mirror unavailable'); }
      (this === localStorage ? writeLocal : writeSession)(key, value);
    });
    const hash = `0x${'7'.repeat(64)}`;
    await act(async () => { release(hash); await held; });
    await vi.waitFor(() => {
      expect(rejectedWrites).toBeGreaterThan(0);
      expect(readReturnedAttempts()).toMatchObject([{ hash, account: MOCK_ACCOUNT, chainId: 84532 }]);
    });
    expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(before);
    expect(document.body.textContent).not.toContain(hash);
    expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
    expect(screen.getByRole('heading', { name: 'Pay an invoice' })).toBeTruthy();
    failed.mockRestore();
    const history = screen.getByRole('region', { name: 'Wallet attempt journal' });
    account = '0x6666666666666666666666666666666666666666';
    await user.selectOptions(within(history).getByLabelText('Network for wallet history'), '84532');
    await user.click(within(history).getByRole('button', { name: 'Find wallet for history' }));
    await user.click(await within(history).findByRole('button', { name: 'Connect Lifecycle Wallet' }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    expect(await within(history).findByText('No recorded attempts for this connected account and chain.')).toBeTruthy();
    expect(document.body.textContent).not.toContain(hash);
    account = MOCK_ACCOUNT;
    act(() => { wallet.emit('accountsChanged'); });
    await user.click(within(history).getByRole('button', { name: 'Find wallet for history' }));
    await user.click(await within(history).findByRole('button', { name: 'Connect Lifecycle Wallet' }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    const shown = await within(history).findByText(hash, { exact: true });
    expect(shown.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    await user.click(within(history).getByRole('button', { name: 'Retry saving returned hashes' }));
    await vi.waitFor(() => { expect(readReturnedAttempts()).toEqual([]); });
    expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toContain(hash);
    expect(readAttempts()).toMatchObject([{ hash, account: MOCK_ACCOUNT, chainId: 84532, status: 'submitted' }]);
    expect(sends).toBe(1);
  });

  // WEB-APP-02: a payment that may have reached the wallet stays terminal for the same open public invoice, even after
  // the wallet change revoked its private presentation. Only the journal (behind the owner gate) holds the outcome.
  it.each(['done', 'pending'] as const)('keeps a %s public payment terminal after a wallet change instead of offering Send again', async (stage) => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const hash = `0x${'7'.repeat(64)}`;
    const original = wallet.request.bind(wallet);
    let release!: (value: unknown) => void;
    const held = new Promise<unknown>((resolve) => { release = resolve; });
    let sends = 0;
    wallet.request = (args) => {
      if (args.method !== 'eth_sendTransaction') return original(args);
      sends++;
      return stage === 'pending' ? held : Promise.resolve(hash);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => { expect(sends).toBe(1); });
    if (stage === 'done') await vi.waitFor(() => { expect(readAttempts()).toMatchObject([{ status: 'submitted', hash }]); });
    act(() => { wallet.emit('accountsChanged'); });
    if (stage === 'pending') await act(async () => { release(hash); await held; });

    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy(); // A public invoice stays open.
    expect(screen.getByText('Payment already requested')).toBeTruthy();
    expect(screen.getByText(WALLET_CHANGE_REASON, { exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Connect Lifecycle Wallet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(document.body.textContent).not.toContain(hash);
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    await vi.waitFor(() => { expect(readAttempts()).toMatchObject([{ status: 'submitted', hash, account: MOCK_ACCOUNT }]); });
    expect(sends).toBe(1);

    // Forgetting the invoice is the explicit way out; nothing is sent and the journal still blocks a duplicate.
    await user.click(screen.getByRole('button', { name: 'Forget this invoice' }));
    expect(screen.queryByText('Payment already requested')).toBeNull();
    expect(sends).toBe(1);
  }, 180_000);

  // An approval is not a payment: an approval that cannot be verified must not close the invoice as already requested.
  it('does not report an unverified approval as a requested payment after a wallet change', async () => {
    const wallet = new EventWallet();
    // The permit domain cannot be read (exact approval path) and the allowance stays zero after the approval.
    const rpc = mockRpc(84532, (method, params) => {
      if (method === 'eth_call') return `0x${'0'.repeat(64)}`;
      if (method === 'eth_estimateGas') return '0xfde8';
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      if (method === 'eth_getTransactionByHash') {
        const sent = wallet.sent;
        return sent === undefined ? null : { hash: params[0], from: sent['from'], to: sent['to'], input: sent['data'], value: sent['value'], chainId: '0x14a34' };
      }
      if (method === 'eth_getTransactionReceipt') return { transactionHash: params[0], status: '0x1', blockNumber: '0x64', to: wallet.sent?.['to'] };
      throw new Error(`unexpected ${method}`);
    });
    const user = await open('Pay', wallet, { createRpc: () => Promise.resolve(withManifestChain(rpc)) }, undefined, { token: BASE_FORM.token, tokenAmount: '100' });
    const approve = async (): Promise<void> => {
      await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
      await user.click(await screen.findByRole('button', { name: 'Approve exactly, then send payment in my wallet' }));
      await approveWalletDisclosure(user, 'eth_sendTransaction');
    };
    const sends = (): number => wallet.calls.filter(({ method }) => method === 'eth_sendTransaction').length;
    await approve();
    await screen.findByRole('heading', { name: 'Approval sent, verifying' });
    const recorded = readAttempts();
    expect(recorded).toMatchObject([{ status: 'submitted', kind: 'approval', account: MOCK_ACCOUNT }]);
    act(() => { wallet.emit('accountsChanged'); });

    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(screen.getByText(WALLET_CHANGE_REASON, { exact: true })).toBeTruthy();
    expect(screen.queryByText('Payment already requested')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Approval sent, verifying' })).toBeNull();
    // Checkout is offered again; the durable journal, not a payment claim, refuses to repeat the approval.
    await user.click(await screen.findByRole('button', { name: /Connect Lifecycle Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    await approve();
    expect(await screen.findByText(/A previous wallet attempt for this action already exists/)).toBeTruthy();
    expect(sends()).toBe(1);
    expect(readAttempts()).toEqual(recorded);
  }, 180_000);

  // The terminal marker is for public checkout only: a revoked or replaced private invoice leaves nothing behind.
  it.each((['encrypted', 'passphrase'] as const).flatMap((protection) =>
    (['wallet change', 'replacement'] as const).map((change) => ({ protection, change }))))(
    'keeps nothing of the $protection invoice after a $change during a pending payment', async ({ protection, change }) => {
      const wallet = new EventWallet();
      const user = await open('Pay', wallet, {}, protection);
      await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
      await screen.findByRole('heading', { name: 'Final check before your wallet' });
      const original = wallet.request.bind(wallet);
      let release!: (value: unknown) => void;
      const held = new Promise<unknown>((resolve) => { release = resolve; });
      let sends = 0;
      wallet.request = (args) => {
        if (args.method === 'eth_sendTransaction') { sends++; return held; }
        return original(args);
      };
      await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
      await approveWalletDisclosure(user, 'eth_sendTransaction');
      await vi.waitFor(() => { expect(sends).toBe(1); });
      expect(appStateHolds(PRIVATE_MEMO)).toBe(true); // Positive control: the open invoice is held.
      if (change === 'wallet change') {
        act(() => { wallet.emit('accountsChanged'); });
        await screen.findByRole('heading', { name: 'Pay an invoice' });
      } else {
        const next = await buildInvoiceLink({ ...BASE_FORM, token: 'native', tokenAmount: '0.2', memo: 'replacement invoice' }, 'https://app.test/', NOW);
        act(() => { setHash(next.fragment); window.dispatchEvent(new HashChangeEvent('hashchange')); });
        await screen.findByText('replacement invoice', { exact: true });
      }
      await vi.waitFor(() => { expect(appStateHolds(PRIVATE_MEMO)).toBe(false); });

      const hash = `0x${'7'.repeat(64)}`;
      await act(async () => { release(hash); await held; });
      await vi.waitFor(() => { expect(readAttempts()).toMatchObject([{ status: 'submitted', hash, account: MOCK_ACCOUNT }]); });
      expect(appStateHolds(PRIVATE_MEMO)).toBe(false);
      expect(screen.queryByText('Payment already requested')).toBeNull();
      expect(document.body.textContent).not.toContain(PRIVATE_MEMO);
      expect(document.body.textContent).not.toContain(hash);
      expect(sends).toBe(1);
    }, 180_000);

  // Payer rule: a wallet error code, a 4001 rejection included, never proves nothing was broadcast. The unknown journal
  // record stays until it is explicitly cleared, so the same open public invoice stays terminal after a wallet change.
  it('keeps an explicitly rejected payment terminal after a wallet change, with its unknown journal record', async () => {
    const wallet = new EventWallet({ rejectSend: true });
    const user = await open('Pay', wallet);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await screen.findByText('You rejected the request in your wallet.');
    const recorded = readAttempts();
    expect(recorded).toMatchObject([{ status: 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
    act(() => { wallet.emit('accountsChanged'); });

    expect(await screen.findByRole('heading', { name: 'Review payment' })).toBeTruthy();
    expect(screen.getByText('Payment already requested')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Connect Lifecycle Wallet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(document.body.textContent).not.toContain('Nothing was sent');
    await user.click(screen.getByRole('button', { name: 'Forget this invoice' }));
    expect(screen.queryByText('Payment already requested')).toBeNull();
    expect(readAttempts()).toEqual(recorded);
    expect(wallet.calls.filter(({ method }) => method === 'eth_sendTransaction')).toHaveLength(1);
  }, 180_000);

  // #569 follow-up (`c30283d2` wallet-disclosure e2e): the uncontrolled receipt file input kept the file chosen while
  // the previous wallet was connected. The same invalidation that clears receipt consent, key and result now drops it.
  it.each(['accountsChanged', 'chainChanged', 'disconnect'] as const)('drops a receipt file chosen for the previous wallet on %s', async (event) => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet);
    await screen.findByRole('button', { name: 'Prepare payment' });
    const input = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Signed seller receipt JSON');
    const file = new File(['{}'], 'private-receipt-account-286.json', { type: 'application/json' });
    await user.upload(input(), file);
    expect(input().files?.[0]).toBe(file);
    act(() => { wallet.emit(event); });
    await screen.findByText(WALLET_CHANGE_REASON, { exact: true });
    expect(input().files).toHaveLength(0);
    expect(input().value).toBe('');
    expect(wallet.calls.filter(({ method }) => /^(?:eth_send|eth_sign|personal_sign)/.test(method))).toEqual([]);
  }, 180_000);

});
