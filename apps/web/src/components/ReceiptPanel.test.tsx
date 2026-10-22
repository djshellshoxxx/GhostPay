// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import type { ScanMatch } from '../lib/scanClient';
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
});
