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

/** Reader backed by the platform detector, or null when it is missing or lacks qr_code. */
export async function createPlatformReader(ctor: BarcodeDetectorCtorLike | undefined): Promise<FrameReader | null> {
  if (ctor === undefined) return null;
  try {
    if (typeof ctor.getSupportedFormats === 'function' && !(await ctor.getSupportedFormats()).includes('qr_code')) return null;
    const detector = new ctor({ formats: ['qr_code'] });
    return {
      async read(video) {
        const found = await detector.detect(video);
        return found[0]?.rawValue ?? null;
      },
    };
  } catch {
    return null;
  }
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
export async function createDefaultReader(env: DefaultEnv = globalThis as unknown as DefaultEnv): Promise<FrameReader> {
  const platform = await createPlatformReader(env.BarcodeDetector);
  if (platform !== null) return platform;
  const doc = env.document;
  if (doc === undefined) throw new QrExchangeError('SCAN_FAILED');
  return createDecoderReader(createCanvasGrabber(() => doc.createElement('canvas') as Canvas2dLike), await loadJsQrDecoder());
}
