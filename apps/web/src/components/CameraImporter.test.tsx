// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraImporter } from './CameraImporter';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const originalPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
const originalBarcodeDetector = Object.getOwnPropertyDescriptor(globalThis, 'BarcodeDetector');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  if (originalMediaDevices === undefined) Reflect.deleteProperty(navigator, 'mediaDevices');
  else Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  if (originalPlay !== undefined) Object.defineProperty(HTMLMediaElement.prototype, 'play', originalPlay);
  if (originalBarcodeDetector === undefined) Reflect.deleteProperty(globalThis, 'BarcodeDetector');
  else Object.defineProperty(globalThis, 'BarcodeDetector', originalBarcodeDetector);
  vi.restoreAllMocks();
});

describe('CameraImporter', () => {
  it('does not request a camera on render and supports pasted text', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const onText = vi.fn((text: string) => text === 'valid payload');
    const user = userEvent.setup();
    render(<CameraImporter label="Import a QR" onText={onText} />);

    expect(getUserMedia).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Or paste QR text'), 'valid payload');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(onText.mock.calls[0]?.[0]).toBe('valid payload');
    expect(screen.getByRole('status').textContent).toBe('QR text accepted.');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('starts the camera only after a click and stops every track on cancel', async () => {
    const stop = vi.fn();
    const track = { stop };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      configurable: true,
      value: class { static getSupportedFormats = () => Promise.resolve(['qr_code']); detect = () => Promise.resolve([]); },
    });
    const user = userEvent.setup();
    const { container } = render(<CameraImporter label="Import a QR" onText={() => true} />);
    const video = container.querySelector('video');

    expect(getUserMedia).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(getUserMedia).toHaveBeenCalledOnce(); });
    expect(container.querySelector('video')).toBe(video);
    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(container.querySelector('video')).toBe(video);
    await waitFor(() => { expect(stop).toHaveBeenCalledOnce(); });
    expect(screen.getByRole('status').textContent).toBe('Camera stopped.');
  });

  it('does not let a cancelled permission request replace or stop the next active stream', async () => {
    const permissionA = deferred<MediaStream>();
    const permissionB = deferred<MediaStream>();
    const stopA = vi.fn();
    const stopB = vi.fn();
    const trackA = { stop: stopA };
    const trackB = { stop: stopB };
    const streamA = { getTracks: () => [trackA] } as unknown as MediaStream;
    const streamB = { getTracks: () => [trackB] } as unknown as MediaStream;
    const getUserMedia = vi.fn()
      .mockImplementationOnce(() => permissionA.promise)
      .mockImplementationOnce(() => permissionB.promise);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      configurable: true,
      value: class { static getSupportedFormats = () => Promise.resolve(['qr_code']); detect = () => Promise.resolve([]); },
    });
    const user = userEvent.setup();
    const { container } = render(<CameraImporter label="Import a QR" onText={() => false} />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    let srcObject = video?.srcObject;
    const srcWrites: unknown[] = [];
    if (video !== null) Object.defineProperty(video, 'srcObject', { configurable: true, get: () => srcObject, set: (value: MediaProvider | null) => { srcWrites.push(value); srcObject = value; } });

    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(getUserMedia).toHaveBeenCalledOnce(); });
    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(screen.getByRole('status').textContent).toBe('Camera stopped.');
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => { expect(getUserMedia).toHaveBeenCalledTimes(2); });

    act(() => { permissionB.resolve(streamB); });
    await waitFor(() => { expect(video?.srcObject).toBe(streamB); });
    expect(container.querySelector('video')).toBe(video);
    act(() => { permissionA.resolve(streamA); });
    await waitFor(() => { expect(stopA).toHaveBeenCalledOnce(); });
    expect(stopB).not.toHaveBeenCalled();
    expect(container.querySelector('video')).toBe(video);
    expect(screen.getByRole('status').textContent).toBe('Camera active. Point it at a QR code.');
    expect(srcWrites.map((v) => (v === null ? 'null' : v === streamA ? 'A' : v === streamB ? 'B' : 'other'))).toEqual(['null', 'B']);
    expect(video?.srcObject).toBe(streamB);

    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(stopB).toHaveBeenCalledOnce();
  });
});


it('aborts pending pasted import when closed and clears the camera on disclosure collapse', async () => {
  const pending = deferred<boolean>();
  let signal: AbortSignal | undefined;
  const user = userEvent.setup();
  const { container } = render(<details open><summary>Import</summary><CameraImporter label="Import a QR" onText={(_text, currentSignal) => { signal = currentSignal; return pending.promise; }} /></details>);
  await user.type(screen.getByLabelText('Or paste QR text'), 'pending');
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(signal?.aborted).toBe(false);
  const disclosure = container.querySelector('details')!;
  act(() => { disclosure.open = false; disclosure.dispatchEvent(new Event('toggle')); });
  expect(signal?.aborted).toBe(true);
  act(() => { pending.resolve(true); });
  expect(screen.getByRole('status', { hidden: true }).textContent).not.toBe('QR text accepted.');
});

it('invalidates a pending paste on scope change and unmount', async () => {
  const pending = deferred<boolean>();
  const signals: AbortSignal[] = [];
  const onText = (_text: string, signal: AbortSignal) => { signals.push(signal); return pending.promise; };
  const user = userEvent.setup();
  const { rerender, unmount } = render(<CameraImporter label="Import a QR" scopeKey="first" onText={onText} />);
  await user.type(screen.getByLabelText('Or paste QR text'), 'pending');
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  rerender(<CameraImporter label="Import a QR" scopeKey="second" onText={onText} />);
  expect(signals[0]?.aborted).toBe(true);
  await user.type(screen.getByLabelText('Or paste QR text'), 'next');
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  unmount();
  expect(signals[1]?.aborted).toBe(true);
  pending.resolve(true);
});

it('invalidates the previous preview before rejecting oversized new input', async () => {
  const onInputChange = vi.fn(); const onText = vi.fn();
  const user = userEvent.setup();
  render(<CameraImporter label="Import a QR" onInputChange={onInputChange} onText={onText} />);
  const { fireEvent } = await import('@testing-library/react');
  fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: 'x'.repeat(65_537) } });
  expect(onInputChange).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
  expect(onText).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('64 KiB');
});
