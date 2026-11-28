// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WalletAttempts } from './WalletAttempts';
import { ATTEMPT_JOURNAL_KEY, beginAttempt, finishReturnedAttempt, readReturnedAttempts, retryReturnedAttempts, withAttemptJournal } from '../lib/duplicateAttemptJournal';
import { clearSession } from '../lib/session';
import type { WalletSession } from '../lib/wallet';
import { MockWallet } from '../test/mockWallet';

// A returned hash whose durable save failed lives only in this tab. Before the matching owner connects, the panel must
// still say so (without any account, chain or hash), offer a wallet-free retry, and the tab must ask before unloading.
const stage = vi.hoisted(() => ({ fail: false }));
vi.mock('../lib/attemptJournalStorage', async (load) => {
  const actual = await load<typeof import('../lib/attemptJournalStorage')>();
  return { ...actual, updateJournalSnapshot: <T,>(update: (saved: unknown) => { readonly result: T; readonly snapshot: string }) =>
    actual.updateJournalSnapshot((saved) => {
      const next = update(saved);
      if (stage.fail) throw new Error('synthetic IndexedDB commit failure');
      return next;
    }),
  };
});

const accountA = `0x${'1'.repeat(40)}` as const;
const accountB = `0x${'2'.repeat(40)}` as const;
const hashA = `0x${'a'.repeat(64)}`;
const actionKey = `0x${'f'.repeat(64)}`;
const UNSAVED_OTHER = 'A returned transaction hash has not finished saving in this tab.';
const session = (account: WalletSession['account']): WalletSession => ({ account, chainId: 84532, wallet: { id: account, name: 'Wallet', kind: 'injected', provider: new MockWallet({ account }) } });

async function unsavedReturn(): Promise<void> {
  const attempt = await withAttemptJournal((store) => beginAttempt({ account: accountA, chainId: 84532, key: actionKey, kind: 'payment' }, store));
  stage.fail = true;
  await expect(finishReturnedAttempt(attempt, hashA)).rejects.toThrow(/journal/i);
  stage.fail = false;
  expect(readReturnedAttempts()).toHaveLength(1);
}
function unloadBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
beforeEach(() => { stage.fail = false; clearSession(); localStorage.clear(); sessionStorage.clear(); });
afterEach(async () => { cleanup(); stage.fail = false; vi.restoreAllMocks(); await retryReturnedAttempts(); clearSession(); });

it('states an unsaved returned hash before connection without revealing it, and saves it with no wallet request', async () => {
  await unsavedReturn();
  render(<WalletAttempts />);
  expect(await screen.findByText(new RegExp(UNSAVED_OTHER))).toBeTruthy();
  expect(screen.getByText('Connect the relevant wallet account and chain to reveal its attempts.')).toBeTruthy();
  expect(document.body.textContent).not.toContain(hashA);
  expect(document.body.textContent).not.toContain(accountA);
  expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '').not.toContain(hashA);

  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry saving returned hashes' }));
  await waitFor(() => { expect(screen.queryByText(new RegExp(UNSAVED_OTHER))).toBeNull(); });
  expect(readReturnedAttempts()).toEqual([]);
  expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toContain(hashA);
  expect(document.body.textContent).not.toContain(hashA);
});

it('still states an unsaved hash that belongs to another connected account, without its details', async () => {
  await unsavedReturn();
  const other = session(accountB);
  render(<WalletAttempts wallet={other} />);
  expect(await screen.findByText(new RegExp(UNSAVED_OTHER))).toBeTruthy();
  expect(document.body.textContent).not.toContain(hashA);
  expect(document.body.textContent).not.toContain(accountA);
  expect((other.wallet.provider as MockWallet).calls).toEqual([]);
});

it('asks before unloading only while a browser-store returned hash is unsaved', async () => {
  expect(unloadBlocked()).toBe(false);
  await unsavedReturn();
  expect(unloadBlocked()).toBe(true);
  await retryReturnedAttempts();
  expect(readReturnedAttempts()).toEqual([]);
  expect(unloadBlocked()).toBe(false);
});
