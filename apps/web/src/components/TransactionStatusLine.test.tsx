// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DisplayMessage } from '../lib/errors';
import { TransactionStatusLine, announcedStatus } from './TransactionStatusLine';

afterEach(cleanup);

const SPENDER = `0x${'ab'.repeat(20)}`;
const live = (): HTMLElement => screen.getByRole('status');
const outsideLiveRegions = (node: Element): boolean => node.closest('[role="status"], [role="alert"], [aria-live]') === null;

// #286 item 5: a screen reader speaks a live region aloud, so a wallet instruction that names an amount or a spender
// is announced only as its phase. The exact instruction stays on screen, outside the live region, for the user to
// compare with the wallet prompt.
describe('Pay status line', () => {
  it.each<[string, DisplayMessage, RegExp]>([
    ['approve', { key: 'transaction.status.approve', values: { amount: '87129.03251', symbol: 'USDC' } }, /Approve exactly 87129\.03251 USDC for the router\./],
    ['permit', { key: 'transaction.status.permit', values: { amount: '87129.03251', symbol: 'USDC' } }, /pull exactly 87129\.03251 USDC/],
    ['revoke', { key: 'transaction.status.revoke', values: { spender: SPENDER } }, new RegExp(`Revoke the router allowance for ${SPENDER}`)],
  ])('announces only the phase of the %s instruction and shows the details outside the live region', (_name, status, detail) => {
    render(<TransactionStatusLine status={status} />);
    expect(live().textContent).toBe('Waiting for wallet confirmation…');
    expect(live().textContent).not.toMatch(/87129|USDC|0x[0-9a-f]{40}/i);
    const shown = screen.getByText(detail);
    expect(outsideLiveRegions(shown)).toBe(true);
  });

  it.each<DisplayMessage>([
    { key: 'pay.status.walletWaiting' },
    { key: 'transaction.status.verifying' },
    { key: 'transaction.status.noRpc' },
    'Plain trusted text',
  ])('keeps a value-free status in the live region unchanged and renders it once: %o', (status) => {
    expect(announcedStatus(status)).toBe(status);
    const { container } = render(<TransactionStatusLine status={status} />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(live().textContent).not.toBe('');
  });
});
