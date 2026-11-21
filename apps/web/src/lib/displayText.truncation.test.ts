import { describe, expect, it } from 'vitest';
import { safeText } from './displayText';

const MAX_TEXT = 4096;

describe('safeText Unicode-safe truncation', () => {
  it('does not invent an unpaired-surrogate warning when truncation splits a valid emoji', () => {
    const prefix = 'x'.repeat(MAX_TEXT - 1);
    const result = safeText(`${prefix}😀trailing`);
    expect(result).toEqual({ text: prefix, flagged: true });
    expect(result.text).not.toContain('⟦U+D83D⟧');
  });

  it('preserves a complete supplementary character at the last two allowed code units', () => {
    const prefix = 'x'.repeat(MAX_TEXT - 2);
    expect(safeText(`${prefix}😀trailing`)).toEqual({ text: `${prefix}😀`, flagged: true });
  });

  it('continues to display a genuine unmatched surrogate as a visible marker', () => {
    const prefix = 'x'.repeat(MAX_TEXT - 1);
    const result = safeText(`${prefix}\uD83Dtrailing`);
    expect(result.flagged).toBe(true);
    expect(result.text).toBe(`${prefix}⟦U+D83D⟧`);
  });

  it('does not flag a clean string exactly at the character budget', () => {
    const prefix = 'x'.repeat(MAX_TEXT);
    expect(safeText(prefix)).toEqual({ text: prefix, flagged: false });
  });
});
