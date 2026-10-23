// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WalletAttempts } from './WalletAttempts';
import { beginAttempt, readAttempts } from '../lib/duplicateAttemptJournal';
beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });
it('keeps unknown outcomes until the user explicitly confirms clearing', () => {
  beginAttempt({ key: `0x${'a'.repeat(64)}`, chainId: 1, account: `0x${'1'.repeat(40)}`, kind: 'payment' });
  render(<WalletAttempts />);
  expect(screen.getByText(/outcome unknown/i)).toBeTruthy();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  expect(readAttempts()).toHaveLength(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  expect(readAttempts()).toHaveLength(0);
});
