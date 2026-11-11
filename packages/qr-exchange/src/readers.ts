import { MAX_SCAN_TEXT_LEN } from './camera.js';
import type { FrameReader, VideoLike } from './camera.js';
import { QrExchangeError } from './errors.js';

/** Platform BarcodeDetector (Chromium, Safari 17+ on some platforms; not Firefox). */
export interface BarcodeDetectorLike {
  detect(source: unknown): Promise<readonly { readonly rawValue: string }[]>;
}
export interface BarcodeDetectorCtorLike {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<readonly string[]>;
}

/** RGBA pixels of one frame. */
export interface Frame {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}
/** Pure-JS QR decoder interface; the jsQR wrapper is one implementation. */
export interface QrFrameDecoder {
  decode(frame: Frame): string | null;
}
/** Copies the current video frame into RGBA pixels (DOM canvas in production, fake in tests). */
export interface FrameGrabber {
  grab(video: VideoLike): Frame | null;
}
export interface Canvas2dLike {
  width: number;
  height: number;
  getContext(
    id: '2d',
    options: { willReadFrequently: boolean },
  ): {
    drawImage(src: never, x: number, y: number, w: number, h: number): void;
    getImageData(x: number, y: number, w: number, h: number): Frame;
  } | null;
}

async function createPlatformDetector(ctor: BarcodeDetectorCtorLike | undefined): Promise<BarcodeDetectorLike | null> {
  if (ctor === undefined) return null;
  try {
    if (typeof ctor.getSupportedFormats === 'function' && !(await ctor.getSupportedFormats()).includes('qr_code')) return null;
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/** Reader backed by the platform detector, or null when it is missing or lacks qr_code. */
export async function createPlatformReader(ctor: BarcodeDetectorCtorLike | undefined): Promise<FrameReader | null> {
  const detector = await createPlatformDetector(ctor);
  if (detector === null) return null;
  return {
    async read(video) {
      const found = await detector.detect(video);
      return found[0]?.rawValue ?? null;
    },
  };
}

/** Downscaling canvas grabber; the canvas never leaves memory and is not attached to the page. */
export function createCanvasGrabber(makeCanvas: () => Canvas2dLike, maxDim = 800): FrameGrabber {
  let canvas: Canvas2dLike | null = null;
  return {
    grab(video) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!(vw > 0 && vh > 0)) return null;
      const scale = Math.min(1, maxDim / Math.max(vw, vh));
      const w = Math.max(1, Math.round(vw * scale));
      const h = Math.max(1, Math.round(vh * scale));
      canvas ??= makeCanvas();
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) throw new QrExchangeError('SCAN_FAILED');
      ctx.drawImage(video as never, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h);
    },
  };
}

/** Combines a grabber and a decoder into a reader. */
export function createDecoderReader(grabber: FrameGrabber, decoder: QrFrameDecoder): FrameReader {
  return {
    read(video) {
      const frame = grabber.grab(video);
      return Promise.resolve(frame === null ? null : decoder.decode(frame));
    },
  };
}

/** jsQR 1.4.0 (Apache-2.0, pure computation) loaded on demand so bundlers can split it out. */
export async function loadJsQrDecoder(): Promise<QrFrameDecoder> {
  const mod = await import('jsqr');
  const jsQR = mod.default;
  return {
    decode(frame) {
      const r = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
      return r === null ? null : r.data;
    },
  };
}

interface DefaultEnv {
  readonly BarcodeDetector?: BarcodeDetectorCtorLike;
  readonly document?: { createElement(tag: 'canvas'): unknown };
}

/** BarcodeDetector when the platform has it, otherwise canvas + jsQR. */
export async function createDefaultReader(env: DefaultEnv = globalThis): Promise<FrameReader> {
  const platform = await createPlatformReader(env.BarcodeDetector);
  if (platform !== null) return platform;
  const doc = env.document;
  if (doc === undefined) throw new QrExchangeError('SCAN_FAILED');
  return createDecoderReader(createCanvasGrabber(() => doc.createElement('canvas') as Canvas2dLike), await loadJsQrDecoder());
}

/** Largest image file accepted by decodeQrImage (checked before anything is decoded). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Longest side, in pixels, an image is downscaled to before QR decoding. */
export const MAX_IMAGE_DIM = 1600;
/** Decoded bitmaps above this many pixels are refused (a small compressed file can expand enormously). */
export const MAX_IMAGE_PIXELS = 40_000_000;

