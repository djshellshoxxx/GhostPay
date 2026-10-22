import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE, hexToRgb, relativeLuminance } from './qrContrast';

describe('qrContrast', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgb('#ffffff'))).toBeCloseTo(1, 5);
  });
  it('rejects bad hex', () => {
    expect(() => hexToRgb('red')).toThrow(/bad hex/);
  });
  it('colour difference is zero for identical colours and symmetric', () => {
    expect(deltaE('#336699', '#336699', 'deuteranopia')).toBeCloseTo(0, 5);
    expect(deltaE('#ff0000', '#00ff00', null)).toBeCloseTo(deltaE('#00ff00', '#ff0000', null), 5);
    expect(deltaE('#ff0000', '#00ff00', 'protanopia')).toBeLessThan(deltaE('#ff0000', '#00ff00', null));
  });
});
