import { describe, expect, it } from 'vitest';
import { qrSvgPath } from './generate.js';

const matrix = (dark: boolean[]) => ({ size: 21, version: 1, dark });

describe('qrSvgPath rejects missing modules', () => {
  it.each([0, 220, 440])('rejects a missing cell at index %i', (index) => {
    const dark = Array<boolean>(441).fill(false);
    delete dark[index];
    expect(() => qrSvgPath(matrix(dark))).toThrowError(expect.objectContaining({ code: 'BAD_INPUT' }));
  });

  it('rejects an entirely sparse matrix', () => {
    expect(() => qrSvgPath(matrix(Array<boolean>(441)))).toThrowError(
      expect.objectContaining({ code: 'BAD_INPUT' }),
    );
  });

  it('still rejects explicit undefined, nonboolean values and invalid dimensions', () => {
    const bad = [
      [...Array<boolean>(440).fill(false), undefined],
      [...Array<boolean>(440).fill(false), 1],
      Array<boolean>(440).fill(false),
    ];
    for (const dark of bad) {
      expect(() => qrSvgPath(matrix(dark as boolean[]))).toThrowError(
        expect.objectContaining({ code: 'BAD_INPUT' }),
      );
    }
    expect(() => qrSvgPath({ ...matrix(Array<boolean>(441).fill(false)), version: 2 })).toThrowError(
      expect.objectContaining({ code: 'BAD_INPUT' }),
    );
  });

  it('preserves dense light cells and the coordinates of dark corner cells', () => {
    const dark = Array<boolean>(441).fill(false);
    expect(qrSvgPath(matrix(dark))).toBe('');
    dark[0] = true;
    dark[440] = true;
    expect(qrSvgPath(matrix(dark))).toBe('M4 4h1v1h-1zM24 24h1v1h-1z');
  });
});
