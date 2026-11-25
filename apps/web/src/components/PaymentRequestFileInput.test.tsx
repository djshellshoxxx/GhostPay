// @vitest-environment jsdom
import { MAX_PAYMENT_REQUEST_FILE_BYTES, serializePaymentRequestFile } from '@ghostpay/invoice-schema';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { PaymentRequestFileInput } from './PaymentRequestFileInput';

const FRAGMENT = '#gpi=v1.e30';
const NEXT_FRAGMENT = '#gpi=v1.W10';
const INVALID = 'Cannot read this request file. Choose a valid GhostPay request file.';
const READY = 'Request file is ready for review.';
const TOO_LARGE = 'Request file exceeds the 24 KiB size limit.';
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fileFor(text: string, read?: () => Promise<ArrayBuffer>): File {
  const data = bytes(text);
  // Browser File.arrayBuffer is absent in this DOM runtime; inject only the native read boundary.
  const file = new File([data], 'not-a-trusted-label.bin', { type: 'application/octet-stream' });
  Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: read ?? vi.fn(() => Promise.resolve(data)) });
  return file;
}
function select(file?: File): HTMLInputElement {
  const input = screen.getByLabelText<HTMLInputElement>('Payment request file');
  fireEvent.change(input, { target: { files: file === undefined ? [] : [file] } });
  return input;
}

