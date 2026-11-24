// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { approveWalletDisclosure } from '../test/walletDisclosure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { ATTEMPT_JOURNAL_KEY, clearAttempt, readAttempts } from '../lib/duplicateAttemptJournal';
import { clearSession, getSessionPublic } from '../lib/session';
import { createNetworkAuthority, type NetworkAuthorization, type NetworkAuthority } from '../lib/networkAuthorization';
import type { Services } from '../lib/services';
import { SETTINGS_KEY } from '../lib/settings';
import { type WalletInfo } from '../lib/wallet';
import { generateWaivedSession } from '../test/keys';
import { makeParsed } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';
import { POLICY_FLAG } from '../features/policy/flag';

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
type Route = 'Pay' | 'Public registry' | 'Policy accounts (experimental)';
const routes: readonly Route[] = ['Pay', 'Public registry', 'Policy accounts (experimental)'];
const authorities: NetworkAuthority[] = [];

beforeEach(() => {
  clearSession(); window.localStorage.clear(); window.sessionStorage.clear(); setHash('');
  vi.stubEnv(POLICY_FLAG, '1');
});
afterEach(() => { for (const authority of authorities.splice(0)) authority.dispose(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function open(route: Route, wallet: EventWallet, overrides: Partial<Services> = {}) {
  const user = userEvent.setup();
  if (route === 'Pay') {
    const { fragment } = await makeParsed({ token: 'native', tokenAmount: '0.1' });
    setHash(fragment);
  } else if (route === 'Public registry') generateWaivedSession();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test', '11155111': 'https://rpc.test' } }));
  renderApp(makeServices({
    loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }),
    createRpc: () => Promise.resolve(withManifestChain(mockRpc(84532, () => '0x'))),
    discoverWallets: () => Promise.resolve([info(wallet)]),
    ...overrides,
  }));
  if (route === 'Pay') await user.click(await screen.findByRole('button', { name: 'Continue' }));
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
    // Pay also retains three account-scoped local reuse listeners; neither path retains the obsolete connection.
    expect([...wallet.listeners.values()].reduce((sum, set) => sum + set.size, 0)).toBe(route === 'Pay' ? 6 : 3);
  });

  it.each([
    ['accountsChanged', 'known hash'], ['chainChanged', 'known hash'], ['disconnect', 'known hash'],
    ['accountsChanged', 'lost response'], ['chainChanged', 'lost response'], ['disconnect', 'lost response'],
  ] as const)('Pay stops the old RPC scope after %s while preserving a late %s', async (event, outcome) => {
    const wallet = new EventWallet();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test', '11155111': 'https://rpc.test' } }));
    const authority = createNetworkAuthority();
    authorities.push(authority);
    const records: { readonly grant: NetworkAuthorization; readonly reads: string[] }[] = [];
    const createRpc: Services['createRpc'] = (chain, url, grant) => {
      authority.assertRpcAuthorization(grant, chain.chainId, url);
      if (grant === undefined) throw new Error('Expected operation authority');
      const record = { grant, reads: [] as string[] };
      records.push(record);
      const base = withManifestChain(mockRpc(chain.chainId, () => null));
      const read = async <T,>(method: string, action: () => Promise<T>): Promise<T> => {
        // The production transport checks the actual opaque grant before and after every request.
        authority.assertRpcAuthorization(grant, chain.chainId, url);
        record.reads.push(method);
        const result = await action();
        authority.assertRpcAuthorization(grant, chain.chainId, url);
        return result;
      };
      return Promise.resolve({
        chainId: chain.chainId,
        request: (method, params) => read(method, () => base.request(method, params)),
        blockNumber: () => read('eth_blockNumber', () => base.blockNumber()),
        getBlock: (number) => read('eth_getBlockByNumber', () => base.getBlock(number)),
        getLogs: (filter) => read('eth_getLogs', () => base.getLogs(filter)),
      });
    };
    const user = await open('Pay', wallet, { network: authority, createRpc });
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const original = wallet.request.bind(wallet);
    let release!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const held = new Promise<unknown>((resolve, fail) => { release = resolve; reject = fail; });
    let sent = 0;
    wallet.request = (args) => {
      if (args.method === 'eth_sendTransaction') { sent++; return held; }
      return original(args);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => { expect(sent).toBe(1); });
    const active = records.at(-1);
    if (active === undefined) throw new Error('Expected captured send RPC scope');
    expect(active.grant.signal.aborted).toBe(false);
    const readsBefore = [...active.reads];
    const revision = authority.getRevision();
    const seller = getSessionPublic();
    expect(readAttempts()).toMatchObject([{ status: 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
    act(() => { wallet.emit(event); });
    const hash = `0x${'9'.repeat(64)}`;
    await act(async () => {
      if (outcome === 'known hash') release(hash);
      else reject(new Error('private provider diagnostics'));
      await held.catch(() => undefined);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(readAttempts()).toMatchObject([{ status: outcome === 'known hash' ? 'submitted' : 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
      expect(document.body.textContent).not.toContain(hash);
      expect(document.body.textContent).toContain('A previous wallet request may already have been submitted');
    });
    expect(active.reads).toEqual(readsBefore);
    expect(active.grant.signal.aborted).toBe(true);
    expect(() => active.grant.assertCurrent()).toThrow();
    // Revoke only this wallet operation; keep independent page authorization and the seller's recovery authority.
    expect(authority.getRevision()).toBe(revision);
    expect(getSessionPublic()).toEqual(seller);
    expect(readAttempts()[0]?.hash).toBe(outcome === 'known hash' ? hash : undefined);
    expect(sent).toBe(1);
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(document.body.textContent).not.toContain('private provider diagnostics');
  });

  it('recovers a late hash only for the original wallet after its journal completion write fails', async () => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const original = wallet.request.bind(wallet);
    let release!: (hash: string) => void;
    const held = new Promise<string>((resolve) => { release = resolve; });
    let account = MOCK_ACCOUNT;
    wallet.request = (args) => {
      if (args.method === 'eth_sendTransaction') return held;
      if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') return Promise.resolve([account]);
      return original(args);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => expect(readAttempts()).toMatchObject([{ status: 'unknown', account: MOCK_ACCOUNT }]));
    act(() => { wallet.emit('accountsChanged'); });
    const writeSession = sessionStorage.setItem.bind(sessionStorage);
    const writeLocal = localStorage.setItem.bind(localStorage);
    const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage && key === ATTEMPT_JOURNAL_KEY) throw new Error('fixture quota');
      (this === sessionStorage ? writeSession : writeLocal)(key, value);
    });
    const hash = `0x${'7'.repeat(64)}`;
    await act(async () => { release(hash); await held; });
    expect(failed).toHaveBeenCalled();
    expect(sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).not.toContain(hash);
    expect(document.body.textContent).not.toContain(hash);
    failed.mockRestore();
    account = '0x6666666666666666666666666666666666666666';
    await user.click(await screen.findByRole('button', { name: /Connect Lifecycle Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    await screen.findByText(account, { exact: true });
    expect(document.body.textContent).not.toContain(hash);
    account = MOCK_ACCOUNT;
    act(() => { wallet.emit('accountsChanged'); });
    await user.click(await screen.findByRole('button', { name: /Connect Lifecycle Wallet/ }));
    await approveWalletDisclosure(user, 'eth_requestAccounts');
    expect(await screen.findByText(hash, { exact: true })).toBeTruthy();
    expect(sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toContain(hash);
    const [attempt] = readAttempts();
    if (attempt === undefined) throw new Error('Expected recovery record');
    act(() => { clearAttempt(attempt.id, true); });
    expect(readAttempts()).toHaveLength(0);
  });

  it.each(['known hash', 'lost response'] as const)('Pay preserves %s evidence after a wallet request outlives app lock', async (outcome) => {
    const wallet = new EventWallet();
    const user = await open('Pay', wallet);
    await user.click(await screen.findByRole('button', { name: 'Prepare payment' }));
    await screen.findByRole('heading', { name: 'Final check before your wallet' });
    const original = wallet.request.bind(wallet);
    let release!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const held = new Promise<unknown>((resolve, fail) => { release = resolve; reject = fail; });
    let sent = 0;
    wallet.request = (args) => {
      if (args.method === 'eth_sendTransaction') { sent++; return held; }
      return original(args);
    };
    await user.click(screen.getByRole('button', { name: 'Send payment in my wallet' }));
    await approveWalletDisclosure(user, 'eth_sendTransaction');
    await vi.waitFor(() => { expect(sent).toBe(1); });
    expect(readAttempts()).toMatchObject([{ status: 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
    act(() => { notifyAppLock('manual'); });
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    const hash = `0x${'9'.repeat(64)}`;
    await act(async () => {
      if (outcome === 'known hash') release(hash);
      else reject(new Error('private provider diagnostics'));
      await held.catch(() => undefined);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(readAttempts()).toMatchObject([{ status: outcome === 'known hash' ? 'submitted' : 'unknown', kind: 'payment', account: MOCK_ACCOUNT }]);
    });
    if (outcome === 'known hash') {
      expect(readAttempts()[0]?.hash).toBe(hash);
      expect(document.body.textContent).not.toContain(hash);
    } else {
      expect(readAttempts()[0]?.hash).toBeUndefined();
      expect(document.body.textContent).toContain('A previous wallet request may already have been submitted');
    }
    expect(sent).toBe(1);
    expect(screen.queryByRole('button', { name: 'Send payment in my wallet' })).toBeNull();
    expect(screen.queryByText(MOCK_ACCOUNT, { exact: true })).toBeNull();
    expect(document.body.textContent).not.toContain('private provider diagnostics');
  });
});
