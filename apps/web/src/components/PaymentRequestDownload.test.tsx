// @vitest-environment jsdom
import { PAYMENT_REQUEST_FILE_NAME, parsePaymentRequestFile } from '@ghostpay/invoice-schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as common from './Common';
import { PaymentRequestDownload } from './PaymentRequestDownload';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('payment request download', () => {
  it('exports the unchanged original fragment only after explicit action, with a generic filename', () => {
    const download = vi.spyOn(common, 'downloadText').mockImplementation(() => undefined);
    const fragment = '#gpi=v1.e30';
    render(<PaymentRequestDownload fragment={fragment} />);
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download payment request' }));
    expect(download).toHaveBeenCalledOnce();
    const [name, text, mime] = download.mock.calls[0]!;
    expect(name).toBe(PAYMENT_REQUEST_FILE_NAME);
    expect(mime).toBe('application/json');
    expect(parsePaymentRequestFile(text).fragment).toBe(fragment);
    expect(Object.keys(JSON.parse(text) as Record<string, unknown>).sort()).toEqual(['format', 'fragment', 'version']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('exports the current invoice after a new request replaces it', () => {
    const download = vi.spyOn(common, 'downloadText').mockImplementation(() => undefined);
    const { rerender } = render(<PaymentRequestDownload fragment="#gpi=v1.e30" />);
    rerender(<PaymentRequestDownload fragment="#gpi=v1.W10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download payment request' }));
    expect(parsePaymentRequestFile(download.mock.calls[0]![1]).fragment).toBe('#gpi=v1.W10');
  });

  it('reports a blocked download without exposing content or claiming that a file was saved', () => {
    const download = vi.spyOn(common, 'downloadText').mockImplementation(() => { throw new Error('secret browser exception'); });
    render(<PaymentRequestDownload fragment="#gpi=v1.e30" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download payment request' }));
    expect(screen.getByRole('alert').textContent).toContain('The request file could not be downloaded.');
    expect(document.body.textContent).not.toContain('secret browser exception');
    expect(document.body.textContent).not.toContain('#gpi=v1.');
    download.mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Download payment request' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses invalid request data before invoking the download helper and clears failure for a new invoice', () => {
    const download = vi.spyOn(common, 'downloadText').mockImplementation(() => undefined);
    const { rerender } = render(<PaymentRequestDownload fragment="#gpi=v2.secret-content" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download payment request' }));
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret-content');
    rerender(<PaymentRequestDownload fragment="#gpi=v1.e30" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
