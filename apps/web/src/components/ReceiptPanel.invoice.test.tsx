// @vitest-environment jsdom
import { openFragment, type OpenFragmentResult } from '@ghostpay/invoice-schema';
import { buildErc20Metadata, deriveStealthPayment, parseMetadata } from '@ghostpay/core-crypto';
import { grossForNet, routerSplit } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeParsed, NOW } from '../test/invoiceFixtures';
import { clearSession, getSessionPublic, importSession, withSessionSecrets } from '../lib/session';
import { receiptJson, verifyReceipt } from '../lib/receipts';
import type { ScanMatch } from '../lib/scanClient';
import { ReceiptPanel } from './ReceiptPanel';

vi.mock('@ghostpay/invoice-schema', async (original) => {
  const actual = await original<typeof import('@ghostpay/invoice-schema')>();
  return { ...actual, openFragment: vi.fn(actual.openFragment) };
});

beforeEach(async () => {
  clearSession();
  const actual = await vi.importActual<typeof import('@ghostpay/invoice-schema')>('@ghostpay/invoice-schema');
  vi.mocked(openFragment).mockReset().mockImplementation(actual.openFragment);
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function fixture() {
  const { parsed, link } = await makeParsed({ feePolicy: 'payer_pays' });
  const seller = getSessionPublic()!;
  const payment = deriveStealthPayment(parsed.invoice.metaAddress);
  const amount = parsed.invoice.amountPolicy.mode === 'fixed_token' ? BigInt(parsed.invoice.amountPolicy.tokenAmount) : 0n;
  const metadata = `0x${bytesToHex(buildErc20Metadata(payment.viewTag, parsed.invoice.token, routerSplit(grossForNet(amount)).net))}`;
  const match = {
    chainId: parsed.invoice.chainId, stealthAddress: payment.stealthAddress, metadata: parseMetadata(metadata),
    receipt: 'verified', viaRouter: true, tagMatches: true,
    announcement: { id: 'fixture', schemeId: 1n, stealthAddress: payment.stealthAddress, ephemeralPublicKey: `0x${bytesToHex(payment.ephemeralPublicKey)}`, metadata, transactionHash: `0x${'c'.repeat(64)}` },
  } as unknown as ScanMatch;
  const view = render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} />);
  const user = userEvent.setup();
  const fill = async () => {
    fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: link } });
    await user.click(screen.getByLabelText('I consent to opening this invoice locally to bind the receipt.'));
  };
  const validate = async () => {
    await fill();
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    await screen.findByText(/Validated invoice matches this scan/);
  };
  return { user, view, parsed, link, seller, match, fill, validate };
}

