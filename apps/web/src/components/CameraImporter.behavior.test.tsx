// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exchange = vi.hoisted(() => {
  class QrExchangeError extends Error {
    constructor(readonly code: 'CAMERA_DENIED' | 'CAMERA_UNAVAILABLE' | 'SCAN_FAILED' | 'OTHER') { super(code); }
  }
  return { QrExchangeError, startCamera: vi.fn(), scanFromVideo: vi.fn(), stopVideo: vi.fn() };
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
