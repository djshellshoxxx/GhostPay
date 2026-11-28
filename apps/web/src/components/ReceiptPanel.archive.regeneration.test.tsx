// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { verifyReceipt } from '../lib/receipts';
import type { ScanMatch } from '../lib/scanClient';
import { ReceiptPanel } from './ReceiptPanel';

const vaultFactory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: vaultFactory.create,
}));

beforeEach(clearSession);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vaultFactory.create.mockReset();
});

function verifiedMatch(): ScanMatch {
  return {
    chainId: 84532,
    announcement: { transactionHash: `0x${'c'.repeat(64)}` },
    stealthAddress: `0x${'a'.repeat(40)}`,
    metadata: { kind: 'native', token: '0x', netAmount: 123_456n, viewTag: 1 },
    viaRouter: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
}

function displayedReceipt(): Record<string, unknown> {
  const value = screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value;
  const parsed: unknown = JSON.parse(value);
  expect(verifyReceipt(parsed)).toBe(true);
  return parsed as Record<string, unknown>;
}

async function startWithReceiptA() {
  const seller = generateSession();
  const user = userEvent.setup();
  render(<ReceiptPanel match={verifiedMatch()} sellerSignerPublicKey={seller.signerPublicKey} />);
  await user.type(screen.getByLabelText('Invoice digest (entered manually)'), `0x${'d'.repeat(64)}`);
  await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
  await screen.findByLabelText('Signed receipt JSON');
  return { user, first: displayedReceipt() };
}

async function regenerateReceiptB(user: ReturnType<typeof userEvent.setup>) {
  // Editing the invoice link invalidates the old receipt, without changing the scan or seller.
  fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: 'new invoice binding' } });
  const digest = screen.getByLabelText<HTMLInputElement>('Invoice digest (entered manually)');
  await user.clear(digest);
  await user.type(digest, `0x${'e'.repeat(64)}`);
  await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
  await screen.findByLabelText('Signed receipt JSON');
  return displayedReceipt();
}

describe('ReceiptPanel archive ownership across receipt regeneration', () => {
  it('lets a distinct receipt B be archived after receipt A was already archived', async () => {
    const vault = { archiveReceipt: vi.fn().mockResolvedValue(undefined), lock: vi.fn() };
    vaultFactory.create.mockResolvedValue(vault);
    const { user, first } = await startWithReceiptA();
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    await screen.findByRole('button', { name: 'Receipt archived' });
    expect(vault.archiveReceipt).toHaveBeenCalledWith(expect.objectContaining({ signature: first.signature }));

    const second = await regenerateReceiptB(user);
    expect(second.signature).not.toBe(first.signature);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Archive in encrypted vault' });
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(() => expect(vault.archiveReceipt).toHaveBeenCalledTimes(2));
    expect(vault.archiveReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ signature: second.signature }));
    await screen.findByRole('button', { name: 'Receipt archived' });
    expect(vault.lock).toHaveBeenCalledTimes(2);
  });

  it('does not attribute the delayed archive completion of A to B', async () => {
    let finishArchiveA!: () => void;
    const archiveReceipt = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishArchiveA = resolve; }))
      .mockResolvedValue(undefined);
    const vault = { archiveReceipt, lock: vi.fn() };
    vaultFactory.create.mockResolvedValue(vault);
    const { user, first } = await startWithReceiptA();
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    await waitFor(() => expect(archiveReceipt).toHaveBeenCalledTimes(1));
    expect(archiveReceipt).toHaveBeenCalledWith(expect.objectContaining({ signature: first.signature }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Archiving receipt…' }).disabled).toBe(true);

    const second = await regenerateReceiptB(user);
    expect(second.signature).not.toBe(first.signature);
    // The immutable archive write for A must settle before a B write may start.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Waiting for the previous receipt to finish archiving…' }).disabled).toBe(true);
    expect(archiveReceipt).toHaveBeenCalledTimes(1);
    await act(async () => { finishArchiveA(); await Promise.resolve(); });
    await waitFor(() => expect(vault.lock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Receipt archived' })).toBeNull();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Archive in encrypted vault' });
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(() => expect(archiveReceipt).toHaveBeenCalledTimes(2));
    expect(archiveReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ signature: second.signature }));
    await screen.findByRole('button', { name: 'Receipt archived' });
    expect(vault.lock).toHaveBeenCalledTimes(2);
  });
});
