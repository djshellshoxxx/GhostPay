import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  I18nError,
  buildAccessibleName,
  buildLiveRegionMessage,
  contrastRatio,
  parseHexColor,
  rateContrast,
  relativeLuminance,
  validateAriaLabels,
  validateFocusOrder,
} from './index.js';

describe('buildAccessibleName', () => {
  it('joins parts and drops empties', () => {
    expect(buildAccessibleName({ label: 'Send', context: 'Wallet 1', state: 'disabled', hint: ' ' })).toBe(
      'Send, Wallet 1, disabled',
    );
    expect(buildAccessibleName({ label: '  Copy\n address ' })).toBe('Copy address');
  });
  it('strips bidi and controls, caps length', () => {
    expect(buildAccessibleName({ label: 'a‮b\u0000' })).toBe('ab');
    const n = buildAccessibleName({ label: 'x'.repeat(500) });
    expect(n).toHaveLength(160);
    expect(n.endsWith('…')).toBe(true);
  });
  it('requires a label', () => {
    expect(() => buildAccessibleName({ label: ' ', state: 'on' })).toThrow(I18nError);
    expect(() => buildAccessibleName({ label: '' })).toThrow(I18nError);
  });
});

describe('buildLiveRegionMessage', () => {
  it('maps politeness to role', () => {
    expect(buildLiveRegionMessage('Saved')).toEqual({
      role: 'status',
      ariaLive: 'polite',
      ariaAtomic: 'true',
      text: 'Saved',
    });
    expect(buildLiveRegionMessage('Failed', 'assertive').role).toBe('alert');
  });
  it('re-announces repeats by changing text', () => {
    expect(buildLiveRegionMessage('Saved', 'polite', 'Saved').text).toBe('Saved ');
    expect(buildLiveRegionMessage('Saved', 'polite', 'Other').text).toBe('Saved');
  });
  it('rejects empty', () => {
    expect(() => buildLiveRegionMessage('  ​ ')).toThrow(I18nError);
  });
});

describe('contrast', () => {
  it('known WCAG values', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.4778, 3);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.5424, 3);
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.5925, 3);
  });
  it('luminance extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFF')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#0a0a0a')).toBeCloseTo(0.003035, 5);
  });
  it('is symmetric and within 1..21 (property)', () => {
    const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);
    fc.assert(
      fc.property(hex, hex, (a, b) => {
        const r = contrastRatio(a, b);
        return r >= 1 && r <= 21.0000001 && Math.abs(r - contrastRatio(b, a)) < 1e-12;
      }),
    );
  });
  it('rates by target', () => {
    expect(rateContrast('#767676', '#fff').level).toBe('AA');
    expect(rateContrast('#777777', '#fff').level).toBe('fail');
    expect(rateContrast('#777777', '#fff', 'large-text').level).toBe('AA');
    expect(rateContrast('#595959', '#fff').level).toBe('AAA');
    expect(rateContrast('#767676', '#fff', 'large-text').level).toBe('AAA');
    expect(rateContrast('#949494', '#fff', 'ui-component').level).toBe('AA');
    expect(rateContrast('#aaaaaa', '#fff', 'ui-component').level).toBe('fail');
    expect(rateContrast('#000', '#fff', 'ui-component').level).toBe('AA');
  });
  it('rejects bad colors', () => {
    for (const bad of ['red', '#12', '#12345', '#ggg', '#ffffff80', 'rgb(0,0,0)', '']) {
      expect(parseHexColor(bad)).toBeUndefined();
      expect(() => contrastRatio(bad, '#fff')).toThrow(I18nError);
    }
    expect(parseHexColor('#0f8')).toEqual([0, 255, 136]);
  });
});

describe('validateFocusOrder', () => {
  const codes = (r: ReturnType<typeof validateFocusOrder>): string[] => r.map((f) => f.code);
  it('clean list yields nothing', () => {
    expect(
      validateFocusOrder([
        { id: 'a', rect: { x: 0, y: 0 } },
        { id: 'b', rect: { x: 100, y: 2 } },
        { id: 'c', rect: { x: 0, y: 50 } },
      ]),
    ).toEqual([]);
  });
  it('flags duplicates, positive tabindex, hidden, disabled', () => {
    const r = validateFocusOrder([
      { id: 'a', tabIndex: 3 },
      { id: 'a' },
      { id: 'h', hidden: true },
      { id: 'h2', hidden: true, tabIndex: -1 },
      { id: 'd', disabled: true, tabIndex: 0 },
      { id: 'd2', disabled: true },
    ]);
    expect(codes(r)).toEqual(['positive-tabindex', 'duplicate-id', 'hidden-focusable', 'disabled-focusable']);
  });
  it('detects visual mismatch LTR and RTL; ignores unreachable items', () => {
    const items = [
      { id: 'a', rect: { x: 200, y: 0 } },
      { id: 'b', rect: { x: 10, y: 0 } },
    ];
    expect(validateFocusOrder(items)).toEqual([
      expect.objectContaining({ code: 'visual-order-mismatch', id: 'b' }),
    ]);
    expect(validateFocusOrder(items, { rtl: true })).toEqual([]);
    expect(
      validateFocusOrder([
        { id: 'a', rect: { x: 0, y: 100 } },
        { id: 'b', rect: { x: 0, y: 10 } },
      ]).length,
    ).toBe(1);
    expect(
      validateFocusOrder([
        { id: 'a', rect: { x: 0, y: 100 } },
        { id: 'b', hidden: true, tabIndex: -1, rect: { x: 0, y: 10 } },
      ]),
    ).toEqual([]);
    expect(validateFocusOrder([{ id: 'a', rect: { x: 0, y: 100 } }, { id: 'b' }])).toEqual([]);
  });
});

describe('validateAriaLabels', () => {
  const codes = (r: ReturnType<typeof validateAriaLabels>): string[] => r.map((f) => f.code);
  it('passes well-formed nodes', () => {
    expect(
      validateAriaLabels([
        { id: 'h', role: 'heading', name: 'Send' },
        { id: 'b', role: 'button', name: 'Send payment', visibleText: 'Send' },
        { id: 'i', role: 'textbox', labelledBy: ['h'] },
        { id: 'd', role: 'dialog', labelledBy: ['h'], describedBy: ['h'] },
      ]),
    ).toEqual([]);
  });
  it('flags problems', () => {
    const r = validateAriaLabels([
      { id: 'a', role: 'button' },
      { id: 'a', role: 'wat' },
      { id: 'c', role: 'img', labelledBy: ['ghost'], describedBy: ['ghost2'] },
      { id: 'd', role: 'checkbox', name: 'x'.repeat(200) },
      { id: 'e', role: 'button', name: 'Go', focusable: true, ariaHidden: true },
      { id: 'f', role: 'link', name: 'Click here', visibleText: 'Docs' },
    ]);
    expect(codes(r).sort()).toEqual([
      'dangling-describedby',
      'dangling-labelledby',
      'duplicate-id',
      'hidden-focusable',
      'label-in-name',
      'missing-name',
      'missing-name',
      'name-too-long',
      'unknown-role',
    ]);
    expect(r.find((f) => f.code === 'name-too-long')?.severity).toBe('warning');
  });
  it('does not require names for aria-hidden controls or labelledby via visibleText', () => {
    expect(
      validateAriaLabels([
        { id: 'a', role: 'button', ariaHidden: true },
        { id: 'lbl', role: 'none', visibleText: 'Amount' },
        { id: 'in', role: 'spinbutton', labelledBy: ['lbl'] },
      ]),
    ).toEqual([]);
  });
});
