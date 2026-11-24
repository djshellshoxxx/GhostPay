import { describe, expect, it } from 'vitest';
import { safeText } from './displayText';

const MAX = 4096;
const loneMarker = '⟦U+D83D⟧';

describe('safeText combined Unicode and rendered-output boundaries', () => {
  it('omits a valid pair split by the raw-input budget without fabricating an invalid-character marker', () => {
    const prefix = 'x'.repeat(MAX - 1);
    const result = safeText(`${prefix}😀trailing`);
    expect(result).toEqual({ text: prefix, flagged: true });
    expect(result.text).not.toContain(loneMarker);
    expect(result.text.length).toBeLessThanOrEqual(MAX);
  });

  it('retains a complete pair at the last two available raw-input units', () => {
    const prefix = 'x'.repeat(MAX - 2);
    expect(safeText(`${prefix}😀trailing`)).toEqual({ text: `${prefix}😀`, flagged: true });
  });

  it('continues to identify a truly unpaired surrogate when its entire visible marker fits', () => {
    const prefix = 'x'.repeat(MAX - loneMarker.length);
    const result = safeText(`${prefix}\uD83Dtrailing`);
    expect(result).toEqual({ text: `${prefix}${loneMarker}`, flagged: true });
    expect(result.text.length).toBe(MAX);
  });

  it('never outputs a partial hostile marker when a genuine unpaired surrogate is too close to the cap', () => {
    const prefix = 'x'.repeat(MAX - 1);
    const result = safeText(`${prefix}\uD83Dtrailing`);
    expect(result).toEqual({ text: prefix, flagged: true });
  });

  it('retains the marker expansion cap for repeated invisible codepoints', () => {
    const result = safeText('\u200B'.repeat(MAX));
    expect(result.flagged).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX);
    expect(result.text).toMatch(/^(?:⟦U\+200B⟧)+$/u);
  });

  it('does not flag unmodified text exactly at the cap', () => {
    const prefix = 'x'.repeat(MAX);
    expect(safeText(prefix)).toEqual({ text: prefix, flagged: false });
  });
});
