// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalReceipt } from '../lib/payExec';
import { RETENTION_KEY } from '../lib/metadataRetention';
import { PaymentProofQr } from './PaymentRequestQr';

const PROOF_POLICY = 'ghostpay.proof-preview-retention.v1';
const RECEIPT = Object.freeze<LocalReceipt>({
  kind: 'ghostpay-local-receipt', version: 1, chainId: 84532,
  txHash: `0x${'ab'.repeat(32)}`, router: `0x${'cd'.repeat(20)}`,
  token: 'native', gross: '100', fee: '1', net: '99', invoiceNonce: 'n'.repeat(32),
  fiat: 'USD 10000', quote: Object.freeze({ source: 'fixed', timestamp: 1, expiresAt: 2 }),
  status: 'included', createdAt: '2026-10-25T00:00:00.000Z',
});
const show = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Show proof QR' })); };
const preview = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Preview proof cleanup' })); };
const proofText = (): HTMLTextAreaElement | null => screen.queryByLabelText('Proof of payment text');
const RESUME_EVENTS = ['focus', 'pageshow', 'visibilitychange', 'resume'] as const;
function resume(event: (typeof RESUME_EVENTS)[number]): void {
  (event === 'focus' || event === 'pageshow' ? window : document).dispatchEvent(new Event(event));
}

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
    expect(screen.getByLabelText<HTMLSelectElement>('Close payment proof previews automatically').value).toBe('0');
    act(() => { vi.advanceTimersByTime(3_601_000); });
    expect(proofText()).not.toBeNull();
    expect(localStorage.getItem(PROOF_POLICY)).toBeNull();
  });

  it('closes at the opted-in deadline without restarting on ordinary receipt/timestamp rerenders', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    const source = {};
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
    show();
    fireEvent.change(screen.getByLabelText('Close payment proof previews automatically'), { target: { value: '300000' } });
    expect(localStorage.getItem(PROOF_POLICY)).toBe('{"delay":300000}');
    expect(localStorage.getItem(RETENTION_KEY)).toBeNull();
    act(() => { vi.advanceTimersByTime(299_000); });
    const current = { ...RECEIPT, createdAt: '2026-10-25T00:04:59.000Z' };
    view.rerender(<PaymentProofQr receipt={current} sourceIdentity={source} />);
    expect(proofText()?.value).toBe(JSON.stringify(current, null, 2));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(proofText()).toBeNull();
    expect(screen.getByRole('button', { name: 'Download proof JSON' })).toBeTruthy();
  });

  it.each(RESUME_EVENTS)('enforces the exact proof deadline on %s without waiting for a suspended timer', (event) => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    localStorage.setItem('synthetic-retained-invoice', 'saved-invoice');
    sessionStorage.setItem('synthetic-retained-attempt', 'pending-attempt');
    const source = Object.freeze({ result: Object.freeze({ hash: RECEIPT.txHash }) });
    const sourceBefore = JSON.stringify(source);
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
    show();
    const displayed = proofText()?.value;
    // Only wall time moves: none of the interval callbacks run while the page is suspended.
    act(() => { vi.setSystemTime(300_999); resume(event); });
    expect(proofText()?.value).toBe(displayed);
    act(() => { vi.setSystemTime(301_000); resume(event); });
    expect(proofText()).toBeNull();
    expect(screen.getByText(/The payment proof preview closed under your retention setting/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy proof JSON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download proof JSON' })).toBeTruthy();
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(localStorage.getItem('synthetic-retained-invoice')).toBe('saved-invoice');
    expect(sessionStorage.getItem('synthetic-retained-attempt')).toBe('pending-attempt');
    act(() => { resume(event); });
    expect(proofText()).toBeNull();
    // Cleanup closes presentation only; the retained receipt can still be displayed deliberately.
    show();
    expect(proofText()?.value).toBe(displayed);
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

  it('keeps manual confirmation bound to the displayed payment across ordinary same-source rerenders', () => {
    const source = {};
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
    show(); preview();
    const current = { ...RECEIPT, createdAt: '2026-10-25T00:00:01.000Z' };
    view.rerender(<PaymentProofQr receipt={current} sourceIdentity={source} />);
    expect(proofText()?.value).toBe(JSON.stringify(current, null, 2));
    expect(screen.getByText('Payment proof previews to close: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close previewed proofs' }));
    expect(proofText()).toBeNull();
  });

  it('preserves live receipt display and copy/download bytes across rerenders and cleanup', async () => {
    const source = {};
    const writeText = vi.fn(() => Promise.resolve());
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', class extends URL {
      public static override createObjectURL(blob: Blob | MediaSource): string { blobs.push(blob as Blob); return 'blob:proof'; }
      public static override revokeObjectURL(): void { /* Controlled local download only. */ }
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') { reject(new Error('synthetic download unreadable')); return; }
        resolve(result);
      };
      reader.onerror = () => { reject(new Error('synthetic download unreadable')); };
      reader.readAsText(blob);
    });
    try {
      const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
      show();
      const current = { ...RECEIPT, createdAt: '2026-10-25T00:00:01.000Z' };
      const expected = JSON.stringify(current, null, 2);
      view.rerender(<PaymentProofQr receipt={current} sourceIdentity={source} />);
      expect(proofText()?.value).toBe(expected);
      const copy = screen.getByRole('button', { name: 'Copy proof JSON' });
      fireEvent.click(copy);
      await waitFor(() => { expect(writeText).toHaveBeenCalledExactlyOnceWith(expected); });
      fireEvent.click(screen.getByRole('button', { name: 'Download proof JSON' }));
      preview();
      fireEvent.click(screen.getByRole('button', { name: 'Close previewed proofs' }));
      fireEvent.click(copy);
      await waitFor(() => { expect(writeText).toHaveBeenNthCalledWith(2, expected); });
      fireEvent.click(screen.getByRole('button', { name: 'Download proof JSON' }));
      expect(blobs).toHaveLength(2);
      expect(await Promise.all(blobs.map(readBlob))).toEqual([expected, expected]);
    } finally {
      if (originalClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
      else Object.defineProperty(navigator, 'clipboard', originalClipboard);
    }
  });

  it('withdraws replaced result/context/session source before an old plan or age can close its successor', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show(); preview();
    act(() => { vi.advanceTimersByTime(299_000); });
    const replacement = { ...RECEIPT, txHash: `0x${'ef'.repeat(32)}` as const };
    view.rerender(<PaymentProofQr receipt={replacement} sourceIdentity={{}} />);
    expect(proofText()?.value).toContain(replacement.txHash);
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
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

  it.each(['unconfirmed', 'reverted', 'unknown'] as const)('revokes an included preview before a same-source %s projection can be cleaned', (status) => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    const source = {};
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={source} />);
    show(); preview();
    act(() => { vi.advanceTimersByTime(299_000); });
    view.rerender(<PaymentProofQr receipt={{ ...RECEIPT, status: status as LocalReceipt['status'] }} sourceIdentity={source} />);
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    expect(proofText()?.value).toContain(`"status": "${status}"`);
    preview();
    expect(screen.getByText('Payment proof previews to close: 0')).toBeTruthy();
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

  it('stops reading the preview policy on resume after the view unmounts', () => {
    const view = render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    const read = vi.spyOn(Storage.prototype, 'getItem');
    view.unmount();
    read.mockClear();
    act(() => { for (const event of RESUME_EVENTS) resume(event); });
    expect(read.mock.calls.filter(([key]) => key === PROOF_POLICY)).toEqual([]);
  });

  it('fails closed when saving the separate preference is denied', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    fireEvent.change(screen.getByLabelText('Close payment proof previews automatically'), { target: { value: '300000' } });
    expect(screen.getByText('The preference could not be saved. No cleanup policy was changed.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>('Close payment proof previews automatically').value).toBe('0');
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()).not.toBeNull();
  });

  it.each(RESUME_EVENTS)('reconciles a missed policy revocation on %s without closing the proof or losing receipt exports', (event) => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show(); preview();
    const displayed = proofText()?.value;
    localStorage.setItem(PROOF_POLICY, '{"delay":0}');
    act(() => { vi.setSystemTime(301_000); resume(event); });
    expect(screen.getByLabelText<HTMLSelectElement>('Close payment proof previews automatically').value).toBe('0');
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()?.value).toBe(displayed);
    expect(screen.getByRole('button', { name: 'Copy proof JSON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download proof JSON' })).toBeTruthy();
    expect(proofText()?.value).toContain(RECEIPT.txHash);
    preview();
    fireEvent.click(screen.getByRole('button', { name: 'Close previewed proofs' }));
    expect(proofText()).toBeNull();
  });

  it.each(['{"delay":0,"delay":300000}', '{', '{"delay":300000,"extra":true}'])('keeps malformed proof policy off: %s', (raw) => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, raw);
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()).not.toBeNull();
  });

  // #287 item 4: an expiry happens without user action, so it is announced; a new Show clears the notice.
  it('announces an opted-in expiry in a live region and clears the notice on the next Show', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(PROOF_POLICY, '{"delay":300000}');
    render(<PaymentProofQr receipt={RECEIPT} sourceIdentity={{}} />);
    show();
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(proofText()).toBeNull();
    const notice = screen.getByText(/The payment proof preview closed under your retention setting/);
    expect(notice.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Copy proof JSON' })).toBeTruthy();
    show();
    expect(proofText()).not.toBeNull();
    expect(screen.queryByText(/The payment proof preview closed under your retention setting/)).toBeNull();
  });
});
