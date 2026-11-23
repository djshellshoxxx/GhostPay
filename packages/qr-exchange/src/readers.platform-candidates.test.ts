import { describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_TEXT_LEN } from './camera.js';
import { decodeQrImage, type DecodeImageEnv } from './readers.js';

const source = { size: 100, type: 'image/png' };

function detectorEnv(values: readonly string[]) {
  const close = vi.fn();
  const createImageBitmap = vi.fn(async () => ({ width: 100, height: 100, close }));
  const env: DecodeImageEnv = {
    createImageBitmap,
    BarcodeDetector: class {
      async detect() {
        return values.map((rawValue) => ({ rawValue }));
      }
    },
  };
  return { env, close, createImageBitmap };
}

describe('decodeQrImage platform multi-result selection', () => {
  it('reads a later valid QR when the first native result has empty text', async () => {
    const s = detectorEnv(['', 'valid-second-qr']);
    expect(await decodeQrImage(source, { env: s.env })).toBe('valid-second-qr');
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('reads a later valid QR when the first native result exceeds the scanner text bound', async () => {
    const s = detectorEnv(['x'.repeat(MAX_SCAN_TEXT_LEN + 1), 'valid-second-qr']);
    expect(await decodeQrImage(source, { env: s.env })).toBe('valid-second-qr');
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('keeps the first usable native result when multiple are valid', async () => {
    const s = detectorEnv(['first-qr', 'second-qr']);
    expect(await decodeQrImage(source, { env: s.env })).toBe('first-qr');
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('preserves a null result when all detected texts are unusable', async () => {
    const s = detectorEnv(['', 'y'.repeat(MAX_SCAN_TEXT_LEN + 1)]);
    expect(await decodeQrImage(source, { env: s.env })).toBeNull();
    expect(s.close).toHaveBeenCalledOnce();
  });
});
