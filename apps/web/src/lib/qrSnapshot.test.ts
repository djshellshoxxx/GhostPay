import { describe, expect, it } from 'vitest';
import { qrSvgText, type QrMatrix } from './qr';

describe('qrSvgText stable matrix boundary', () => {
  it('does not interpolate an unvalidated geometry getter into SVG attributes', () => {
    let reads = 0;
    const matrix = {
      get size() {
        reads++;
        return reads === 1 ? '1" data-untrusted="yes' : 1;
      },
      dark: [true],
    } as unknown as QrMatrix;
    expect(() => qrSvgText(matrix)).toThrow(/Invalid QR matrix/);
  });

  it('reads the matrix size once, not again after validating it', () => {
    let reads = 0;
    const matrix = {
      get size() {
        reads++;
        return reads === 1 ? 1 : 178;
      },
      dark: [true],
    };
    const svg = qrSvgText(matrix);
    expect(reads).toBe(1);
    expect(svg).toContain('viewBox="0 0 9 9"');
    expect(svg).toContain('d="M4 4h1v1h-1z"');
    expect(svg).not.toContain('NaN');
  });

  it('renders from one copied set of module booleans rather than rereading an accessor', () => {
    let moduleReads = 0;
    const dark = new Proxy([true], {
      get(target, key, receiver) {
        if (key === '0') return ++moduleReads === 1;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const svg = qrSvgText({ size: 1, dark });
    expect(moduleReads).toBe(1);
    expect(svg).toContain('d="M4 4h1v1h-1z"');
  });

  it('keeps ordinary SVG geometry and rejects malformed sizes and modules', () => {
    const normal = qrSvgText({ size: 1, dark: [true] });
    expect(normal).toContain('viewBox="0 0 9 9"');
    expect(normal).toContain('width="54" height="54"');
    expect(normal).toContain('d="M4 4h1v1h-1z"');
    expect(() => qrSvgText({ size: 0, dark: [] })).toThrow(/Invalid QR matrix/);
    expect(() => qrSvgText({ size: 1, dark: [2 as unknown as boolean] })).toThrow(/Invalid QR matrix/);
  });
});
