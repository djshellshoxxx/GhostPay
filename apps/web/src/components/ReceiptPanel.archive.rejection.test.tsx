// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UserFacingError } from '../lib/errors';
import { verifyReceipt } from '../lib/receipts';
import type { ScanMatch } from '../lib/scanClient';
import { clearSession, generateSession } from '../lib/session';
import { ReceiptPanel } from './ReceiptPanel';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));

beforeEach(clearSession);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  factory.create.mockReset();
});

function displayedReceipt(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value);
  expect(verifyReceipt(parsed)).toBe(true);
  return parsed as Record<string, unknown>;
}

it('retires a rejected archive of A without reporting an error for newly signed B', async () => {
  let rejectArchiveA!: (error: unknown) => void;
  const archiveReceipt = vi.fn()
    .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectArchiveA = reject; }))
    .mockResolvedValue(undefined);
  const vault = { archiveReceipt, lock: vi.fn() };
  factory.create.mockResolvedValue(vault);
  const seller = generateSession();
  const user = userEvent.setup();
  const match = {
    chainId: 84532,
    announcement: { transactionHash: `0x${'c'.repeat(64)}` },
    stealthAddress: `0x${'a'.repeat(40)}`,
    metadata: { kind: 'native', token: '0x', netAmount: 123_456n, viewTag: 1 },
    viaRouter: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
  render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} />);
  fireEvent.change(screen.getByLabelText('Invoice digest (entered manually)'), { target: { value: `0x${'d'.repeat(64)}` } });
  await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
  const first = displayedReceipt();
  await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
  await waitFor(() => expect(archiveReceipt).toHaveBeenCalledTimes(1));
  expect(archiveReceipt).toHaveBeenCalledWith(expect.objectContaining({ signature: first.signature }));

  fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: 'new invoice binding' } });
  fireEvent.change(screen.getByLabelText('Invoice digest (entered manually)'), { target: { value: `0x${'e'.repeat(64)}` } });
  await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
  const second = displayedReceipt();
  expect(second.signature).not.toBe(first.signature);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Archive in encrypted vault' }).disabled).toBe(true);
  expect(archiveReceipt).toHaveBeenCalledTimes(1);

  await act(() => Promise.resolve(rejectArchiveA(new UserFacingError('The first receipt archive failed.'))));
  await waitFor(() => expect(vault.lock).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Receipt archived' })).toBeNull();
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Archive in encrypted vault' });
  expect(button.disabled).toBe(false);
  await user.click(button);
  await waitFor(() => expect(archiveReceipt).toHaveBeenCalledTimes(2));
  expect(archiveReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ signature: second.signature }));
  await screen.findByRole('button', { name: 'Receipt archived' });
  expect(vault.lock).toHaveBeenCalledTimes(2);
});
