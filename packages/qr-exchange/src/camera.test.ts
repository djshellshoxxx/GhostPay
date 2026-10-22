import qrcode from 'qrcode-generator';
import { describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_TEXT_LEN, scanFromVideo, startCamera, stopVideo } from './camera.js';
import type { FrameReader, MediaDevicesLike, VideoLike } from './camera.js';
import { QrExchangeError } from './errors.js';
import { qrMatrix, qrSvgPath } from './generate.js';
import { encodeMultipart } from './multipart.js';
import {
  createCanvasGrabber,
  createDecoderReader,
  createDefaultReader,
  createPlatformReader,
  loadJsQrDecoder,
} from './readers.js';
import type { Canvas2dLike, Frame } from './readers.js';

function fakeStream() {
  const stops = [vi.fn(), vi.fn()];
  return { stops, stream: { getTracks: () => stops.map((s) => ({ stop: s })) } };
}
function fakeVideo(over: Partial<VideoLike> = {}): VideoLike & { played: number } {
  const v = {
    srcObject: null as unknown,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    played: 0,
    play() {
      v.played++;
      return Promise.resolve();
    },
    ...over,
  };
  return v;
}
const noWait = (): Promise<void> => Promise.resolve();
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return e instanceof QrExchangeError ? e.code : 'OTHER';
  }
  return 'NONE';
};
const seq = (...vals: (string | null | Error)[]): FrameReader => {
  let i = 0;
  return {
    read() {
      const v = vals[Math.min(i++, vals.length - 1)];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? null);
    },
  };
};

