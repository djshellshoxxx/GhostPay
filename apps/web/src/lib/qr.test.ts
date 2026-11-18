import { loadJsQrDecoder } from '@ghostpay/qr-exchange';
import qrcode from 'qrcode-generator';
import { describe, expect, it, vi } from 'vitest';
import { makeQr, qrPath, qrSvgText, qrViewSize, type QrMatrix } from './qr';

/** Decode actual rasterized modules, including a quiet zone, with the camera's independent reader. */
async function readQr(matrix: QrMatrix): Promise<string | null> {
  const scale = 4;
  const side = (matrix.size + 8) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const row = Math.floor(y / scale) - 4;
      const column = Math.floor(x / scale) - 4;
      if (row >= 0 && column >= 0 && row < matrix.size && column < matrix.size && matrix.dark[row * matrix.size + column]) {
        const offset = (y * side + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
      }
    }
  }
  return (await loadJsQrDecoder()).decode({ data, width: side, height: side });
}

describe('qr', () => {
  it('builds a square matrix and a path from it', () => {
    const m = makeQr('https://app.test/#gpi=v1.abc');
    expect(m.dark).toHaveLength(m.size * m.size);
    expect(m.size).toBeGreaterThanOrEqual(21);
    // Finder pattern corner module is always dark.
    expect(m.dark[0]).toBe(true);
    const path = qrPath(m);
    expect(path.startsWith('M4 4h1v1h-1z')).toBe(true);
    expect(qrViewSize(m)).toBe(m.size + 8);
  });
  it('is deterministic', () => {
    expect(makeQr('same').dark).toEqual(makeQr('same').dark);
    expect(makeQr('same').dark).not.toEqual(makeQr('different text').dark);
  });
  it.each(['Café', '日本語の領収書', 'إيصال الدفع', 'Receipt 🧾'])('round-trips exact UTF-8 text: %s', async (text) => {
    expect(await readQr(makeQr(text))).toBe(text);
  });
  it('rejects over-capacity text before invoking the QR encoder', () => {
    const encode = vi.spyOn(qrcode, 'stringToBytes');
    try {
      expect(() => makeQr('x'.repeat(100_000))).toThrow(/too long for a QR/);
      expect(() => makeQr('日'.repeat(1000))).toThrow(/too long for a QR/);
      expect(encode).not.toHaveBeenCalled();
    } finally {
      encode.mockRestore();
    }
  });
  it.each(['broken\uD800', '\uDFFFtail'])('rejects malformed Unicode rather than changing its bytes', (text) => {
    expect(() => makeQr(text)).toThrow(/invalid Unicode/);
  });
  it('produces standalone SVG text with only numbers and a fixed path', () => {
    const svg = qrSvgText(makeQr('hello'));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).not.toMatch(/script|onload|href/i);
  });
  it('rejects malformed matrices instead of producing misleading SVG output', () => {
    expect(() => qrSvgText({ size: 2, dark: [true] })).toThrow(/Invalid QR matrix/);
    expect(() => qrPath({ size: -1, dark: [] })).toThrow(/Invalid QR matrix/);
    expect(() => qrSvgText({ size: 178, dark: [] })).toThrow(/Invalid QR matrix/);
    expect(() => qrPath({ size: 1, dark: [1 as unknown as boolean] })).toThrow(/Invalid QR matrix/);
  });
  it('fails clearly when the text is too long for a QR code', () => {
    expect(() => makeQr('x'.repeat(5000))).toThrow(/too long for a QR/);
  });
});
