import { act, fireEvent, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect } from 'vitest';
import type { WalletDisclosureMethod } from '../lib/walletDisclosure';

/** Explicit one-request decision; the test names the method it expects to see. */
export async function approveWalletDisclosure(user: ReturnType<typeof userEvent.setup>, method: WalletDisclosureMethod): Promise<void> {
  const dialog = await screen.findByRole('dialog', { name: 'Review wallet disclosure' });
  expect(within(dialog).getByText(method, { exact: true })).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: 'Continue to wallet' }));
}

/** Methods every disclosure dialog showed while {@link useAutoApprovedWalletDisclosures} was active, in order. */
export interface DisclosureRecorder { readonly methods: readonly string[] }

/**
 * For suites written before the disclosure gate: every time the real dialog appears, record the method it shows and
 * press its real "Continue to wallet" button, as a user would. The gate itself is never bypassed or stubbed: a request
 * that is not shown is never approved. Suites about the disclosure itself use {@link approveWalletDisclosure} instead.
 */
export function useAutoApprovedWalletDisclosures(): DisclosureRecorder {
  const methods: string[] = [];
  let observer: MutationObserver | undefined;
  const seen = new WeakSet<Element>();
  const approveVisible = (): void => {
    const dialog = document.querySelector('.wallet-disclosure-dialog');
    if (dialog === null || seen.has(dialog)) return;
    const button = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Continue to wallet');
    if (button === undefined) return;
    seen.add(dialog);
    methods.push(dialog.querySelector('dd code')?.textContent ?? '?');
    // Outside the observer callback, so React has committed the dialog before the click arrives.
    setTimeout(() => { if (button.isConnected) act(() => { fireEvent.click(button); }); }, 0);
  };
  beforeEach(() => {
    methods.length = 0;
    observer = new MutationObserver(approveVisible);
    observer.observe(document.body, { childList: true, subtree: true });
  });
  afterEach(() => { observer?.disconnect(); observer = undefined; });
  return { methods };
}
