// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exchange = vi.hoisted(() => {
  class QrExchangeError extends Error {
    constructor(readonly code: 'CAMERA_DENIED' | 'CAMERA_UNAVAILABLE' | 'CAMERA_NOT_FOUND' | 'CAMERA_IN_USE' | 'CAMERA_INSECURE' | 'SCAN_FAILED' | 'OTHER') { super(code); }
  }
  return {
    QrExchangeError, startCamera: vi.fn(), scanFromVideo: vi.fn(), stopVideo: vi.fn(),
    listVideoInputs: vi.fn(() => Promise.resolve([])), activeDeviceId: vi.fn(), decodeQrImage: vi.fn(), Assembler: vi.fn(),
  };
});
vi.mock('@ghostpay/qr-exchange', () => exchange);

import { CameraImporter } from './CameraImporter';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  exchange.startCamera.mockResolvedValue(undefined);
  exchange.scanFromVideo.mockResolvedValue(undefined);
});

describe('CameraImporter failure and acceptance paths', () => {
  it.each([
    ['CAMERA_DENIED', 'Camera access was denied.'],
    ['CAMERA_UNAVAILABLE', 'Camera scanning is unavailable here.'],
    ['CAMERA_NOT_FOUND', 'No camera was found on this device.'],
    ['CAMERA_IN_USE', 'The camera is in use by another app or could not be opened.'],
    ['CAMERA_INSECURE', 'The camera only works on a secure \\(HTTPS\\) page.'],
    ['SCAN_FAILED', 'The camera could not read a QR code.'],
    ['OTHER', 'The camera could not be started.'],
  ] as const)('explains %s and keeps paste available after startup failure', async (code, message) => {
    exchange.startCamera.mockRejectedValueOnce(new exchange.QrExchangeError(code));
    const user = userEvent.setup();
    render(<CameraImporter label="Scan code" onText={() => true} />);
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    expect(await screen.findByText(new RegExp(message))).toBeTruthy();
    expect(screen.getByLabelText('Or paste QR text')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scan with camera' })).toBeTruthy();
  });

  it('keeps scanning when a decoded value is rejected, then stops after accepted async input', async () => {
    const seen: string[] = [];
    exchange.scanFromVideo.mockImplementationOnce(async (_video: HTMLVideoElement, onValue: (text: string) => Promise<boolean>) => {
      expect(await onValue(' bad ')).toBe(false);
      expect(await onValue(' good ')).toBe(true);
    });
    const onText = vi.fn((text: string) => { seen.push(text); return Promise.resolve(text === 'good'); });
    const user = userEvent.setup();
    render(<CameraImporter label="Scan code" onText={onText} />);
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(onText).toHaveBeenCalledTimes(2); });
    expect(seen).toEqual(['bad', 'good']);
    expect(screen.getByRole('status').textContent).toBe('QR text accepted.');
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Scan with camera' })).toBeTruthy(); });
  });

  it('shows rejection and thrown callback errors for pasted values, clearing only accepted input', async () => {
    const onText = vi.fn()
      .mockReturnValueOnce(false)
      .mockRejectedValueOnce(new Error('bad qr'))
      .mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<CameraImporter label="Scan code" onText={onText} />);
    const input = screen.getByLabelText('Or paste QR text');
    await user.type(input, ' rejected ');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('That QR text was not accepted. Check it and try again.')).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe(' rejected ');
    await user.clear(input);
    await user.type(input, ' throws ');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(await screen.findByText('That QR text could not be used. Check it and try again.')).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe(' throws ');
    await user.clear(input);
    await user.type(input, ' accepted ');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect((input as HTMLTextAreaElement).value).toBe(''); });
  });

  it('stops the stream when unmounted during scanning', async () => {
    let onValue: ((text: string) => Promise<boolean>) | undefined;
    exchange.scanFromVideo.mockImplementationOnce((_video: HTMLVideoElement, callback: (text: string) => Promise<boolean>) => {
      onValue = callback;
      return new Promise<void>(() => undefined);
    });
    const { unmount } = render(<CameraImporter label="Scan code" onText={() => false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(exchange.scanFromVideo).toHaveBeenCalledOnce(); });
    unmount();
    await act(async () => { expect(await onValue?.('late')).toBe(false); });
  });
});


it('editing pasted input aborts a pending import before a late result can overwrite it', async () => {
  let finish!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => { finish = resolve; });
  const onInputChange = vi.fn();
  const signals: AbortSignal[] = [];
  const onText = vi.fn((_text: string, signal: AbortSignal) => { signals.push(signal); return signals.length === 1 ? pending : true; });
  const user = userEvent.setup();
  render(<CameraImporter label="Scan code" onText={onText} onInputChange={onInputChange} />);
  const input = screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text');
  fireEvent.change(input, { target: { value: 'first' } });
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  fireEvent.change(input, { target: { value: 'replacement' } });
  expect(signals[0]?.aborted).toBe(true);
  await act(async () => { finish(true); await pending; });
  expect(input.value).toBe('replacement');
  expect(screen.getByRole('status').textContent).toBe('');
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(onText.mock.calls[1]?.[0]).toBe('replacement');
  expect(await screen.findByText('QR text accepted.')).toBeTruthy();
});

it('starting or stopping a camera invalidates the parent preview, and typed input rejects late frames', async () => {
  let onValue: ((text: string) => Promise<boolean>) | undefined;
  exchange.scanFromVideo.mockImplementationOnce((_video: HTMLVideoElement, callback: (text: string) => Promise<boolean>) => {
    onValue = callback;
    return new Promise<void>(() => undefined);
  });
  const onInputChange = vi.fn(); const onText = vi.fn(() => true);
  const user = userEvent.setup();
  render(<CameraImporter label="Scan code" onText={onText} onInputChange={onInputChange} />);
  await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
  expect(onInputChange).toHaveBeenCalledOnce();
  await waitFor(() => { expect(onValue).toBeTypeOf('function'); });
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: 'newer manual input' } });
  await act(async () => { expect(await onValue?.('late frame')).toBe(false); });
  expect(onText).not.toHaveBeenCalled();
  expect(screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text').value).toBe('newer manual input');

  exchange.startCamera.mockImplementationOnce(() => new Promise<void>(() => undefined));
  await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
  const beforeStop = onInputChange.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Stop camera' }));
  expect(onInputChange).toHaveBeenCalledTimes(beforeStop + 1);
  expect(screen.getByRole('button', { name: 'Scan with camera' })).toBeTruthy();
});
