import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvgPath, type QrMatrix } from './generate.js';
import { loadJsQrDecoder } from './readers.js';

/** Read the generated module bitmap using the independently implemented jsQR decoder. */
async function scannedText(matrix: QrMatrix): Promise<string | null> {
  const scale = 5;
  const side = matrix.size + 8;
  const width = side * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.dark[y * matrix.size + x]) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const offset = (((y + 4) * scale + py) * width + (x + 4) * scale + px) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }
  return (await loadJsQrDecoder()).decode({ data, width, height: width });
}

describe('shared QR generator interoperability', () => {
  it.each([
    'invoice-GP1:abc-123',
    'Résumé — 日本語 — مرحبا — Привет — 😀',
    'Emoji graphemes: 👩🏽‍💻 and 🇨🇦',
  ])('preserves exact UTF-8 payloads when scanned: %s', async (text) => {
    for (const ecc of ['L', 'M'] as const) {
      const matrix = qrMatrix(text, ecc);
      expect(matrix.size).toBe(17 + matrix.version * 4);
      expect(await scannedText(matrix)).toBe(text);
    }
  });

  it('does not silently change unpaired UTF-16 surrogates into replacement characters', () => {
    for (const value of ['\uD800', '\uDC00', 'A\uD800B']) {
      expect(() => qrMatrix(value)).toThrowError(expect.objectContaining({ code: 'BAD_INPUT' }));
    }
  });

  it('rejects byte-size overflows before asking the generator to build a matrix', () => {
    expect(() => qrMatrix('x'.repeat(2954), 'L')).toThrowError(expect.objectContaining({ code: 'QR_TOO_LONG' }));
    expect(() => qrMatrix('x'.repeat(2332), 'M')).toThrowError(expect.objectContaining({ code: 'QR_TOO_LONG' }));
    expect(() => qrMatrix('界'.repeat(985), 'L')).toThrowError(expect.objectContaining({ code: 'QR_TOO_LONG' }));
  });

  it('rejects untrusted inconsistent matrix dimensions instead of generating a misleading SVG path', () => {
    const bad = [
      { size: 21, version: 1, dark: [true] },
      { size: 21, version: 2, dark: Array<boolean>(441).fill(false) },
      { size: Infinity, version: 1, dark: [] },
      { size: 21, version: 1, dark: [1, ...Array<boolean>(440).fill(false)] as unknown as boolean[] },
    ];
    for (const matrix of bad) {
      expect(() => qrSvgPath(matrix)).toThrowError(expect.objectContaining({ code: 'BAD_INPUT' }));
    }
  });
});
