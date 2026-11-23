import { describe, expect, it } from 'vitest';
import { safeText } from './displayText';

describe('safeText rendered-output bounds', () => {
  it('bounds repeated invisible-codepoint escape expansion without cutting a visible marker', () => {
    const result = safeText('\u200B'.repeat(4096));
    expect(result.flagged).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(4096);
    expect(result.text).toMatch(/^(?:⟦U\+200B⟧)+$/u);
  });

  it('bounds repeated mixed-script markers after the input-length check', () => {
    const result = safeText('aа '.repeat(1365));
    expect(result.flagged).toBe(true);
    expect(result.text).toContain('⚠aа');
    expect(result.text.length).toBeLessThanOrEqual(4096);
  });

  it('does not split a UTF-16 surrogate pair when a mixed-script marker uses the last output unit', () => {
    const result = safeText('aа ' + 'x'.repeat(4091) + '🚀');
    expect(result.flagged).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(4096);
    expect(result.text).not.toMatch(/\p{Cs}/u);
  });

  it('preserves short ordinary, newline, and hostile-marker semantics', () => {
    expect(safeText('cafe\u0301')).toEqual({ text: 'café', flagged: false });
    expect(safeText('line 1\nline 2\tend')).toEqual({ text: 'line 1\nline 2\tend', flagged: true });
    expect(safeText('A\u200BB')).toEqual({ text: 'A⟦U+200B⟧B', flagged: true });
    expect(safeText('aа test')).toEqual({ text: '⚠aа test', flagged: true });
  });
});