beforeEach(() => { clearSession(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('local payment request file intake', () => {
  it('reads only an explicitly selected file and passes its exact fragment, independent of MIME and filename', async () => {
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    const changed = vi.fn();
    render(<PaymentRequestFileInput onText={onText} onInputChange={changed} />);
    expect(onText).not.toHaveBeenCalled();
    const input = select(fileFor(serializePaymentRequestFile(FRAGMENT)));
    expect(input.value).toBe('');
    expect(await screen.findByText(READY)).toBeTruthy();
    expect(onText).toHaveBeenCalledOnce();
    expect(onText.mock.calls[0]?.[0]).toBe(FRAGMENT);
    expect(changed).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain('not-a-trusted-label.bin');
  });

  it('allows the same file to be selected again without retaining native input state', async () => {
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    render(<PaymentRequestFileInput onText={onText} />);
    const file = fileFor(serializePaymentRequestFile(FRAGMENT));
    select(file);
    await screen.findByText(READY);
    select(file);
    await waitFor(() => { expect(onText).toHaveBeenCalledTimes(2); });
    expect(screen.getByLabelText<HTMLInputElement>('Payment request file').value).toBe('');
  });

  it('rejects declared overflow before calling the file reader and invalidates the preceding preview first', async () => {
    const read = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    const changed = vi.fn();
    render(<PaymentRequestFileInput onText={onText} onInputChange={changed} />);
    select(fileFor(serializePaymentRequestFile(FRAGMENT)));
    await screen.findByText(READY);
    select(fileFor('x'.repeat(MAX_PAYMENT_REQUEST_FILE_BYTES + 1), read));
    expect(screen.getByText(TOO_LARGE)).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenCalledOnce();
    expect(screen.queryByText(READY)).toBeNull();
  });

  it.each(['', '{}', '{"format":"secret-name","version":1,"fragment":"secret-fragment"}', '\ufeff' + serializePaymentRequestFile(FRAGMENT)])('rejects an empty or invalid wrapper without exposing contents', async (text) => {
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor(text));
    expect(await screen.findByText(INVALID)).toBeTruthy();
    expect(onText).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('secret-name');
    expect(document.body.textContent).not.toContain('secret-fragment');
  });

  it('checks actual bytes after a declared-small read', async () => {
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor('x', () => Promise.resolve(new ArrayBuffer(MAX_PAYMENT_REQUEST_FILE_BYTES + 1))));
    expect(await screen.findByText(TOO_LARGE)).toBeTruthy();
    expect(onText).not.toHaveBeenCalled();
  });

  it('refuses truncated reads and malformed UTF-8 instead of repairing them', async () => {
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor('xx', () => Promise.resolve(bytes('x'))));
    await screen.findByText(INVALID);
    select(fileFor('xx', () => Promise.resolve(new Uint8Array([0xc3, 0x28]).buffer)));
    await screen.findByText(INVALID);
    expect(onText).not.toHaveBeenCalled();
  });

  it('does not expose reader or consumer exception details', async () => {
    const onText = vi.fn((): boolean => { throw new Error('secret from consumer'); });
    render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor('xx', () => Promise.reject(new Error('secret from reader'))));
    await screen.findByText(INVALID);
    expect(onText).not.toHaveBeenCalled();
    select(fileFor(serializePaymentRequestFile(FRAGMENT)));
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    await screen.findByText(INVALID);
    expect(document.body.textContent).not.toContain('secret from');
  });

  it('keeps the latest selected request when an older read resolves later', async () => {
    const first = deferred<ArrayBuffer>();
    const firstText = serializePaymentRequestFile(FRAGMENT);
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor(firstText, () => first.promise));
    select(fileFor(serializePaymentRequestFile(NEXT_FRAGMENT)));
    await screen.findByText(READY);
    await act(async () => { first.resolve(bytes(firstText)); await first.promise; });
    expect(onText).toHaveBeenCalledOnce();
    expect(onText.mock.calls[0]?.[0]).toBe(NEXT_FRAGMENT);
  });

  it('an invalid replacement discards an older pending read', async () => {
    const read = deferred<ArrayBuffer>();
    const text = serializePaymentRequestFile(FRAGMENT);
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor(text, () => read.promise));
    select(fileFor('{}'));
    await screen.findByText(INVALID);
    await act(async () => { read.resolve(bytes(text)); await read.promise; });
    expect(onText).not.toHaveBeenCalled();
    expect(screen.queryByText(READY)).toBeNull();
  });

  it('honors a parent revision changed by a newer QR input', async () => {
    const read = deferred<ArrayBuffer>();
    const text = serializePaymentRequestFile(FRAGMENT);
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    let revision = 0;
    const begin = (): (() => boolean) => { const ownRevision = ++revision; return () => revision === ownRevision; };
    render(<PaymentRequestFileInput onText={onText} onInputChange={begin} />);
    select(fileFor(text, () => read.promise));
    revision += 1;
    await act(async () => { read.resolve(bytes(text)); await read.promise; });
    expect(onText).not.toHaveBeenCalled();
    expect(screen.queryByText(READY)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('invalidates a read when the parent scope changes and when the seller session locks without a render', async () => {
    const first = deferred<ArrayBuffer>();
    const second = deferred<ArrayBuffer>();
    const text = serializePaymentRequestFile(FRAGMENT);
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    const { rerender } = render(<PaymentRequestFileInput scopeKey="first" onText={onText} />);
    select(fileFor(text, () => first.promise));
    rerender(<PaymentRequestFileInput scopeKey="second" onText={onText} />);
    await act(async () => { first.resolve(bytes(text)); await first.promise; });
    select(fileFor(text, () => second.promise));
    clearSession();
    await act(async () => { second.resolve(bytes(text)); await second.promise; });
    expect(onText).not.toHaveBeenCalled();
    expect(screen.queryByText(READY)).toBeNull();
  });

  it('invalidates a close/reopen cycle even when native toggle events coalesce', async () => {
    const read = deferred<ArrayBuffer>();
    const text = serializePaymentRequestFile(FRAGMENT);
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    const changed = vi.fn();
    const { container } = render(<details open><summary>Import</summary><PaymentRequestFileInput onText={onText} onInputChange={changed} /></details>);
    select(fileFor(text, () => read.promise));
    const details = container.querySelector('details')!;
    await act(async () => {
      details.open = false;
      details.open = true;
      read.resolve(bytes(text));
      await read.promise;
    });
    expect(onText).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(READY)).toBeNull();
  });

  it('aborts an active consumer and clears its preview on hide', async () => {
    const open = deferred<boolean>();
    let signal: AbortSignal | undefined;
    const changed = vi.fn();
    const onText = vi.fn((_fragment: string, currentSignal: AbortSignal) => { signal = currentSignal; return open.promise; });
    render(<PaymentRequestFileInput onText={onText} onInputChange={changed} />);
    select(fileFor(serializePaymentRequestFile(FRAGMENT)));
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    expect(signal?.aborted).toBe(false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(signal?.aborted).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
    await act(async () => { open.resolve(true); await open.promise; });
    expect(screen.queryByText(READY)).toBeNull();
  });

  it('does not start reads in a hidden document or closed disclosure', () => {
    const reader = vi.fn(() => Promise.resolve(bytes(serializePaymentRequestFile(FRAGMENT))));
    const onText = vi.fn<(fragment: string, signal: AbortSignal) => boolean>(() => true);
    const { container } = render(<details><summary>Import</summary><PaymentRequestFileInput onText={onText} /></details>);
    select(fileFor(serializePaymentRequestFile(FRAGMENT), reader));
    expect(reader).not.toHaveBeenCalled();
    act(() => { container.querySelector('details')!.open = true; });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    select(fileFor(serializePaymentRequestFile(FRAGMENT), reader));
    expect(reader).not.toHaveBeenCalled();
  });

  it('aborts a pending consumer on unmount and honors explicit consumer refusal', async () => {
    const open = deferred<boolean>();
    let signal: AbortSignal | undefined;
    const onText = vi.fn((_fragment: string, currentSignal: AbortSignal) => { signal = currentSignal; return open.promise; });
    const { unmount } = render(<PaymentRequestFileInput onText={onText} />);
    select(fileFor(serializePaymentRequestFile(FRAGMENT)));
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { open.resolve(true); await open.promise; });
    render(<PaymentRequestFileInput onText={() => false} />);
    select(fileFor(serializePaymentRequestFile(FRAGMENT)));
    expect(await screen.findByText('Request file was not accepted.')).toBeTruthy();
    expect(screen.queryByText(READY)).toBeNull();
  });
});
