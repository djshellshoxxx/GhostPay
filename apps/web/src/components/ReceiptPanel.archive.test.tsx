// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { checkpointKeyId, type ScanMatch } from '../lib/scanClient';
import { verifyReceipt } from '../lib/receipts';
import { ReceiptPanel } from './ReceiptPanel';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  factory.create.mockReset();
});
beforeEach(clearSession);

function verifiedMatch(tx = 'c'): ScanMatch {
  return {
    chainId: 84532,
    announcement: { transactionHash: `0x${tx.repeat(64)}` },
    stealthAddress: `0x${'a'.repeat(40)}`,
    metadata: { kind: 'native', token: '0x', netAmount: 123_456n, viewTag: 1 },
    viaRouter: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
}
async function signed(match = verifiedMatch()) {
  const seller = generateSession();
  const user = userEvent.setup();
  const view = render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} />);
  await user.type(screen.getByLabelText('Invoice digest (entered manually)'), `0x${'d'.repeat(64)}`);
  await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
  await screen.findByLabelText('Signed receipt JSON');
  return { seller, user, view };
}

describe('ReceiptPanel encrypted archive', () => {
  it('archives the signed receipt in the current seller scope and locks the vault', async () => {
    const vault = { archiveReceipt: vi.fn().mockResolvedValue(undefined), lock: vi.fn() };
    factory.create.mockResolvedValue(vault);
    const { seller, user } = await signed();
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    const done = await screen.findByRole<HTMLButtonElement>('button', { name: 'Receipt archived' });
    expect(done.disabled).toBe(true);
    expect(factory.create).toHaveBeenCalledWith(84532, checkpointKeyId(seller.spendingPublicKey, seller.viewingPublicKey));
    expect(verifyReceipt(vault.archiveReceipt.mock.calls[0]![0])).toBe(true);
    expect(vault.lock).toHaveBeenCalledOnce();
    expect(screen.getByText(/never counts as payment evidence/)).toBeTruthy();
  });

  it('reports archive failures, still locking the vault, and allows a retry', async () => {
    const vault = { archiveReceipt: vi.fn().mockRejectedValueOnce(new Error('At most 500 receipts can be archived.')), lock: vi.fn() };
    factory.create.mockResolvedValue(vault);
    const { user } = await signed();
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    expect(await screen.findByText(/At most 500 receipts/)).toBeTruthy();
    expect(vault.lock).toHaveBeenCalledOnce();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Archive in encrypted vault' }).disabled).toBe(false);
    factory.create.mockRejectedValueOnce('locked');
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    expect(await screen.findByText('The receipt could not be archived.')).toBeTruthy();
  });

  it('refuses to archive after the seller keys change', async () => {
    const { user } = await signed();
    generateSession();
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    expect(screen.getByText('Seller keys changed. The receipt was not archived.')).toBeTruthy();
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('ignores an archive result that finishes after the match changed', async () => {
    let release!: () => void;
    const vault = { archiveReceipt: vi.fn(() => new Promise<void>((resolve) => { release = resolve; })), lock: vi.fn() };
    factory.create.mockResolvedValue(vault);
    const { seller, user, view } = await signed();
    await user.click(screen.getByRole('button', { name: 'Archive in encrypted vault' }));
    await waitFor(() => expect(vault.archiveReceipt).toHaveBeenCalled());
    view.rerender(<ReceiptPanel match={verifiedMatch('e')} sellerSignerPublicKey={seller.signerPublicKey} />);
    release();
    await waitFor(() => expect(vault.lock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Receipt archived' })).toBeNull();
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });
});
