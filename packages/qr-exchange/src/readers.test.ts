import { describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_TEXT_LEN } from './camera.js';
import { QrExchangeError } from './errors.js';
import { qrMatrix } from './generate.js';
import { encodeMultipart } from './multipart.js';
import { decodeQrImage, MAX_IMAGE_BYTES, MAX_IMAGE_DIM, MAX_IMAGE_PIXELS } from './readers.js';
import type { Canvas2dLike, DecodeImageEnv, Frame, ImageBitmapLike, QrFrameDecoder } from './readers.js';

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return e instanceof QrExchangeError ? e.code : 'OTHER';
  }
  return 'NONE';
};

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

const png = (size = 1000, type = 'image/png') => ({ size, type });

function setup(opts: { width?: number; height?: number; frame?: Frame; noContext?: boolean; bitmap?: () => Promise<ImageBitmapLike> } = {}) {
  const close = vi.fn();
  const draws: number[][] = [];
  const canvas: Canvas2dLike & { width: number; height: number } = {
    width: 0,
    height: 0,
    getContext: () => opts.noContext === true ? null : ({
      drawImage: (_s, x, y, w, h) => { draws.push([x, y, w, h]); },
      getImageData: (_x, _y, w, h) => opts.frame ?? { data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h },
    }),
  };
  const createImageBitmap = vi.fn(opts.bitmap ?? (() => Promise.resolve({ width: opts.width ?? 400, height: opts.height ?? 300, close })));
  const createElement = vi.fn(() => canvas);
  const env = { createImageBitmap, document: { createElement } };
  return { env, close, draws, canvas, createImageBitmap, createElement };
}