describe('ReceiptPanel invoice binding', () => {
  it('loads a real signed invoice, previews it, requires separate consent and exports a verified bound receipt', async () => {
    const { user, validate, seller } = await fixture();
    await validate();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign receipt' }).disabled).toBe(true);
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
    expect(screen.getByText(seller.signerPublicKey)).toBeTruthy();
    await user.click(screen.getByLabelText('I consent to signing these invoice and payment facts.'));
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    const text = screen.getByLabelText<HTMLTextAreaElement>('Signed receipt JSON').value;
    const receipt: unknown = JSON.parse(text);
    expect(verifyReceipt(receipt)).toBe(true);
    if (!verifyReceipt(receipt)) throw new Error('valid receipt required');
    expect(receiptJson(receipt)).toBe(text);
    expect(screen.getByText(/matched to the validated signed invoice/)).toBeTruthy();
    expect(screen.queryByText(/seller-supplied, not matched/)).toBeNull();
  });

  it('does not read an invoice file before explicit local-disclosure consent', async () => {
    await fixture();
    expect(screen.getByLabelText<HTMLInputElement>('Signed invoice link file').disabled).toBe(true);
    expect(openFragment).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it('imports a bounded text file through the same invoice validation', async () => {
    const { user, link } = await fixture();
    await user.click(screen.getByLabelText('I consent to opening this invoice locally to bind the receipt.'));
    vi.spyOn(File.prototype, 'text').mockResolvedValue(link);
    await user.upload(screen.getByLabelText('Signed invoice link file'), new File([link], 'invoice.txt', { type: 'text/plain' }));
    await screen.findByText(/Validated invoice matches this scan/);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign receipt' }).disabled).toBe(true);
  });

  it('rechecks expiry immediately before signing', async () => {
    const { user, validate, parsed } = await fixture();
    await validate();
    await user.click(screen.getByLabelText('I consent to signing these invoice and payment facts.'));
    vi.mocked(Date.now).mockReturnValue(parsed.invoice.expiresAt * 1000);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('expired');
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it('refuses signing after the same keys were cleared and reinstalled', async () => {
    const { user, validate } = await fixture();
    await validate();
    await user.click(screen.getByLabelText('I consent to signing these invoice and payment facts.'));
    const input = withSessionSecrets((s) => ({ spendingKeyHex: bytesToHex(s.keys.spendingSecret), viewingKeyHex: bytesToHex(s.keys.viewingSecret), signingKeyHex: bytesToHex(s.signingKey) }));
    clearSession();
    importSession(input);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Seller keys changed');
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it.each(['cancel', 'edit', 'match', 'session', 'unmount'] as const)('ignores a parser result after %s', async (change) => {
    const { user, view, fill, match, seller, parsed } = await fixture();
    let finish!: (value: OpenFragmentResult) => void;
    vi.mocked(openFragment).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await fill();
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    await waitFor(() => expect(finish).toBeDefined());
    if (change === 'cancel') await user.click(screen.getByRole('button', { name: 'Cancel invoice validation' }));
    if (change === 'edit') fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: 'changed' } });
    if (change === 'match') view.rerender(<ReceiptPanel match={{ ...match, receipt: 'pending' }} sellerSignerPublicKey={seller.signerPublicKey} />);
    if (change === 'session') clearSession();
    if (change === 'unmount') view.unmount();
    await act(async () => { finish({ status: 'ok', parsed }); });
    expect(screen.queryByText(/Validated invoice matches this scan/)).toBeNull();
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it.each(['cancel', 'edit', 'revoke'] as const)('retains the single-flight permit after %s until the underlying parser settles', async (change) => {
    const { user, fill, link, parsed } = await fixture();
    let finish!: (value: OpenFragmentResult) => void;
    vi.mocked(openFragment).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await fill();
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    await waitFor(() => expect(openFragment).toHaveBeenCalledTimes(1));
    if (change === 'cancel') await user.click(screen.getByRole('button', { name: 'Cancel invoice validation' }));
    if (change === 'edit') fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: `${link} ` } });
    if (change === 'revoke') {
      await user.click(screen.getByLabelText('I consent to opening this invoice locally to bind the receipt.'));
      await user.click(screen.getByLabelText('I consent to opening this invoice locally to bind the receipt.'));
    }
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Validate invoice for receipt' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    expect(openFragment).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ status: 'ok', parsed }); });
    expect(screen.queryByText(/Validated invoice matches this scan/)).toBeNull();
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Validate invoice for receipt' }).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    await screen.findByText(/Validated invoice matches this scan/);
    expect(openFragment).toHaveBeenCalledTimes(2);
  });

  it('keeps the parser permit across unmount/remount without installing the old result', async () => {
    const { user, view, fill, link, match, seller, parsed } = await fixture();
    let finish!: (value: OpenFragmentResult) => void;
    vi.mocked(openFragment).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await fill();
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    await waitFor(() => expect(openFragment).toHaveBeenCalledTimes(1));
    view.unmount();
    render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} />);
    fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: link } });
    await user.click(screen.getByLabelText('I consent to opening this invoice locally to bind the receipt.'));
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('validation is still running');
    expect(openFragment).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ status: 'ok', parsed }); });
    expect(screen.queryByText(/Validated invoice matches this scan/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    await screen.findByText(/Validated invoice matches this scan/);
    expect(openFragment).toHaveBeenCalledTimes(2);
  });

  it('clears a derived digest when invoice binding is invalidated instead of carrying it into manual mode', async () => {
    const { validate } = await fixture();
    await validate();
    fireEvent.change(screen.getByLabelText('Signed invoice link or fragment'), { target: { value: 'changed invoice' } });
    expect(screen.getByLabelText<HTMLInputElement>('Invoice digest (entered manually)').value).toBe('');
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it('refuses invalid signatures, tampered invoice fields and expiry before preview', async () => {
    const { user, fill, parsed } = await fixture();
    await fill();
    for (const response of [
      { ...parsed, verification: { signatureValid: false, signerPinned: false } },
      { ...parsed, invoice: { ...parsed.invoice, chainId: 1 } },
      { ...parsed, invoice: { ...parsed.invoice, amountPolicy: { mode: 'fixed_token' as const, tokenAmount: '1' } } },
    ]) {
      vi.mocked(openFragment).mockResolvedValueOnce({ status: 'ok', parsed: response });
      await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
      await screen.findByRole('alert');
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Validate invoice for receipt' }).disabled).toBe(false));
      expect(screen.queryByText(/Validated invoice matches this scan/)).toBeNull();
    }
    vi.mocked(Date.now).mockReturnValue(parsed.invoice.expiresAt * 1000);
    await user.click(screen.getByRole('button', { name: 'Validate invoice for receipt' }));
    expect((await screen.findByRole('alert')).textContent).toContain('expired');
  });
});
