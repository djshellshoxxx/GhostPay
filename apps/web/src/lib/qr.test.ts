import { describe, expect, it } from 'vitest';
import { makeQr, qrPath, qrSvgText, qrViewSize } from './qr';

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
