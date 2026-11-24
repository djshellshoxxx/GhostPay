import { describe, expect, it } from 'vitest';
import { sanitizeDisplayText } from './sanitize';

describe('generated Unicode markers and mixed-script notices', () => {
  it.each([
    ['αβ\u200Bγ', 'αβ⟨U+200B⟩γ'],
    ['Привет\u202E', 'Привет⟨U+202E⟩'],
    ['\u200Bαβ', '⟨U+200B⟩αβ'],
    ['α\uE000β', 'α⟨U+E000⟩β'],
    ['abc\u2028αβ', 'abc⟨U+2028⟩αβ'],
    ['pay\u200Bevil', 'pay⟨U+200B⟩evil'],
  ])('does not count generated marker letters as input letters (%s)', (input, text) => {
    expect(sanitizeDisplayText(input)).toEqual({ text, replaced: 1, mixedScript: false });
  });

  it('still reports genuinely mixed words even with an invisible character', () => {
    expect(sanitizeDisplayText('p\u200Bаypal')).toEqual({
      text: 'p⟨U+200B⟩аypal',
      replaced: 1,
      mixedScript: true,
    });
    expect(sanitizeDisplayText('pаypal').mixedScript).toBe(true);
  });

  it('preserves ordinary and separate-script words', () => {
    expect(sanitizeDisplayText('Привет world')).toEqual({
      text: 'Привет world',
      replaced: 0,
      mixedScript: false,
    });
    expect(sanitizeDisplayText('Café 日本語 😀')).toEqual({
      text: 'Café 日本語 😀',
      replaced: 0,
      mixedScript: false,
    });
  });
});