describe('startCamera', () => {
  it('attaches the stream and plays, only when called', async () => {
    const { stream } = fakeStream();
    const gum = vi.fn().mockResolvedValue(stream);
    const v = fakeVideo();
    expect(gum).not.toHaveBeenCalled();
    await startCamera(v, { getUserMedia: gum });
    expect(gum).toHaveBeenCalledWith({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    expect(v.srcObject).toBe(stream);
    expect(v.played).toBe(1);
  });
  it('maps errors', async () => {
    const v = fakeVideo();
    const mk = (name: string): MediaDevicesLike => ({ getUserMedia: () => Promise.reject(Object.assign(new Error('x'), { name })) });
    expect(await codeOf(startCamera(v, mk('NotAllowedError')))).toBe('CAMERA_DENIED');
    expect(await codeOf(startCamera(v, mk('SecurityError')))).toBe('CAMERA_DENIED');
    expect(await codeOf(startCamera(v, mk('NotFoundError')))).toBe('CAMERA_UNAVAILABLE');
    expect(await codeOf(startCamera(v, { getUserMedia: () => Promise.reject(new Error('str')) }))).toBe('CAMERA_UNAVAILABLE');
    expect(await codeOf(startCamera(v, undefined))).toBe('CAMERA_UNAVAILABLE');
    expect(await codeOf(startCamera(v, {} as MediaDevicesLike))).toBe('CAMERA_UNAVAILABLE');
  });
  it('stops tracks if play fails or abort happens mid-prompt; no prompt if pre-aborted', async () => {
    const a = fakeStream();
    const v = fakeVideo({ play: () => Promise.reject(new Error('x')) });
    expect(await codeOf(startCamera(v, { getUserMedia: () => Promise.resolve(a.stream) }))).toBe('CAMERA_UNAVAILABLE');
    expect(a.stops.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(v.srcObject).toBeNull();

    const b = fakeStream();
    const ac = new AbortController();
    const v2 = fakeVideo();
    const p = startCamera(v2, { getUserMedia: () => { ac.abort(); return Promise.resolve(b.stream); } }, { signal: ac.signal });
    expect(await codeOf(p)).toBe('ABORTED');
    expect(b.stops[0]).toHaveBeenCalledTimes(1);

    const gum = vi.fn();
    expect(await codeOf(startCamera(v2, { getUserMedia: gum }, { signal: ac.signal }))).toBe('ABORTED');
    expect(gum).not.toHaveBeenCalled();

    const c = fakeStream();
    const afterPlay = new AbortController();
    const v3 = fakeVideo({ play: () => { afterPlay.abort(); return Promise.resolve(); } });
    expect(await codeOf(startCamera(v3, { getUserMedia: () => Promise.resolve(c.stream) }, { signal: afterPlay.signal }))).toBe('ABORTED');
    expect(c.stops.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(v3.srcObject).toBeNull();
  });
  it('a late aborted acquisition stops only its own stream and cannot replace a newer stream', async () => {
    const a = fakeStream();
    const b = fakeStream();
    let resolveA: (stream: typeof a.stream) => void = () => undefined;
    let resolveB: (stream: typeof b.stream) => void = () => undefined;
    const acA = new AbortController();
    const video = fakeVideo();
    const pendingA = startCamera(video, { getUserMedia: () => new Promise((resolve) => { resolveA = resolve; }) }, { signal: acA.signal });
    acA.abort();
    const pendingB = startCamera(video, { getUserMedia: () => new Promise((resolve) => { resolveB = resolve; }) });

    resolveB(b.stream);
    await pendingB;
    expect(video.srcObject).toBe(b.stream);
    resolveA(a.stream);
    expect(await codeOf(pendingA)).toBe('ABORTED');
    expect(video.srcObject).toBe(b.stream);
    expect(a.stops.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(b.stops.every((s) => s.mock.calls.length === 0)).toBe(true);

    stopVideo(video);
    expect(b.stops.every((s) => s.mock.calls.length === 1)).toBe(true);
  });
});

describe('scanFromVideo', () => {
  it('delivers distinct texts, skips repeats, stops tracks when onText returns true', async () => {
    const { stream, stops } = fakeStream();
    const v = fakeVideo({ srcObject: stream });
    const got: string[] = [];
    await scanFromVideo(v, (t) => { got.push(t); return t === 'c'; }, { reader: seq('a', 'a', null, 'b', 'b', 'c', 'd'), wait: noWait });
    expect(got).toEqual(['a', 'b', 'c']);
    expect(stops.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(v.srcObject).toBeNull();
  });
  it('waits for the video to have frames; drops oversize text', async () => {
    const v = fakeVideo({ readyState: 0 });
    const got: string[] = [];
    let waits = 0;
    const wait = (): Promise<void> => { if (++waits === 2) (v as { readyState: number }).readyState = 4; return Promise.resolve(); };
    await scanFromVideo(v, (t) => { got.push(t); return true; }, { reader: seq('x'.repeat(MAX_SCAN_TEXT_LEN + 1), '', 'ok'), wait });
    expect(got).toEqual(['ok']);
    expect(waits).toBeGreaterThanOrEqual(2);
  });
  it('resolves on abort and stops tracks; async onText supported', async () => {
    const { stream, stops } = fakeStream();
    const v = fakeVideo({ srcObject: stream });
    const ac = new AbortController();
    await scanFromVideo(v, async () => { await Promise.resolve(); ac.abort(); }, { reader: seq('a', 'b'), wait: noWait, signal: ac.signal });
    expect(stops[0]).toHaveBeenCalledTimes(1);
  });
  it('tolerates transient read errors, fails after persistent ones, stops tracks on onText throw', async () => {
    const e = new Error('detect');
    const v1 = fakeVideo();
    const got: string[] = [];
    await scanFromVideo(v1, (t) => { got.push(t); return true; }, { reader: seq(e, e, 'ok'), wait: noWait });
    expect(got).toEqual(['ok']);

    const { stream, stops } = fakeStream();
    const v2 = fakeVideo({ srcObject: stream });
    expect(await codeOf(scanFromVideo(v2, () => true, { reader: seq(e), wait: noWait }))).toBe('SCAN_FAILED');
    expect(stops[0]).toHaveBeenCalledTimes(1);

    const s3 = fakeStream();
    const v3 = fakeVideo({ srcObject: s3.stream });
    const boom = new Error('cb');
    await expect(scanFromVideo(v3, () => { throw boom; }, { reader: seq('a'), wait: noWait })).rejects.toBe(boom);
    expect(s3.stops[0]).toHaveBeenCalledTimes(1);
  });
  it('default wait honours abort and timers', async () => {
    const ac = new AbortController();
    const v = fakeVideo({ readyState: 0 });
    const p = scanFromVideo(v, () => true, { reader: seq(null), signal: ac.signal, intervalMs: 10_000 });
    setTimeout(() => ac.abort(), 5);
    await p;
    const pre = new AbortController();
    pre.abort();
    await scanFromVideo(v, () => true, { reader: seq(null), signal: pre.signal });
    let n = 0;
    await scanFromVideo(fakeVideo(), () => true, { reader: { read: () => Promise.resolve(++n > 1 ? 'x' : null) }, intervalMs: 1 });
    expect(n).toBeGreaterThan(1);
  });
  it('stopVideo survives throwing tracks and non-stream srcObject', () => {
    const ok = vi.fn();
    const v = fakeVideo({ srcObject: { getTracks: () => [{ stop: () => { throw new Error('x'); } }, { stop: ok }] } });
    stopVideo(v);
    expect(ok).toHaveBeenCalled();
    const v2 = fakeVideo({ srcObject: new Blob([]) });
    stopVideo(v2);
    expect(v2.srcObject).toBeNull();
    const v3 = fakeVideo({ srcObject: { getTracks: () => { throw new Error('tracks'); } } });
    expect(() => stopVideo(v3)).not.toThrow();
    expect(v3.srcObject).toBeNull();
  });
  it('uses the default reader when none is given', async () => {
    const v = fakeVideo();
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      detect() { return Promise.resolve([{ rawValue: 'hello' }]); }
    };
    try {
      const got: string[] = [];
      await scanFromVideo(v, (t) => { got.push(t); return true; }, { wait: noWait });
      expect(got).toEqual(['hello']);
    } finally {
      delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    }
  });
});

describe('readers', () => {
  it('platform reader: absent, unsupported format, ctor throws, works', async () => {
    expect(await createPlatformReader(undefined)).toBeNull();
    const noQr = class { static getSupportedFormats = () => Promise.resolve(['ean_13']); detect() { return Promise.resolve([]); } };
    expect(await createPlatformReader(noQr)).toBeNull();
    const bad = class { constructor() { throw new Error('x'); } detect() { return Promise.resolve([]); } };
    expect(await createPlatformReader(bad)).toBeNull();
    const ok = class { static getSupportedFormats = () => Promise.resolve(['qr_code']); detect() { return Promise.resolve([{ rawValue: 'v' }]); } };
    expect(await (await createPlatformReader(ok))?.read(fakeVideo())).toBe('v');
    const none = class { detect() { return Promise.resolve([]); } };
    expect(await (await createPlatformReader(none))?.read(fakeVideo())).toBeNull();
  });

  function renderFrame(text: string, scale = 4): Frame {
    const m = qrMatrix(text, 'M');
    const q = 4;
    const side = (m.size + q * 2) * scale;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++)
        if (m.dark[r * m.size + c]) for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
          const i = (((r + q) * scale + y) * side + (c + q) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    return { data, width: side, height: side };
  }

  it('jsQR fallback decodes real generated chunks end to end (pure JS path)', async () => {
    const decoder = await loadJsQrDecoder();
    const chunks = encodeMultipart(new Uint8Array(1200).map((_, i) => (i * 7) & 255));
    for (const c of chunks) expect(decoder.decode(renderFrame(c))).toBe(c);
    expect(decoder.decode({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 })).toBeNull();
  });

  it('canvas grabber downsizes, reuses canvas, handles no-context / no-size', () => {
    const calls: number[][] = [];
    const canvas: Canvas2dLike = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (_s, x, y, w, h) => { calls.push([x, y, w, h]); },
        getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      }),
    };
    const make = vi.fn(() => canvas);
    const g = createCanvasGrabber(make, 800);
    const f = g.grab(fakeVideo({ videoWidth: 1600, videoHeight: 1200 }));
    expect([f?.width, f?.height]).toEqual([800, 600]);
    expect(g.grab(fakeVideo({ videoWidth: 100, videoHeight: 50 }))?.width).toBe(100);
    expect(make).toHaveBeenCalledTimes(1);
    expect(g.grab(fakeVideo({ videoWidth: 0 }))).toBeNull();
    const none = createCanvasGrabber(() => ({ width: 0, height: 0, getContext: () => null }));
    expect(() => none.grab(fakeVideo())).toThrow('qr-exchange: scanning failed');
  });

  it('decoder reader and default reader fallback', async () => {
    const reader = createDecoderReader({ grab: () => null }, { decode: () => 'x' });
    expect(await reader.read(fakeVideo())).toBeNull();
    const r2 = createDecoderReader({ grab: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) }, { decode: () => 'x' });
    expect(await r2.read(fakeVideo())).toBe('x');
    expect(await codeOf(createDefaultReader({}))).toBe('SCAN_FAILED');

    const chunk = encodeMultipart(new Uint8Array([1, 2, 3, 4, 5]))[0] as string;
    const frame = renderFrame(chunk);
    const canvas: Canvas2dLike = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: () => undefined, getImageData: () => frame }),
    };
    const rd = await createDefaultReader({ document: { createElement: () => canvas } });
    expect(await rd.read(fakeVideo())).toBe(chunk);
  });
});

