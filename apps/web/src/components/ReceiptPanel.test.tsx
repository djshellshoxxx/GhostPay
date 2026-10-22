// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import type { ScanMatch } from '../lib/scanClient';
import { verifyReceipt } from '../lib/receipts';
import { ReceiptPanel } from './ReceiptPanel';

afterEach(cleanup);
beforeEach(clearSession);

function verifiedMatch(txHash?: string): ScanMatch {
  return {
    chainId: 84532,
    announcement: { transactionHash: txHash },
    stealthAddress: `0x${'a'.repeat(40)}`,
    metadata: { kind: 'erc20', token: `0x${'b'.repeat(40)}`, netAmount: 123_456n, viewTag: 1 },
    viaRouter: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
}

describe('ReceiptPanel', () => {
  it('explains the missing transaction hash and keeps signing disabled', () => {
    const seller = generateSession();
    render(<ReceiptPanel match={verifiedMatch()} sellerSignerPublicKey={seller.signerPublicKey} />);
    expect(screen.getByText(/RPC did not provide a transaction hash/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign receipt' }).disabled).toBe(true);
  });

  it('blocks signing when seller keys no longer match the scan', () => {
    generateSession();
    const other = generateSession();
    render(<ReceiptPanel match={verifiedMatch(`0x${'c'.repeat(64)}`)} sellerSignerPublicKey={`0x${'1'.repeat(66)}`} />);
    expect(screen.getByText(/Seller keys changed after this scan/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign receipt' }).disabled).toBe(true);
    expect(other.signerPublicKey).not.toBe(`0x${'1'.repeat(66)}`);
  });

  it('signs a canonical receipt using the verified match fields and the manually supplied digest', async () => {
    const seller = generateSession();
    const user = userEvent.setup();
    render(<ReceiptPanel match={verifiedMatch(`0x${'c'.repeat(64)}`)} sellerSignerPublicKey={seller.signerPublicKey} />);
    expect(screen.getByText(/base units of 0xbb/)).toBeTruthy();
    const digest = `0x${'d'.repeat(64)}`;
    await user.type(screen.getByLabelText('Invoice digest (entered manually)'), digest);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    await waitFor(() => { expect(screen.getByLabelText('Signed receipt JSON')).toBeTruthy(); });
    const json = screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value;
    const receipt = JSON.parse(json) as Record<string, unknown>;
    expect(verifyReceipt(receipt)).toBe(true);
    expect(receipt).toMatchObject({
      version: 1,
      invoiceDigest: digest,
      chainId: 84532,
      txHash: `0x${'c'.repeat(64)}`,
      stealthAddress: `0x${'a'.repeat(40)}`,
      asset: `0x${'b'.repeat(40)}`,
      amountMinorUnits: '123456',
      signerPublicKey: seller.signerPublicKey,
    });
    expect(screen.getAllByText(/not matched/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: 'Signed seller receipt JSON' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show receipt QR' }));
    expect(screen.getByRole('img', { name: 'Signed seller receipt JSON' })).toBeTruthy();
    expect(document.querySelector('[data-qr-kind="proof"]')).toBeTruthy();
    expect(screen.getByText(/This QR contains the transaction, recipient, amount and invoice digest/)).toBeTruthy();
  });

  it('rejects an invalid manually supplied invoice digest without producing a receipt', async () => {
    const seller = generateSession();
    const user = userEvent.setup();
    render(<ReceiptPanel match={verifiedMatch(`0x${'c'.repeat(64)}`)} sellerSignerPublicKey={seller.signerPublicKey} />);
    await user.type(screen.getByLabelText('Invoice digest (entered manually)'), 'not-a-digest');
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Receipt invoice digest is invalid');
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it('withholds receipt controls for non-verified matches and unavailable metadata', () => {
    const seller = generateSession();
    const txHash = `0x${'c'.repeat(64)}`;
    const unverified = { ...verifiedMatch(txHash), receipt: 'claimed' } as unknown as ScanMatch;
    const { rerender } = render(<ReceiptPanel match={unverified} sellerSignerPublicKey={seller.signerPublicKey} />);
    expect(screen.getByText(/only for verified scan matches/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign receipt' }).disabled).toBe(true);
    const noMetadata = { ...verifiedMatch(txHash), metadata: undefined } as unknown as ScanMatch;
    rerender(<ReceiptPanel match={noMetadata} sellerSignerPublicKey={seller.signerPublicKey} />);
    expect(screen.getByText(/scan metadata is unavailable/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign receipt' }).disabled).toBe(true);
  });
});