/** A File or Blob: only `size` and `type` are read here; the bytes go to the platform image decoder. */
export interface ImageFileLike {
  readonly size: number;
  readonly type: string;
}
export interface ImageBitmapLike {
  readonly width: number;
  readonly height: number;
  close(): void;
}
export interface DecodeImageEnv {
  readonly createImageBitmap?: (source: never) => Promise<ImageBitmapLike>;
  readonly BarcodeDetector?: BarcodeDetectorCtorLike;
  readonly document?: { createElement(tag: 'canvas'): unknown };
}
export interface DecodeImageOptions {
  readonly signal?: AbortSignal | undefined;
  /** Default MAX_IMAGE_BYTES; may only be lowered in practice by callers with tighter budgets. */
  readonly maxBytes?: number;
  /** Default MAX_IMAGE_DIM. */
  readonly maxDim?: number;
  /** Injected for tests; defaults to globalThis. */
  readonly env?: DecodeImageEnv;
  /** Injected for tests; defaults to the lazily loaded jsQR decoder. */
  readonly decoder?: QrFrameDecoder;
}

// Raster types only: SVG is refused (it is a document, not pixels, and QR screenshots are never SVG).
const IMAGE_MIME_RE = /^image\/[a-z0-9][a-z0-9.+-]*$/;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new QrExchangeError('ABORTED');
}

function boundedText(text: string | null | undefined): string | null {
  return typeof text === 'string' && text.length > 0 && text.length <= MAX_SCAN_TEXT_LEN ? text : null;
}

/**
 * Reads one QR code from an image file entirely on this device: the platform decodes the file into a bitmap
 * (createImageBitmap, no object URL, nothing uploaded), then BarcodeDetector or a downscaled canvas + jsQR reads it.
 * Limits are enforced before decoding (MIME, MAX_IMAGE_BYTES) and after (MAX_IMAGE_PIXELS, downscale to maxDim).
 * Resolves the text, or null when no QR was found. Throws BAD_INPUT (not a raster image), TOO_LARGE, SCAN_FAILED
 * (image could not be decoded) or ABORTED. The bitmap is closed and the canvas emptied in every case; image data
 * and decoded text are never logged.
 */
export async function decodeQrImage(source: ImageFileLike, options: DecodeImageOptions = {}): Promise<string | null> {
  const { signal } = options;
  const type = typeof source === 'object' && source !== null && typeof source.type === 'string' ? source.type.toLowerCase() : '';
  if (!IMAGE_MIME_RE.test(type) || type === 'image/svg+xml') throw new QrExchangeError('BAD_INPUT');
  const size = source.size;
  if (!Number.isSafeInteger(size) || size <= 0) throw new QrExchangeError('BAD_INPUT');
  if (size > (options.maxBytes ?? MAX_IMAGE_BYTES)) throw new QrExchangeError('TOO_LARGE');
  throwIfAborted(signal);
  const env: DecodeImageEnv = options.env ?? globalThis;
  if (typeof env.createImageBitmap !== 'function') throw new QrExchangeError('SCAN_FAILED');
  let bitmap: ImageBitmapLike;
  try {
    bitmap = await env.createImageBitmap(source as never);
  } catch {
    throw new QrExchangeError('SCAN_FAILED');
  }
  let canvas: Canvas2dLike | null = null;
  try {
    throwIfAborted(signal);
    const { width, height } = bitmap;
    if (!(width > 0 && height > 0)) throw new QrExchangeError('SCAN_FAILED');
    if (width * height > MAX_IMAGE_PIXELS) throw new QrExchangeError('TOO_LARGE');
    const detector = await createPlatformDetector(env.BarcodeDetector);
    if (detector !== null) {
      let found: readonly { readonly rawValue: string }[] = [];
      try {
        found = await detector.detect(bitmap);
      } catch {
        /* fall back to jsQR below */
      }
      throwIfAborted(signal);
      const raw = found[0]?.rawValue;
      if (raw !== undefined) return boundedText(raw);
    }
    const doc = env.document;
    if (doc === undefined) throw new QrExchangeError('SCAN_FAILED');
    const scale = Math.min(1, (options.maxDim ?? MAX_IMAGE_DIM) / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    canvas = doc.createElement('canvas') as Canvas2dLike;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new QrExchangeError('SCAN_FAILED');
    ctx.drawImage(bitmap as never, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    const decoder = options.decoder ?? (await loadJsQrDecoder());
    throwIfAborted(signal);
    return boundedText(decoder.decode(frame));
  } finally {
    if (canvas !== null) {
      canvas.width = 0;
      canvas.height = 0;
    }
    try {
      bitmap.close();
    } catch {
      /* already released */
    }
  }
}
