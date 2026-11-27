import { describe, expect, it } from 'vitest';
import { payeeFingerprint, safeText } from './displayText';

describe('safeText (S3-12)', () => {
  it('passes clean text through unchanged', () => {
    expect(safeText('Consulting, March 2026')).toEqual({ text: 'Consulting, March 2026', flagged: false });
    // the schema rejects C0 controls other than a memo line feed; a tab arriving anyway stays readable but flags the text
    expect(safeText('line one\nline two\tend')).toEqual({ text: 'line one\nline two\tend', flagged: true });
  });

  it('treats the line feed a memo may contain as a line break, not as a hostile character', () => {
    expect(safeText('Order 12\nThanks\n\nSee you')).toEqual({ text: 'Order 12\nThanks\n\nSee you', flagged: false });
    // Every other control stays visible and flagged, including a carriage return beside the line feed.
    expect(safeText('Order 12\r\nThanks')).toEqual({ text: 'Order 12⟦U+000D⟧\nThanks', flagged: true });
  });

  it('keeps the mixed-script marker on any line of a multi-line memo, also beside a hostile line', () => {
    expect(safeText('Pay the usual\nраyраl account')).toEqual({ text: 'Pay the usual\n⚠раyраl account', flagged: true });
    expect(safeText('раyраl\nbad\u0007end')).toEqual({ text: '⚠раyраl\nbad⟦U+0007⟧end', flagged: true });
  });

  it('caps multi-line text without splitting a visible marker', () => {
    const long = safeText(`${'x'.repeat(4000)}\n${'‮'.repeat(20)}`);
    expect(long).toEqual({ text: `${'x'.repeat(4000)}\n${'⟦U+202E⟧'.repeat(11)}`, flagged: true });
    // A marker that expands a later line past the cap never leaves half a surrogate pair behind.
    const pair = safeText(`${'x'.repeat(4089)}\nраy \u{1f600}`);
    expect(pair.text).toBe(`${'x'.repeat(4089)}\n⚠раy `);
    expect(pair.flagged).toBe(true);
  });

  it('makes every hostile character visible instead of reordering or hiding text', () => {
    const rlo = safeText('Pay ‮evil‬ total');
    expect(rlo.flagged).toBe(true);
    expect(rlo.text).toContain('⟦U+202E⟧');
    expect(rlo.text).not.toContain('‮');
    const hidden = safeText('a​b⁦c\u{E0041}de\u0007f');
    expect(hidden.text).toBe('a⟦U+200B⟧b⟦U+2066⟧c⟦U+E0041⟧d⟦U+E000⟧e⟦U+0007⟧f');
    expect(hidden.flagged).toBe(true);
  });

  it('flags mixed-script homoglyph tokens with the visible marker', () => {
    const r = safeText('раyраl invoice'); // Cyrillic a/p inside a Latin word
    expect(r.flagged).toBe(true);
    expect(r.text).toContain('⚠');
  });

  it('truncates overlong text and handles lone surrogates', () => {
    const long = safeText('x'.repeat(5000));
    expect(long.text.length).toBeLessThanOrEqual(4096);
    expect(long.flagged).toBe(true);
    expect(safeText('bad\uD800end').text).toContain('⟦U+D800⟧');
  });

  it('fingerprints a meta-address in a stable, grouped form', () => {
    const f = payeeFingerprint('st:eth:0xabc');
    expect(f).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){4}$/);
    expect(payeeFingerprint('st:eth:0xabc')).toBe(f);
    expect(payeeFingerprint('st:eth:0xabd')).not.toBe(f);
  });
});