describe('decodeQrImage', () => {
  it('decodes a real QR image locally with jsQR, downscales large images and releases the bitmap and canvas', async () => {
    const chunk = encodeMultipart(new Uint8Array(300).map((_, i) => i & 255))[0] as string;
    const s = setup({ width: 3200, height: 1600, frame: renderFrame(chunk) });
    expect(await decodeQrImage(png(), { env: s.env })).toBe(chunk);
    expect(s.draws).toEqual([[0, 0, MAX_IMAGE_DIM, 800]]);
    expect(s.close).toHaveBeenCalledOnce();
    expect([s.canvas.width, s.canvas.height]).toEqual([0, 0]);
    expect(MAX_IMAGE_DIM).toBe(1600);

    const small = setup({ width: 120, height: 90 });
    const decoder: QrFrameDecoder = { decode: vi.fn(() => null) };
    expect(await decodeQrImage(png(), { env: small.env, decoder })).toBeNull();
    expect(small.draws).toEqual([[0, 0, 120, 90]]);
    expect(await decodeQrImage(png(), { env: small.env, decoder: { decode: () => '' } })).toBeNull();
    expect(await decodeQrImage(png(), { env: small.env, decoder: { decode: () => 'x'.repeat(MAX_SCAN_TEXT_LEN + 1) } })).toBeNull();
    expect(await decodeQrImage(png(), { env: small.env, maxDim: 60, decoder: { decode: () => 'ok' } })).toBe('ok');
    expect(small.draws.at(-1)).toEqual([0, 0, 60, 45]);
  });

  it('enforces size and MIME limits before decoding anything', async () => {
    const s = setup();
    const decoder = { decode: () => 'ok' };
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(await decodeQrImage(png(MAX_IMAGE_BYTES), { env: s.env, decoder })).toBe('ok');
    expect(await codeOf(decodeQrImage(png(MAX_IMAGE_BYTES + 1), { env: s.env }))).toBe('TOO_LARGE');
    expect(await codeOf(decodeQrImage(png(2048), { env: s.env, maxBytes: 1024 }))).toBe('TOO_LARGE');
    for (const type of ['text/plain', '', 'image/svg+xml', 'application/octet-stream', 'image/', 'IMAGE/PNG; x']) {
      expect(await codeOf(decodeQrImage(png(10, type), { env: s.env })), type).toBe('BAD_INPUT');
    }
    expect(await decodeQrImage(png(10, 'IMAGE/JPEG'), { env: s.env, decoder })).toBe('ok');
    expect(await codeOf(decodeQrImage(png(0), { env: s.env }))).toBe('BAD_INPUT');
    expect(await codeOf(decodeQrImage(png(Number.NaN), { env: s.env }))).toBe('BAD_INPUT');
    expect(await codeOf(decodeQrImage(null as never, { env: s.env }))).toBe('BAD_INPUT');
    expect(s.createImageBitmap).toHaveBeenCalledTimes(2);
  });

  it('rejects undecodable images, decompression bombs and images without size', async () => {
    const broken = setup({ bitmap: () => Promise.reject(new Error('bad image')) });
    expect(await codeOf(decodeQrImage(png(), { env: broken.env }))).toBe('SCAN_FAILED');
    expect(await codeOf(decodeQrImage(png(), { env: {} }))).toBe('SCAN_FAILED');

    const bomb = setup({ width: 10_000, height: 10_000 });
    expect(10_000 * 10_000).toBeGreaterThan(MAX_IMAGE_PIXELS);
    expect(await codeOf(decodeQrImage(png(), { env: bomb.env }))).toBe('TOO_LARGE');
    expect(bomb.close).toHaveBeenCalledOnce();
    expect(bomb.createElement).not.toHaveBeenCalled();

    const empty = setup({ width: 0, height: 10 });
    expect(await codeOf(decodeQrImage(png(), { env: empty.env }))).toBe('SCAN_FAILED');
    expect(empty.close).toHaveBeenCalledOnce();

    const noCtx = setup({ noContext: true });
    expect(await codeOf(decodeQrImage(png(), { env: noCtx.env, decoder: { decode: () => 'x' } }))).toBe('SCAN_FAILED');
    expect(noCtx.close).toHaveBeenCalledOnce();

    const noDoc = setup();
    expect(await codeOf(decodeQrImage(png(), { env: { createImageBitmap: noDoc.env.createImageBitmap } }))).toBe('SCAN_FAILED');

    const throwingClose = { createImageBitmap: () => Promise.resolve({ width: 10, height: 10, close: () => { throw new Error('x'); } }), document: setup().env.document };
    expect(await decodeQrImage(png(), { env: throwingClose, decoder: { decode: () => 'ok' } })).toBe('ok');
  });

  it('honours abort before, during and after bitmap decoding and always releases the bitmap', async () => {
    const pre = new AbortController();
    pre.abort();
    const s = setup();
    expect(await codeOf(decodeQrImage(png(), { env: s.env, signal: pre.signal }))).toBe('ABORTED');
    expect(s.createImageBitmap).not.toHaveBeenCalled();

    const mid = new AbortController();
    const close = vi.fn();
    const during = setup({ bitmap: () => { mid.abort(); return Promise.resolve({ width: 10, height: 10, close }); } });
    expect(await codeOf(decodeQrImage(png(), { env: during.env, signal: mid.signal }))).toBe('ABORTED');
    expect(close).toHaveBeenCalledOnce();
    expect(during.createElement).not.toHaveBeenCalled();

    const late = new AbortController();
    const after = setup();
    const decoder = { decode: vi.fn(() => 'secret') };
    const env: DecodeImageEnv = {
      ...after.env,
      BarcodeDetector: class { detect() { late.abort(); return Promise.resolve([]); } },
    };
    expect(await codeOf(decodeQrImage(png(), { env, decoder, signal: late.signal }))).toBe('ABORTED');
    expect(decoder.decode).not.toHaveBeenCalled();
    expect(after.close).toHaveBeenCalledOnce();
  });

  it('prefers the platform detector and falls back to jsQR when it finds nothing or fails', async () => {
    const s = setup();
    const decoder = { decode: vi.fn(() => 'from-jsqr') };
    const found = class { static getSupportedFormats = () => Promise.resolve(['qr_code']); detect() { return Promise.resolve([{ rawValue: 'from-platform' }]); } };
    expect(await decodeQrImage(png(), { env: { createImageBitmap: s.env.createImageBitmap, BarcodeDetector: found }, decoder })).toBe('from-platform');
    expect(decoder.decode).not.toHaveBeenCalled();
    const big = class { detect() { return Promise.resolve([{ rawValue: 'x'.repeat(MAX_SCAN_TEXT_LEN + 1) }]); } };
    expect(await decodeQrImage(png(), { env: { createImageBitmap: s.env.createImageBitmap, BarcodeDetector: big } })).toBeNull();
    const none = class { detect() { return Promise.resolve([]); } };
    expect(await decodeQrImage(png(), { env: { ...s.env, BarcodeDetector: none }, decoder })).toBe('from-jsqr');
    const fails = class { detect(): Promise<never> { return Promise.reject(new Error('x')); } };
    expect(await decodeQrImage(png(), { env: { ...s.env, BarcodeDetector: fails }, decoder })).toBe('from-jsqr');
    expect(decoder.decode).toHaveBeenCalledTimes(2);
  });
});
