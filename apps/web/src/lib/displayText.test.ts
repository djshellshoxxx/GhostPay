import { describe, expect, it } from 'vitest';
import { payeeFingerprint, safeText } from './displayText';

describe('safeText (S3-12)', () => {
  it('passes clean text through unchanged', () => {
    expect(safeText('Consulting, March 2026')).toEqual({ text: 'Consulting, March 2026', flagged: false });
    // the schema already rejects C0 controls; if one arrives anyway, newline and tab stay readable but the text is flagged
    expect(safeText('line one\nline two\tend')).toEqual({ text: 'line one\nline two\tend', flagged: true });
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
