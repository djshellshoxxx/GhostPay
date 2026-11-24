// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraImporter } from './CameraImporter';

// Real @ghostpay/qr-exchange camera code against fake MediaDevices: these tests observe actual track lifetimes.
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const originalPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
const originalBarcodeDetector = Object.getOwnPropertyDescriptor(globalThis, 'BarcodeDetector');
const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
const originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');

interface FakeTrack { readonly stop: () => void; readonly getSettings: () => { deviceId: string } }
type Constraints = { video: { facingMode?: string; deviceId?: { exact: string } } };

function fakeMedia(options: { devices?: readonly string[]; fail?: string; hold?: boolean } = {}) {
  const live = new Set<FakeTrack>();
  const liveAtRequest: number[] = [];
  const pending: (() => void)[] = [];
  const labelRead = vi.fn();
  const getUserMedia = vi.fn((constraints: Constraints) => {
    liveAtRequest.push(live.size);
    if (options.fail !== undefined) return Promise.reject(Object.assign(new Error('camera'), { name: options.fail }));
    const deviceId = constraints.video.deviceId?.exact ?? options.devices?.[0] ?? 'cam-default';
    const make = () => {
      const track: FakeTrack = { stop: vi.fn(() => { live.delete(track); }), getSettings: () => ({ deviceId }) };
      live.add(track);
      return { getTracks: () => [track] };
    };
    if (options.hold !== true) return Promise.resolve(make());
    return new Promise((resolve) => { pending.push(() => { resolve(make()); }); });
  });
  const enumerateDevices = vi.fn(() => Promise.resolve((options.devices ?? ['cam-default']).map((deviceId) => ({
    kind: 'videoinput',
    deviceId,
    get label() { labelRead(); return `Camera ${deviceId}`; },
  }))));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices } });
  return { live, liveAtRequest, pending, getUserMedia, enumerateDevices, labelRead };
}

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(state: DocumentVisibilityState): void {
  visibility = state;
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'BarcodeDetector', {
    configurable: true,
    value: class { static getSupportedFormats = () => Promise.resolve(['qr_code']); detect = () => Promise.resolve([]); },
  });
});
afterEach(() => {
  cleanup();
  if (originalMediaDevices === undefined) Reflect.deleteProperty(navigator, 'mediaDevices');
  else Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  if (originalPlay !== undefined) Object.defineProperty(HTMLMediaElement.prototype, 'play', originalPlay);
  if (originalBarcodeDetector === undefined) Reflect.deleteProperty(globalThis, 'BarcodeDetector');
  else Object.defineProperty(globalThis, 'BarcodeDetector', originalBarcodeDetector);
  if (originalVisibility === undefined) Reflect.deleteProperty(document, 'visibilityState');
  else Object.defineProperty(document, 'visibilityState', originalVisibility);
  if (originalSecure === undefined) Reflect.deleteProperty(window, 'isSecureContext');
  else Object.defineProperty(window, 'isSecureContext', originalSecure);
  vi.restoreAllMocks();
});

const status = (): string => screen.getByRole('status').textContent ?? '';
async function startScan(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
  await waitFor(() => { expect(status()).toBe('Camera active. Point it at a QR code.'); });
}

