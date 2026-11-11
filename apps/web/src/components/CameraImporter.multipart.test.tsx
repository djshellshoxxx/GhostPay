// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crc32Ascii, encodeMultipart, QrExchangeError } from '@ghostpay/qr-exchange';

const fakes = vi.hoisted(() => ({ startCamera: vi.fn(), scanFromVideo: vi.fn(), decodeQrImage: vi.fn(), listVideoInputs: vi.fn() }));
// Real Assembler, chunk parser and errors; only the camera, device listing and image decoder are replaced.
vi.mock('@ghostpay/qr-exchange', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...fakes }));

import { CameraImporter, type CameraImporterProps } from './CameraImporter';

type Frame = (text: string) => Promise<boolean>;
let frame: Frame | undefined;
let scanEnded: (() => void) | undefined;
beforeEach(() => {
  frame = undefined;
  fakes.startCamera.mockResolvedValue(undefined);
  fakes.listVideoInputs.mockResolvedValue([]);
  fakes.scanFromVideo.mockImplementation((_video: HTMLVideoElement, callback: Frame) => {
    frame = callback;
    return new Promise<void>((resolve) => { scanEnded = resolve; });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const enc = new TextEncoder();
const SECRET = 'ghostpay-backup:' + 'S3CRET-PAYLOAD-'.repeat(30) + 'é✓';
function chunksOf(text: string, chunkChars = 64): string[] {
  // Copy into this realm: jsdom's TextEncoder returns a Uint8Array from another realm.
  return encodeMultipart(Uint8Array.from(enc.encode(text)), { chunkChars });
}
/** A chunk with a valid CRC for arbitrary fields: lets tests build conflicting or forged parts. */
function forge(session: string, index: number, total: number, data: string): string {
  const crc = crc32Ascii(`${session}/${String(index)}/${String(total)}/${data}`).toString(16).padStart(8, '0');
  return `GPQ1/${session}/${String(index)}/${String(total)}/${crc}/${data}`;
}
function fields(chunk: string) {
  const [, session = '', index = '', total = '', , data = ''] = chunk.split('/');
  return { session, index: Number(index), total: Number(total), data };
}

const status = (): string => screen.getByRole('status').textContent ?? '';
function renderImporter(props: Partial<CameraImporterProps> = {}) {
  const onText = vi.fn<CameraImporterProps['onText']>(() => true);
  const view = render(<CameraImporter label="Import a QR" multipart onText={onText} {...props} />);
  return { onText, ...view };
}
async function startCamera(user: ReturnType<typeof userEvent.setup>): Promise<Frame> {
  await user.click(screen.getByRole('button', { name: 'Scan with camera' }));
  await waitFor(() => { expect(frame).toBeTypeOf('function'); });
  return frame as Frame;
}
async function show(scan: Frame, text: string): Promise<boolean> {
  let result = false;
  await act(async () => { result = await scan(text); });
  return result;
}
const progressBar = (): HTMLProgressElement => screen.getByRole<HTMLProgressElement>('progressbar', { name: 'Multipart QR transfer progress' });

describe('CameraImporter multipart camera scanning', () => {
  it('assembles parts out of order, ignores duplicates, lists missing parts and delivers the text exactly once', async () => {
    const parts = chunksOf(SECRET);
    expect(parts.length).toBeGreaterThan(5);
    const { onText, container } = renderImporter();
    const user = userEvent.setup();
    const scan = await startCamera(user);

    expect(await show(scan, parts[2] as string)).toBe(false);
    const n = parts.length;
    expect(status()).toBe(`1 of ${String(n)} parts received. Still missing: ${[...Array(n).keys()].filter((i) => i !== 2).map((i) => String(i + 1)).join(', ')}.`);
    expect(progressBar().value).toBe(1);
    expect(progressBar().max).toBe(n);
    expect(progressBar().getAttribute('aria-valuetext')).toBe(`1 of ${String(n)} parts received.`);

    expect(await show(scan, parts[0] as string)).toBe(false);
    const before = status();
    expect(await show(scan, parts[2] as string)).toBe(false); // duplicate: silently ignored
    expect(status()).toBe(before);
    expect(progressBar().value).toBe(2);

    const rest = parts.map((_, i) => i).filter((i) => i !== 0 && i !== 2).reverse();
    for (const i of rest.slice(0, -1)) expect(await show(scan, parts[i] as string)).toBe(false);
    expect(status()).toBe(`${String(n - 1)} of ${String(n)} parts received. Still missing: ${String((rest.at(-1) ?? 0) + 1)}.`);
    expect(onText).not.toHaveBeenCalled();

    expect(await show(scan, parts[rest.at(-1) ?? 0] as string)).toBe(true);
    expect(onText).toHaveBeenCalledOnce();
    expect(onText.mock.calls[0]?.[0]).toBe(SECRET);
    expect(status()).toBe('QR text accepted.');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.textContent).not.toContain('S3CRET');
    expect(container.textContent).not.toContain('GPQ1');
    act(() => { scanEnded?.(); });
  });

  it('caps the missing list at 12 entries', async () => {
    const parts = chunksOf('x'.repeat(1500), 64);
    expect(parts.length).toBeGreaterThan(20);
    renderImporter();
    const scan = await startCamera(userEvent.setup());
    await show(scan, parts[1] as string);
    const more = parts.length - 1 - 12;
    expect(status()).toBe(`1 of ${String(parts.length)} parts received. Still missing: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 and ${String(more)} more.`);
  });

  it('refuses a part from another transfer, keeps progress, and offers Start over', async () => {
    const a = chunksOf(SECRET);
    const b = chunksOf('another transfer '.repeat(30));
    const { onText } = renderImporter();
    const user = userEvent.setup();
    const scan = await startCamera(user);
    await show(scan, a[0] as string);
    await show(scan, a[1] as string);
    expect(await show(scan, b[0] as string)).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe('That part belongs to a different transfer and was not added. Finish the current transfer, or start over to scan the new one.');
    expect(progressBar().value).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(status()).toBe('Transfer cleared. Scan or paste the parts again.');
    expect(document.activeElement).toBe(screen.getByRole('status')); // focus is not dropped when the button goes away
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeTruthy(); // camera keeps running

    for (const part of b.slice(0, -1)) expect(await show(scan, part)).toBe(false);
    expect(await show(scan, b.at(-1) as string)).toBe(true);
    expect(onText).toHaveBeenCalledOnce();
    expect(onText.mock.calls[0]?.[0]).toBe('another transfer '.repeat(30));
  });

  it('clears the transfer on a conflicting part and on a failed integrity check', async () => {
    const parts = chunksOf(SECRET);
    const { onText } = renderImporter();
    const scan = await startCamera(userEvent.setup());
    await show(scan, parts[0] as string);
    const f = fields(parts[0] as string);
    const flipped = (f.data.startsWith('A') ? 'B' : 'A') + f.data.slice(1);
    await show(scan, forge(f.session, 0, f.total, flipped));
    expect(screen.getByRole('alert').textContent).toBe('Two different versions of the same part were read, so the transfer was cleared. Scan all parts again.');
    expect(screen.queryByRole('progressbar')).toBeNull();

    // Every part carries a valid CRC but the session id does not match the payload hash.
    const forged = parts.map((p) => { const x = fields(p); return forge('0123456789abcdef', x.index, x.total, x.data); });
    for (const p of forged.slice(0, -1)) await show(scan, p);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await show(scan, forged.at(-1) as string)).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe('The assembled transfer failed its integrity check and was cleared. Scan all parts again.');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(onText).not.toHaveBeenCalled();
  });

  it('expires an idle transfer using the injected clock', async () => {
    let now = 1_000;
    const parts = chunksOf(SECRET);
    renderImporter({ assemblerOptions: { now: () => now, maxAgeMs: 60_000 } });
    const scan = await startCamera(userEvent.setup());
    await show(scan, parts[0] as string);
    now += 60_001;
    await show(scan, parts[1] as string);
    expect(screen.getByRole('alert').textContent).toBe('The transfer timed out; scan all parts again.');
    expect(screen.queryByRole('progressbar')).toBeNull();
    await show(scan, parts[1] as string);
    expect(progressBar().value).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports an unreadable part without stopping the camera', async () => {
    renderImporter();
    const scan = await startCamera(userEvent.setup());
    expect(await show(scan, 'GPQ1/zz/0/2/00000000/AAAA')).toBe(false);
    expect(status()).toBe('That part could not be read. Scan or paste it again.');
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeTruthy();
  });

  it('resets after onText rejects so the same parts can be scanned again', async () => {
    const parts = chunksOf(SECRET);
    const onText = vi.fn<CameraImporterProps['onText']>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderImporter({ onText });
    const scan = await startCamera(userEvent.setup());
    for (const p of parts.slice(0, -1)) await show(scan, p);
    expect(await show(scan, parts.at(-1) as string)).toBe(false);
    expect(status()).toBe('That QR text was not accepted. Check it and try again.');
    expect(screen.queryByRole('progressbar')).toBeNull();
    // The same last part now starts a new transfer rather than re-delivering the old one.
    await show(scan, parts[0] as string);
    expect(progressBar().value).toBe(1);
    for (const p of parts.slice(1, -1)) await show(scan, p);
    expect(await show(scan, parts.at(-1) as string)).toBe(true);
    expect(onText).toHaveBeenCalledTimes(2);
  });

  it('rejects a completed payload that is not valid UTF-8', async () => {
    const parts = encodeMultipart(new Uint8Array([0xff, 0xfe, 0x00, 0x41, 0xc3]), { chunkChars: 32 });
    const { onText } = renderImporter();
    const scan = await startCamera(userEvent.setup());
    for (const p of parts) await show(scan, p);
    expect(onText).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('The assembled transfer failed its integrity check and was cleared. Scan all parts again.');
  });

  it('passes single-QR text unchanged, and multipart=false leaves chunk text to onText', async () => {
    const { onText, unmount } = renderImporter();
    const scan = await startCamera(userEvent.setup());
    expect(await show(scan, ' plain invoice ')).toBe(true);
    expect(onText.mock.calls[0]?.[0]).toBe('plain invoice');
    unmount();

    const part = chunksOf(SECRET)[0] as string;
    const off = renderImporter({ multipart: false });
    const scan2 = await startCamera(userEvent.setup());
    await show(scan2, part);
    expect(off.onText.mock.calls[0]?.[0]).toBe(part);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('clears partial progress when stopped, hidden, or the scope changes', async () => {
    const parts = chunksOf(SECRET);
    const { rerender, onText } = renderImporter({ scopeKey: 'a' });
    const user = userEvent.setup();
    let scan = await startCamera(user);
    await show(scan, parts[0] as string);
    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(screen.queryByRole('progressbar')).toBeNull();

    frame = undefined;
    scan = await startCamera(user);
    await show(scan, parts[0] as string);
    rerender(<CameraImporter label="Import a QR" multipart onText={onText} scopeKey="b" />);
    expect(screen.queryByRole('progressbar')).toBeNull();

    fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: parts[1] } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(progressBar().value).toBe(1);
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    } finally {
      if (visibility === undefined) Reflect.deleteProperty(document, 'visibilityState');
      else Object.defineProperty(document, 'visibilityState', visibility);
    }
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(status()).toBe('The partial transfer was cleared while the page was hidden. Scan or paste all parts again.');
  });
});

describe('CameraImporter multipart paste', () => {
  it('accepts several chunk lines at once, in any order, and calls onText once', async () => {
    const parts = chunksOf(SECRET);
    const { onText, container } = renderImporter();
    const user = userEvent.setup();
    const shuffled = [...parts.slice(3), parts[0], parts[0], ...parts.slice(1, 3)].join('\r\n');
    fireEvent.change(screen.getByLabelText('Or paste QR text'), { target: { value: `\n${shuffled}\n\n` } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    expect(onText.mock.calls[0]?.[0]).toBe(SECRET);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text').value).toBe('');
    expect(container.textContent).not.toContain('S3CRET');
  });

  it('keeps progress across separate pastes and keeps text when a line is bad', async () => {
    const parts = chunksOf(SECRET);
    const { onText } = renderImporter();
    const user = userEvent.setup();
    const box = screen.getByLabelText<HTMLTextAreaElement>('Or paste QR text');
    fireEvent.change(box, { target: { value: parts.slice(0, 2).join('\n') } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect(progressBar().value).toBe(2); });
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: `${parts[2] ?? ''}\nnot a chunk` } });
    expect(progressBar().value).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect(status()).toBe('That part could not be read. Scan or paste it again.'); });
    expect(progressBar().value).toBe(3);
    expect(box.value).not.toBe('');
    fireEvent.change(box, { target: { value: parts.slice(3).join('\n') } });
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
  });
});

