// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';

const exchange = vi.hoisted(() => ({
  QrExchangeError: class extends Error {},
  startCamera: vi.fn(), scanFromVideo: vi.fn(), stopVideo: vi.fn(),
  listVideoInputs: vi.fn(), activeDeviceId: vi.fn(), decodeQrImage: vi.fn(),
  Assembler: vi.fn(), parseChunk: vi.fn(),
}));
vi.mock('@ghostpay/qr-exchange', () => exchange);

import { CameraImporter, type CameraImporterProps } from './CameraImporter';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let visibility: DocumentVisibilityState = 'visible';
function setVisibility(state: DocumentVisibilityState, dispatch = true): void {
  visibility = state;
  if (dispatch) act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}
function pickImage(): void {
  fireEvent.change(screen.getByLabelText('Read a QR from an image'), {
    target: { files: [new File(['synthetic image'], 'invoice.png', { type: 'image/png' })] },
  });
}
function enterText(value = 'synthetic invoice'): void {
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value } });
}

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  exchange.startCamera.mockResolvedValue(undefined);
  exchange.scanFromVideo.mockResolvedValue(undefined);
  exchange.listVideoInputs.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  if (originalVisibility === undefined) Reflect.deleteProperty(document, 'visibilityState');
  else Object.defineProperty(document, 'visibilityState', originalVisibility);
});

describe('CameraImporter hidden-document authorization', () => {
  it.each(['idle', 'manual'] as const)('aborts a pending image on %s app lock without replacing the draft', async (reason) => {
    const pending = deferred<string>();
    let signal: AbortSignal | undefined;
    exchange.decodeQrImage.mockImplementationOnce((_file: File, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return pending.promise;
    });
    const onText = vi.fn<CameraImporterProps['onText']>(() => true);
    render(<CameraImporter label="Import a QR" onText={onText} />);
    enterText('unfinished invoice draft');
    const draft = screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text');
    pickImage();
    expect(signal?.aborted).toBe(false);

    act(() => { notifyAppLock(reason); });
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve('late private invoice'); await pending.promise; });
    expect(exchange.decodeQrImage).toHaveBeenCalledOnce();
    expect(onText).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByLabelText('Or paste QR text')).toBe(draft);
    expect(draft.value).toBe('unfinished invoice draft');

    exchange.decodeQrImage.mockResolvedValueOnce('fresh invoice');
    pickImage();
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    expect(onText.mock.calls[0]?.[0]).toBe('fresh invoice');
  });

  it.each(['idle', 'manual'] as const)('revokes a pending pasted callback on %s app lock while preserving the draft', async (reason) => {
    const pending = deferred<boolean>();
    const installed: string[] = [];
    let signal: AbortSignal | undefined;
    const onText = vi.fn<CameraImporterProps['onText']>().mockImplementationOnce(async (value, currentSignal) => {
      signal = currentSignal;
      await pending.promise;
      if (!currentSignal.aborted) installed.push(value);
      return true;
    }).mockReturnValue(true);
    render(<CameraImporter label="Import a QR" onText={onText} />);
    enterText();
    const draft = screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text');
    fireEvent.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(onText).toHaveBeenCalledOnce();

    act(() => { notifyAppLock(reason); });
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(true); await pending.promise; });
    expect(installed).toEqual([]);
    expect(onText).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByLabelText('Or paste QR text')).toBe(draft);
    expect(draft.value).toBe('synthetic invoice');

    fireEvent.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('QR text accepted.'); });
    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText.mock.calls[1]?.[1].aborted).toBe(false);
  });

  it('aborts a pending image import and drops its late result even after the page becomes visible again', async () => {
    const pending = deferred<string>();
    let signal: AbortSignal | undefined;
    exchange.decodeQrImage.mockImplementationOnce((_file: File, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return pending.promise;
    });
    const onText = vi.fn<CameraImporterProps['onText']>(() => true);
    render(<CameraImporter label="Import a QR" onText={onText} />);
    pickImage();
    expect(exchange.decodeQrImage).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);

    setVisibility('hidden');
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('button', { name: 'Stop camera' })).toBeNull();
    setVisibility('visible');
    await act(async () => { pending.resolve('late private invoice'); await pending.promise; });
    expect(onText).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');

    exchange.decodeQrImage.mockResolvedValueOnce('fresh invoice');
    pickImage();
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    expect(onText.mock.calls[0]?.[0]).toBe('fresh invoice');
  });

  it('revokes a pending pasted callback without replaying or accepting it when visibility returns', async () => {
    const pending = deferred<boolean>();
    const installed: string[] = [];
    let signal: AbortSignal | undefined;
    const onText = vi.fn<CameraImporterProps['onText']>().mockImplementationOnce(async (value, currentSignal) => {
      signal = currentSignal;
      await pending.promise;
      if (!currentSignal.aborted) installed.push(value);
      return true;
    }).mockReturnValue(true);
    render(<CameraImporter label="Import a QR" onText={onText} />);
    enterText();
    fireEvent.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(onText).toHaveBeenCalledOnce();

    setVisibility('hidden');
    expect(signal?.aborted).toBe(true);
    setVisibility('visible');
    await act(async () => { pending.resolve(true); await pending.promise; });
    expect(installed).toEqual([]);
    expect(onText).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text').value).toBe('synthetic invoice');

    fireEvent.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('QR text accepted.'); });
    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText.mock.calls[1]?.[1].aborted).toBe(false);
  });

  it.each(['camera', 'paste', 'image'] as const)('refuses new %s dispatch while hidden before the visibility event is delivered', async (kind) => {
    const onText = vi.fn<CameraImporterProps['onText']>(() => true);
    exchange.decodeQrImage.mockResolvedValueOnce('hidden image invoice');
    render(<CameraImporter label="Import a QR" onText={onText} />);
    enterText();
    setVisibility('hidden', false);
    await act(async () => {
      if (kind === 'camera') fireEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
      else if (kind === 'paste') fireEvent.click(screen.getByRole('button', { name: 'Use pasted text' }));
      else pickImage();
      await Promise.resolve();
    });
    expect(exchange.startCamera).not.toHaveBeenCalled();
    expect(exchange.decodeQrImage).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });

  it('does not deliver a decoded image after visibility changes but before the visibility event', async () => {
    const pending = deferred<string>();
    exchange.decodeQrImage.mockReturnValueOnce(pending.promise);
    const onText = vi.fn<CameraImporterProps['onText']>(() => true);
    render(<CameraImporter label="Import a QR" onText={onText} />);
    pickImage();
    setVisibility('hidden', false);
    await act(async () => { pending.resolve('hidden private invoice'); await pending.promise; });
    expect(onText).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(onText).not.toHaveBeenCalled();
  });

  it.each(['camera', 'paste', 'image'] as const)('does not start %s work after preview invalidation synchronously hides and aborts the import', async (kind) => {
    let hideOnInput = false;
    const onText = vi.fn<CameraImporterProps['onText']>(() => true);
    render(<CameraImporter label="Import a QR" onText={onText} onInputChange={() => {
      if (hideOnInput) setVisibility('hidden');
    }} />);
    enterText();
    hideOnInput = true;
    if (kind === 'camera') fireEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
    else if (kind === 'paste') fireEvent.click(screen.getByRole('button', { name: 'Use pasted text' }));
    else pickImage();
    await act(async () => { await Promise.resolve(); });
    expect(exchange.startCamera).not.toHaveBeenCalled();
    expect(exchange.decodeQrImage).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });
});
