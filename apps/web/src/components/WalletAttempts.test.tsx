// @vitest-environment jsdom
import { cleanup, fireEvent, isInaccessible, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WalletAttempts } from './WalletAttempts';
import { ATTEMPT_JOURNAL_KEY, beginAttempt, finishAttempt, readAttempts } from '../lib/duplicateAttemptJournal';
import { PrivacyProvider, usePrivacy } from '../lib/privacyMode';
import type { WalletSession } from '../lib/wallet';
const wallet: Pick<WalletSession, 'account' | 'chainId'> = { account: `0x${'1'.repeat(40)}`, chainId: 1 };
beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps unknown outcomes until the user explicitly confirms clearing', () => {
  beginAttempt({ key: `0x${'a'.repeat(64)}`, chainId: 1, account: `0x${'1'.repeat(40)}`, kind: 'payment' });
  render(<WalletAttempts wallet={wallet} />);
  expect(screen.getByText(/outcome unknown/i)).toBeTruthy();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  expect(readAttempts()).toHaveLength(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  expect(readAttempts()).toHaveLength(0);
});

it('retains the unresolved-request warning and duplicate protection without exposing a disconnected account or hash', () => {
  const hash = `0x${'b'.repeat(64)}`;
  const input = { key: `0x${'a'.repeat(64)}`, ...wallet, kind: 'payment' as const };
  const attempt = beginAttempt(input);
  finishAttempt(attempt, hash);
  const stored = sessionStorage.getItem(ATTEMPT_JOURNAL_KEY);
  render(<WalletAttempts />);
  expect(screen.queryByText(wallet.account)).toBeNull();
  expect(screen.queryByText(hash)).toBeNull();
  expect(screen.getByText(/may already have been submitted/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Clear this attempt after checking my wallet' })).toBeNull();
  expect(sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(stored);
  expect(() => beginAttempt(input)).toThrow();
});

it('shows only the connected account and chain, removing old details on account changes even outside privacy mode', () => {
  const other: typeof wallet = { account: `0x${'2'.repeat(40)}`, chainId: 1 };
  beginAttempt({ key: `0x${'a'.repeat(64)}`, ...wallet, kind: 'payment' });
  beginAttempt({ key: `0x${'b'.repeat(64)}`, ...other, kind: 'approval' });
  beginAttempt({ key: `0x${'c'.repeat(64)}`, ...wallet, chainId: 84532, kind: 'registry' });
  const panel = render(<WalletAttempts wallet={wallet} />);
  expect(screen.getAllByText(wallet.account)).toHaveLength(1);
  expect(screen.queryByText(other.account)).toBeNull();
  expect(screen.queryByText(/chain 84532/)).toBeNull();
  panel.rerender(<WalletAttempts wallet={other} />);
  expect(screen.queryByText(wallet.account)).toBeNull();
  expect(screen.getByText(other.account)).toBeTruthy();
  panel.rerender(<WalletAttempts />);
  expect(screen.queryByText(other.account)).toBeNull();
  expect(readAttempts()).toHaveLength(3);
});

it('requires a separate temporary history reveal and never revives it for a reconnected wallet', () => {
  beginAttempt({ key: `0x${'a'.repeat(64)}`, ...wallet, kind: 'payment' });
  function Reveal() { const privacy = usePrivacy(); return <button onClick={privacy.reveal}>Global reveal fixture</button>; }
  const fixture = (connected: typeof wallet | undefined) => <PrivacyProvider enabled scope="pay"><Reveal /><WalletAttempts wallet={connected} /></PrivacyProvider>;
  const panel = render(fixture(wallet));
  fireEvent.click(screen.getByRole('button', { name: 'Global reveal fixture' }));
  expect(screen.queryByText(wallet.account)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reveal history for 30 seconds' }));
  expect(isInaccessible(screen.getByText(wallet.account))).toBe(false);
  panel.rerender(fixture(undefined));
  expect(screen.queryByText(wallet.account)).toBeNull();
  panel.rerender(fixture({ ...wallet }));
  expect(screen.queryByText(wallet.account)).toBeNull();
  expect(readAttempts()).toHaveLength(1);
});
