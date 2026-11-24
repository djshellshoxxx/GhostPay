import { describe, expect, it } from 'vitest';
import upstreamJsQr from 'jsqr';
import { qrMatrix, type QrMatrix } from './generate.js';
import { loadJsQrDecoder, type Frame } from './readers.js';

/** Match crisp SVG edge rounding, including a four-module quiet zone and two-pixel border. */
function raster(matrix: QrMatrix, scale: number): Frame {
  const width = Math.ceil((matrix.size + 8) * scale) + 4;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.dark[row * matrix.size + col]) continue;
      for (let y = 2 + Math.round((row + 4) * scale); y < 2 + Math.round((row + 5) * scale); y++) {
        for (let x = 2 + Math.round((col + 4) * scale); x < 2 + Math.round((col + 5) * scale); x++) {
          const offset = (y * width + x) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

/** Reproducible public test text; this is not an invoice or key material. */
function densePayload(length: number): string {
  let seed = 581;
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  return 'https://ghostpay.test/#gpi=v1.' + Array.from({ length }, () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return alphabet[seed >>> 26];
  }).join('');
}

describe('software decoding of dense generated QR images', () => {
  it('decodes version 23 with the standard alignment-pattern positions', async () => {
    const text = 'https://ghostpay.test/#gpi=v1.' + 'a'.repeat(1000);
    const matrix = qrMatrix(text);
    expect(matrix.version).toBe(23);
    const frame = raster(matrix, 6);
    expect(upstreamJsQr(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })).toBeNull();
    expect((await loadJsQrDecoder()).decode(frame)).toBe(text);
  });

  it('recovers a version-25 image whose fractional edges produce an invalid dimension estimate', async () => {
    const text = densePayload(1184);
    const matrix = qrMatrix(text);
    expect(matrix.version).toBe(25);
    const frame = raster(matrix, 5.6);
    expect(frame.width).toBe(704);
    expect(upstreamJsQr(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })).toBeNull();
    expect((await loadJsQrDecoder()).decode(frame)).toBe(text);
  });

  it.each([
    ['small', 'ordinary public QR', 2],
    ['version 22', 'x'.repeat(975), 4],
    ['version 24', 'x'.repeat(1100), 4],
    ['version 25 at integer scale', densePayload(1184), 6],
  ] as const)('preserves the existing decoder result for %s', async (_label, text, scale) => {
    const frame = raster(qrMatrix(text), scale);
    expect(upstreamJsQr(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data).toBe(text);
    expect((await loadJsQrDecoder()).decode(frame)).toBe(text);
  });

  it('does not turn damaged dense image data into a decoded payload', async () => {
    const frame = raster(qrMatrix(densePayload(1184)), 5.6);
    for (let y = Math.floor(frame.height / 4); y < Math.ceil(3 * frame.height / 4); y++) {
      frame.data.fill(255, y * frame.width * 4, (y + 1) * frame.width * 4);
    }
    expect((await loadJsQrDecoder()).decode(frame)).toBeNull();
  });
});
