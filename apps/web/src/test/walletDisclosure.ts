import { screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import type { WalletDisclosureMethod } from '../lib/walletDisclosure';

/** Explicit one-request decision; tests name the method and never install an automatic approval hook. */
export async function approveWalletDisclosure(user: ReturnType<typeof userEvent.setup>, method: WalletDisclosureMethod): Promise<void> {
  const dialog = await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
  expect(within(dialog).getByText(method, { exact: true })).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: 'Continue to wallet' }));
}