describe('CameraImporter camera lifecycle', () => {
  it('stops every track when the page becomes hidden and needs a new click to restart', async () => {
    const media = fakeMedia();
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    await startScan(user);
    expect(media.live.size).toBe(1);

    setVisibility('hidden');
    expect(media.live.size).toBe(0);
    expect(status()).toBe('Camera stopped while the page was hidden.');
    expect(screen.getByRole('button', { name: 'Scan with camera' })).toBeTruthy();

    setVisibility('visible');
    await act(async () => { await Promise.resolve(); });
    expect(media.getUserMedia).toHaveBeenCalledOnce();
    expect(status()).toBe('Camera stopped while the page was hidden.');

    await startScan(user);
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(media.live.size).toBe(1);
  });

  it('a hidden page during a pending permission prompt discards the late stream', async () => {
    const media = fakeMedia({ hold: true });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    setVisibility('hidden');
    await act(async () => { media.pending.forEach((grant) => { grant(); }); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => { expect(media.live.size).toBe(0); });
    expect(status()).toBe('Camera stopped while the page was hidden.');
  });

  it('ignores visibility changes while no camera is running', () => {
    fakeMedia();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: 'draft' } });
    setVisibility('hidden');
    expect(status()).toBe('');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text').value).toBe('draft');
  });

  it('offers camera switching only with several cameras; switching stops the old stream before requesting the next', async () => {
    const media = fakeMedia({ devices: ['cam-a', 'cam-b', 'cam-c'] });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    expect(screen.queryByRole('button', { name: 'Switch camera' })).toBeNull();
    await startScan(user);
    expect(media.getUserMedia.mock.calls[0]?.[0]).toEqual({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });

    const switcher = await screen.findByRole('button', { name: 'Switch camera' });
    await user.click(switcher);
    await waitFor(() => { expect(media.getUserMedia).toHaveBeenCalledTimes(2); });
    expect(media.getUserMedia.mock.calls[1]?.[0]).toEqual({ video: { deviceId: { exact: 'cam-b' }, width: { ideal: 1280 } }, audio: false });
    expect(media.liveAtRequest).toEqual([0, 0]);
    await waitFor(() => { expect(status()).toBe('Camera active. Point it at a QR code.'); });
    expect(media.live.size).toBe(1);

    await user.click(await screen.findByRole('button', { name: 'Switch camera' }));
    await waitFor(() => { expect(media.getUserMedia).toHaveBeenCalledTimes(3); });
    expect(media.getUserMedia.mock.calls[2]?.[0]).toMatchObject({ video: { deviceId: { exact: 'cam-c' } } });
    expect(media.liveAtRequest).toEqual([0, 0, 0]);
    await user.click(await screen.findByRole('button', { name: 'Switch camera' }));
    await waitFor(() => { expect(media.getUserMedia).toHaveBeenCalledTimes(4); });
    expect(media.getUserMedia.mock.calls[3]?.[0]).toMatchObject({ video: { deviceId: { exact: 'cam-a' } } });
    expect(media.labelRead).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(media.live.size).toBe(0);
    expect(screen.queryByRole('button', { name: 'Switch camera' })).toBeNull();
  });

  it('never keeps two streams under rapid switching while permission prompts are pending', async () => {
    const media = fakeMedia({ devices: ['cam-a', 'cam-b'] });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    await startScan(user);
    const switcher = await screen.findByRole('button', { name: 'Switch camera' });
    media.getUserMedia.mockImplementation((constraints: Constraints) => {
      media.liveAtRequest.push(media.live.size);
      return new Promise((resolve) => {
        media.pending.push(() => {
          const track: FakeTrack = { stop: vi.fn(() => { media.live.delete(track); }), getSettings: () => ({ deviceId: constraints.video.deviceId?.exact ?? '' }) };
          media.live.add(track);
          resolve({ getTracks: () => [track] });
        });
      });
    });
    fireEvent.click(switcher);
    fireEvent.click(screen.getByRole('button', { name: 'Switch camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch camera' }));
    await act(async () => { media.pending.forEach((grant) => { grant(); }); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    await waitFor(() => { expect(media.live.size).toBe(1); });
    expect(media.liveAtRequest.every((n) => n === 0)).toBe(true);
  });

  it('shows no switch button with a single camera', async () => {
    const media = fakeMedia({ devices: ['only'] });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    await startScan(user);
    await waitFor(() => { expect(media.enumerateDevices).toHaveBeenCalled(); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Switch camera' })).toBeNull();
  });

  it('repeated open/close while prompts are pending leaves no live stream and asks only per click', async () => {
    const media = fakeMedia({ hold: true });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
      await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    }
    expect(media.getUserMedia).toHaveBeenCalledTimes(3);
    await act(async () => { media.pending.forEach((grant) => { grant(); }); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    await waitFor(() => { expect(media.live.size).toBe(0); });
    expect(status()).toBe('Camera stopped.');
  });

  it('unmounting during startup stops the late stream without state updates after unmount', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const media = fakeMedia({ hold: true });
    const user = userEvent.setup();
    const { unmount } = render(<CameraImporter label="Import a QR" onText={() => true} />);
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    unmount();
    await act(async () => { media.pending.forEach((grant) => { grant(); }); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    await waitFor(() => { expect(media.live.size).toBe(0); });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'Camera access was denied.'],
    ['SecurityError', 'Camera access was denied.'],
    ['NotFoundError', 'No camera was found on this device.'],
    ['OverconstrainedError', 'No camera was found on this device.'],
    ['NotReadableError', 'The camera is in use by another app or could not be opened.'],
    ['AbortError', 'The camera is in use by another app or could not be opened.'],
    ['TypeError', 'Camera scanning is unavailable here.'],
  ])('explains %s and offers paste and image alternatives', async (name, message) => {
    fakeMedia({ fail: name });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(status().startsWith(message)).toBe(true); });
    expect(status()).toMatch(/paste the QR text or read it from an image/);
    expect(screen.getByLabelText('Or paste QR text')).toBeTruthy();
    expect(screen.getByLabelText('Read a QR from an image')).toBeTruthy();
  });

  it('distinguishes an insecure page from a browser without camera support', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={() => true} />);
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(status()).toBe('The camera only works on a secure (HTTPS) page. You can still paste the QR text or read it from an image below.'); });

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(status()).toBe('Camera scanning is unavailable here. You can still paste the QR text or read it from an image below.'); });
  });
});

describe('CameraImporter image files (real decoder limits)', () => {
  it('rejects non-image and oversized files before decoding, without calling onText', async () => {
    const onText = vi.fn(() => true);
    const createImageBitmap = vi.fn();
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: createImageBitmap });
    try {
      const user = userEvent.setup({ applyAccept: false });
      render(<CameraImporter label="Import a QR" onText={onText} />);
      const input = screen.getByLabelText<HTMLInputElement>('Read a QR from an image');
      expect(input.type).toBe('file');
      expect(input.accept).toBe('image/*');
      await user.upload(input, new File(['hello'], 'note.txt', { type: 'text/plain' }));
      await waitFor(() => { expect(status()).toBe('That file is not a supported image. Choose a photo or screenshot of the QR code, or paste the QR text.'); });
      await user.upload(input, new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }));
      await waitFor(() => { expect(status()).toBe('That image is larger than 10 MiB. Choose a smaller image or paste the QR text.'); });
      expect(createImageBitmap).not.toHaveBeenCalled();
      expect(onText).not.toHaveBeenCalled();
      expect(input.value).toBe('');
    } finally {
      Reflect.deleteProperty(globalThis, 'createImageBitmap');
    }
  });

  it('reports an image that the platform cannot decode', async () => {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: () => Promise.reject(new Error('decode')) });
    try {
      const user = userEvent.setup();
      render(<CameraImporter label="Import a QR" onText={() => true} />);
      await user.upload(screen.getByLabelText('Read a QR from an image'), new File(['x'], 'qr.png', { type: 'image/png' }));
      await waitFor(() => { expect(status()).toBe('That image could not be opened. Choose another image or paste the QR text.'); });
    } finally {
      Reflect.deleteProperty(globalThis, 'createImageBitmap');
    }
  });
});