describe('generate', () => {
  it('produces a decodable matrix and svg path; documents capacity', () => {
    const m = qrMatrix('hello', 'L');
    expect(m.size).toBe(21);
    expect(m.version).toBe(1);
    expect(qrSvgPath(m)).toMatch(/^M\d+ \d+h1v1h-1z/);
    // largest default-sized chunk and largest possible chunk: record versions (see README table)
    const big = encodeMultipart(new Uint8Array(32768).fill(0xab)).reduce((a, b) => (a.length >= b.length ? a : b));
    expect(qrMatrix(big, 'L').version).toBeLessThanOrEqual(22);
    const dflt = encodeMultipart(new Uint8Array(16384).fill(0xab)).reduce((a, b) => (a.length >= b.length ? a : b));
    expect(qrMatrix(dflt, 'L').version).toBeLessThanOrEqual(15);
    expect(qrMatrix(dflt, 'M').version).toBeLessThanOrEqual(18);
  });
  it('rejects bad input and over-capacity text', () => {
    expect(() => qrMatrix('')).toThrow('qr-exchange: invalid input');
    expect(() => qrMatrix('a', 'H' as 'L')).toThrow('qr-exchange: invalid input');
    expect(() => qrMatrix('a'.repeat(3000))).toThrow('qr-exchange: text too long for a QR code');
    void qrcode;
  });
});
