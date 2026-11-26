// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { approveWalletDisclosure } from '../../test/walletDisclosure';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, beginAttempt, finishAttempt, withAttemptJournal } from '../../lib/duplicateAttemptJournal';
import { clearSession } from '../../lib/session';
import { SETTINGS_KEY } from '../../lib/settings';
import { generateWaivedSession } from '../../test/keys';
import { MockWallet } from '../../test/mockWallet';
import { makeServices, renderApp } from '../../test/render';

const CHAIN = 11155111;
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

it('binds registry history to the connected account and chain, then conceals it when consent is withdrawn without erasing evidence', async () => {
  generateWaivedSession();
  const wallet = new MockWallet({ chainId: CHAIN });
  const matching = await withAttemptJournal((store) => beginAttempt({ key: `0x${'a'.repeat(64)}`, chainId: CHAIN, account: wallet.account, kind: 'registry' }, store));
  const hash = `0x${'7'.repeat(64)}`;
  await withAttemptJournal((store) => { finishAttempt(matching, hash, store); });
  const otherAccount = `0x${'6'.repeat(40)}`;
  await withAttemptJournal((store) => beginAttempt({ key: `0x${'b'.repeat(64)}`, chainId: CHAIN, account: otherAccount, kind: 'payment' }, store));
  await withAttemptJournal((store) => beginAttempt({ key: `0x${'c'.repeat(64)}`, chainId: 1, account: wallet.account, kind: 'approval' }, store));
  const stored = localStorage.getItem(ATTEMPT_JOURNAL_KEY);
  const createRpc = vi.fn(() => Promise.reject(new Error('No lookup expected')));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [String(CHAIN)]: 'https://rpc.test' } }));
  renderApp(makeServices({ createRpc, discoverWallets: () => Promise.resolve([{ id: 'mock', name: 'Mock Wallet', kind: 'eip6963', provider: wallet }]) }));
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
  const disconnectedJournal = screen.getByRole('region', { name: 'Wallet attempt journal' });
  expect(within(disconnectedJournal).queryByText(wallet.account)).toBeNull();
  expect(within(disconnectedJournal).queryByText(hash)).toBeNull();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Find wallets' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Mock Wallet' }));
  await approveWalletDisclosure(user, 'eth_requestAccounts');
  await screen.findByRole('button', { name: 'Review publish transaction' });
  // The public shell survives; only the account-scoped rows are mounted for the connected owner.
  const journal = screen.getByRole('region', { name: 'Wallet attempt journal' });
  expect(within(journal).getByText(wallet.account)).toBeTruthy();
  expect(within(journal).getByText(hash)).toBeTruthy();
  expect(within(journal).queryByText(otherAccount)).toBeNull();
  expect(within(journal).getAllByRole('listitem')).toHaveLength(1);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await user.click(within(journal).getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(stored);
  await user.click(screen.getByRole('checkbox'));
  expect(within(journal).queryByRole('list')).toBeNull();
  const withdrawnJournal = screen.getByRole('region', { name: 'Wallet attempt journal' });
  expect(within(withdrawnJournal).queryByText(wallet.account)).toBeNull();
  expect(within(withdrawnJournal).queryByText(hash)).toBeNull();
  expect(within(withdrawnJournal).queryByRole('button', { name: 'Clear this attempt after checking my wallet' })).toBeNull();
  expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(stored);
  expect(createRpc).not.toHaveBeenCalled();
  expect(wallet.sent).toBeUndefined();
});
