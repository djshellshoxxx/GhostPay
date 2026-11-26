// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WalletAttempts } from './WalletAttempts';
import { WalletDisclosureProvider } from './WalletDisclosure';
import { ServicesContext } from '../lib/services';
import { ATTEMPT_JOURNAL_KEY, beginAttempt, finishReturnedAttempt, readAttempts, readReturnedAttempts, retryReturnedAttempts, withAttemptJournal } from '../lib/duplicateAttemptJournal';
import { notifyAppLock } from '../lib/appLock';
import { clearSession } from '../lib/session';
import { type WalletSession } from '../lib/wallet';
import { MockWallet } from '../test/mockWallet';
import { makeServices } from '../test/render';
import { approveWalletDisclosure } from '../test/walletDisclosure';
import { mockRpc } from '../test/mockRpc';

const accountA = `0x${'1'.repeat(40)}` as const;
const accountB = `0x${'2'.repeat(40)}` as const;
const hashA = `0x${'a'.repeat(64)}`;
const hashB = `0x${'b'.repeat(64)}`;
class EventWallet extends MockWallet {
  readonly listeners = new Map<string, Set<() => void>>();
  on(event: string, listener: () => void): void { const set = this.listeners.get(event) ?? new Set<() => void>(); set.add(listener); this.listeners.set(event, set); }
  removeListener(event: string, listener: () => void): void { this.listeners.get(event)?.delete(listener); }
  emit(event: string): void { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(); }
}
function session(account: WalletSession['account'], chainId = 84532): WalletSession & { readonly wallet: { readonly provider: EventWallet } } {
  return { account, chainId, wallet: { id: account, name: 'Recovery wallet', kind: 'injected', provider: new EventWallet({ account, chainId }) } };
}
async function recorded(account: string, hash: string, chainId = 84532): Promise<void> {
  const attempt = await withAttemptJournal((store) => beginAttempt({ account, chainId, key: hash, kind: 'payment' }, store));
  await finishReturnedAttempt(attempt, hash);
}
beforeEach(() => { clearSession(); localStorage.clear(); sessionStorage.clear(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await retryReturnedAttempts(); clearSession(); });

it('hides disconnected and other-account or other-chain entries without deleting journal evidence', async () => {
  await recorded(accountA, hashA); await recorded(accountB, hashB); await recorded(accountA, `0x${'c'.repeat(64)}`, 1);
  const before = localStorage.getItem(ATTEMPT_JOURNAL_KEY);
  const owner = session(accountA);
  const view = render(<WalletAttempts />);
  expect(await screen.findByText('Connect the relevant wallet account and chain to reveal its attempts.')).toBeTruthy();
  expect(document.body.textContent).not.toContain(accountA);
  expect(document.body.textContent).not.toContain(hashA);
  expect(screen.queryByRole('button', { name: 'Clear this attempt after checking my wallet' })).toBeNull();
  view.rerender(<WalletAttempts wallet={owner} />);
  expect(await screen.findByText(hashA)).toBeTruthy();
  expect(document.body.textContent).not.toContain(accountB);
  expect(document.body.textContent).not.toContain(hashB);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  act(() => { notifyAppLock('manual'); });
  expect(document.body.textContent).not.toContain(accountA);
  expect(document.body.textContent).not.toContain(hashA);
  expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(before);
});

it('revokes a pending status lookup before its RPC can read a hash and does not revive the supplied wallet', async () => {
  await recorded(accountA, hashA);
  const owner = session(accountA);
  const rpc = mockRpc(84532, () => { throw new Error('No lookup expected'); });
  const request = vi.spyOn(rpc, 'request');
  let release!: (value: typeof rpc) => void;
  const held = new Promise<typeof rpc>((resolve) => { release = resolve; });
  const getRpc = vi.fn(() => held);
  const view = render(<WalletAttempts wallet={owner} getRpc={getRpc} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check status on my RPC' }));
  act(() => { owner.wallet.provider.emit('accountsChanged'); });
  await act(async () => { release(rpc); await held; });
  expect(request).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(hashA);
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<WalletAttempts wallet={owner} getRpc={getRpc} />);
  expect(document.body.textContent).not.toContain(hashA);
  view.rerender(<WalletAttempts wallet={session(accountA)} getRpc={getRpc} />);
  expect(await screen.findByText(hashA)).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});

it('uses an explicitly approved recovery wallet and never resurrects an older revoked parent wallet', async () => {
  await recorded(accountA, hashA); await recorded(accountB, hashB);
  const old = session(accountA); const next = session(accountB);
  const discoverWallets = vi.fn(() => Promise.resolve([next.wallet]));
  const services = makeServices({ discoverWallets });
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactNode =>
    <ServicesContext.Provider value={services}><WalletDisclosureProvider scope="recovery-test">{children}</WalletDisclosureProvider></ServicesContext.Provider>;
  const view = render(<WalletAttempts wallet={old} />, { wrapper });
  expect(await screen.findByText(hashA)).toBeTruthy();
  act(() => { old.wallet.provider.emit('disconnect'); });
  expect(document.body.textContent).not.toContain(hashA);
  expect(discoverWallets).not.toHaveBeenCalled();
  expect(next.wallet.provider.calls).toEqual([]);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Network for wallet history'), '84532');
  await user.click(screen.getByRole('button', { name: 'Find wallet for history' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Recovery wallet' }));
  expect(next.wallet.provider.calls).toEqual([]);
  await approveWalletDisclosure(user, 'eth_requestAccounts');
  expect(await screen.findByText(hashB)).toBeTruthy();
  expect(document.body.textContent).not.toContain(hashA);
  act(() => { next.wallet.provider.emit('disconnect'); });
  view.rerender(<WalletAttempts wallet={old} />);
  expect(document.body.textContent).not.toContain(hashA);
  expect(document.body.textContent).not.toContain(hashB);
  expect(next.wallet.provider.calls.filter(({ method }) => method.startsWith('eth_send') || method.startsWith('eth_sign'))).toEqual([]);
  expect(readAttempts()).toHaveLength(2);
});

it('shows an unsaved hash only for its owner and retries persistence without wallet or RPC activity', async () => {
  const attempt = await withAttemptJournal((store) => beginAttempt({ account: accountA, chainId: 84532, key: hashA, kind: 'payment' }, store));
  const writeLocal = localStorage.setItem.bind(localStorage);
  const writeSession = sessionStorage.setItem.bind(sessionStorage);
  const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (this === localStorage && key === ATTEMPT_JOURNAL_KEY) throw new Error('synthetic write refusal');
    (this === localStorage ? writeLocal : writeSession)(key, value);
  });
  await expect(finishReturnedAttempt(attempt, hashA)).rejects.toThrow(/journal/i);
  const owner = session(accountA); const other = session(accountB);
  const getRpc = vi.fn(() => Promise.resolve(undefined));
  const view = render(<WalletAttempts wallet={other} getRpc={getRpc} />);
  expect(document.body.textContent).not.toContain(hashA);
  view.rerender(<WalletAttempts wallet={owner} getRpc={getRpc} />);
  expect(await screen.findByText(hashA)).toBeTruthy();
  expect(screen.getByText(/only in this open tab until storage succeeds/)).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]')).toEqual([attempt]);
  failed.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry saving returned hashes' }));
  await waitFor(() => { expect(readReturnedAttempts()).toEqual([]); });
  expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toContain(hashA);
  expect(getRpc).not.toHaveBeenCalled();
  expect(owner.wallet.provider.calls).toEqual([]);
  expect(other.wallet.provider.calls).toEqual([]);
});
