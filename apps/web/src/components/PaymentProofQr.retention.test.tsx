// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalReceipt } from '../lib/payExec';
import { RETENTION_KEY } from '../lib/metadataRetention';
import { PaymentProofQr } from './PaymentRequestQr';

const PROOF_POLICY = 'ghostpay.proof-preview-retention.v1';
const RECEIPT: LocalReceipt = Object.freeze({
  kind: 'ghostpay-local-receipt', version: 1, chainId: 84532,
  txHash: `0x${'ab'.repeat(32)}`, router: `0x${'cd'.repeat(20)}`,
  token: 'native', gross: '100', fee: '1', net: '99', invoiceNonce: 'n'.repeat(32),
  fiat: 'USD 10000', quote: Object.freeze({ source: 'fixed', timestamp: 1, expiresAt: 2 }),
  status: 'included', createdAt: '2026-10-25T00:00:00.000Z',
});
const show = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Show proof QR' })); };
const preview = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Preview proof cleanup' })); };
const proofText = (): HTMLTextAreaElement | null => screen.queryByLabelText('Proof of payment text');

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('included-payment proof presentation retention', () => {
  it('previews and cancels without closing, then confirms only the QR/text while retaining exports and source data', () => {
    const source = Object.freeze({ result: Object.freeze({ hash: RECEIPT.txHash }), context: {}, built: {} });
    const sourceBefore = JSON.stringify(source);
    localStorage.setItem('synthetic-retained-invoice', 'saved-invoice');
    sessionStorage.setItem('synthetic-retained-attempt', 'pending-attempt');
    const { container } = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
    show();
    const displayed = proofText()?.value;
    preview();
    expect(screen.getByText('Payment proof previews to close: 1')).toBeTruthy();
    expect(proofText()?.value).toBe(displayed);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel cleanup' }));
    expect(proofText()?.value).toBe(displayed);
    preview();
    fireEvent.click(screen.getByRole('button', { name: 'Close previewed proofs' }));
    expect(proofText()).toBeNull();
    expect(container.querySelector('.qr-frame')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy proof JSON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download proof JSON' })).toBeTruthy();
    expect(screen.getByText('Previewed proof displays closed.')).toBeTruthy();
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(localStorage.getItem('synthetic-retained-invoice')).toBe('saved-invoice');
    expect(sessionStorage.getItem('synthetic-retained-attempt')).toBe('pending-attempt');
    show();
    expect(proofText()?.value).toBe(displayed);
  });

  it('keeps the proof off-policy even when invoice preview cleanup was already enabled', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(RETENTION_KEY, '{"delay":300000}');
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    expect(screen.getByLabelText<HTMLSelectElement>('Close included-payment proof previews automatically').value).toBe('0');
    act(() => { vi.advanceTimersByTime(3_601_000); });
    expect(proofText()).not.toBeNull();
    expect(localStorage.getItem(PROOF_POLICY)).toBeNull();
  });

  it('closes at the opted-in deadline without restarting on ordinary receipt/timestamp rerenders', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    const source = {};
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
    show();
    const displayed = proofText()?.value;
    fireEvent.change(screen.getByLabelText('Close included-payment proof previews automatically'), { target: { value: '300000' } });
    expect(localStorage.getItem(PROOF_POLICY)).toBe('{"delay":300000}');
    expect(localStorage.getItem(RETENTION_KEY)).toBeNull();
    act(() => { vi.advanceTimersByTime(299_000); });
    view.rerender(<PaymentProofQr receipt={{ ...RECEIPT, createdAt: '2026-10-25T00:04:59.000Z' }} sourceIdentity={source} />);
    expect(proofText()?.value).toBe(displayed);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(proofText()).toBeNull();
    expect(screen.getByRole('button', { name: 'Download proof JSON' })).toBeTruthy();
  });

  it('gives each deliberate Show a new lifetime and invalidates an older confirmation', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show(); preview();
    act(() => { vi.advanceTimersByTime(299_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Hide proof QR' }));
    show();
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(proofText()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(299_000); });
    expect(proofText()).toBeNull();
  });

  it('withdraws replaced result/context/session source before an old plan or age can close its successor', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show(); preview();
    act(() => { vi.advanceTimersByTime(299_000); });
    const replacement = { ...RECEIPT, txHash: `0x${'ef'.repeat(32)}` as const };
    view.rerender(<PaymentProofQr receipt={replacement} sourceIdentity={{}} />);
    expect(proofText()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    show();
    expect(proofText()?.value).toContain(replacement.txHash);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(proofText()?.value).toContain(replacement.txHash);
    act(() => { vi.advanceTimersByTime(299_000); });
    expect(proofText()).toBeNull();
  });

  it.each(['unconfirmed', 'reverted', 'unknown'] as const)('does not enroll or expire a %s proof', (status) => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    render(<PaymentProofQr receipt={{ ...RECEIPT, status: status as LocalReceipt['status'] }} sourceIdentity={{}} />);
    show(); preview();
    expect(screen.getByText('Payment proof previews to close: 0')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Close previewed proofs' }).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()).not.toBeNull();
  });

  it('does not enroll hidden or failed-to-render proofs and releases every timer on unmount', () => {
    vi.useFakeTimers();
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    preview();
    expect(screen.getByText('Payment proof previews to close: 0')).toBeTruthy();
    show();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    render(<PaymentProofQr receipt={{ ...RECEIPT, fiat: 'x'.repeat(4000) }} sourceIdentity={{}} />);
    show(); preview();
    expect(screen.getByText('Payment proof previews to close: 0')).toBeTruthy();
    expect(proofText()).toBeNull();
  });

  it('fails closed when saving the separate preference is denied', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    fireEvent.change(screen.getByLabelText('Close included-payment proof previews automatically'), { target: { value: '300000' } });
    expect(screen.getByText('The preference could not be saved. No cleanup policy was changed.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>('Close included-payment proof previews automatically').value).toBe('0');
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()).not.toBeNull();
  });

  it.each(['{"delay":0,"delay":300000}', '{', '{"delay":300000,"extra":true}'])('keeps malformed proof policy off: %s', (raw) => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, raw);
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()).not.toBeNull();
  });
});