describe('CameraImporter image import', () => {
  const png = () => new File([new Uint8Array([1, 2, 3])], 'qr.png', { type: 'image/png' });

  it('decodes locally and passes the text through the same bounded submit path', async () => {
    fakes.decodeQrImage.mockResolvedValueOnce('  invoice from image ');
    const onInputChange = vi.fn();
    const { onText } = renderImporter({ multipart: false, onInputChange });
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Read a QR from an image'), png());
    await waitFor(() => { expect(onText).toHaveBeenCalledOnce(); });
    expect(onText.mock.calls[0]?.[0]).toBe('invoice from image');
    expect(fakes.decodeQrImage.mock.calls[0]?.[0]).toBeInstanceOf(File);
    expect(onInputChange).toHaveBeenCalled();
    expect(status()).toBe('QR text accepted.');
  });

  it('feeds a chunk read from an image into the transfer', async () => {
    const parts = chunksOf(SECRET);
    fakes.decodeQrImage.mockResolvedValueOnce(parts[1]);
    renderImporter();
    await userEvent.setup().upload(screen.getByLabelText('Read a QR from an image'), png());
    await waitFor(() => { expect(progressBar().value).toBe(1); });
  });

  it.each([
    [new QrExchangeError('TOO_LARGE'), 'That image is larger than 10 MiB. Choose a smaller image or paste the QR text.'],
    [new QrExchangeError('BAD_INPUT'), 'That file is not a supported image. Choose a photo or screenshot of the QR code, or paste the QR text.'],
    [new QrExchangeError('SCAN_FAILED'), 'That image could not be opened. Choose another image or paste the QR text.'],
    [new Error('other'), 'That image could not be opened. Choose another image or paste the QR text.'],
  ])('explains %s', async (error, message) => {
    fakes.decodeQrImage.mockRejectedValueOnce(error);
    const { onText } = renderImporter();
    await userEvent.setup().upload(screen.getByLabelText('Read a QR from an image'), png());
    await waitFor(() => { expect(status()).toBe(message); });
    expect(onText).not.toHaveBeenCalled();
  });

  it('says when no QR code was found', async () => {
    fakes.decodeQrImage.mockResolvedValueOnce(null);
    renderImporter();
    await userEvent.setup().upload(screen.getByLabelText('Read a QR from an image'), png());
    await waitFor(() => { expect(status()).toBe('No QR code was found in that image. Try a sharper image or paste the QR text.'); });
  });

  it('aborts a pending decode on unmount and never delivers its result', async () => {
    let finish!: (text: string) => void;
    let signal: AbortSignal | undefined;
    fakes.decodeQrImage.mockImplementationOnce((_file: File, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<string>((resolve) => { finish = resolve; });
    });
    const consoleError = vi.spyOn(console, 'error');
    const { onText, unmount } = renderImporter();
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Read a QR from an image'), png());
    expect(status()).toBe('Reading the image on this device…');
    expect(screen.getByLabelText<HTMLInputElement>('Read a QR from an image').disabled).toBe(true);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish('late'); await Promise.resolve(); });
    expect(onText).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Stop cancels a pending image decode', async () => {
    let signal: AbortSignal | undefined;
    fakes.decodeQrImage.mockImplementationOnce((_file: File, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<string>(() => undefined);
    });
    renderImporter();
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Read a QR from an image'), png());
    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Read a QR from an image').disabled).toBe(false);
  });
});
