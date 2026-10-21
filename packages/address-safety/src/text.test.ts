import { describe, expect, it } from 'vitest';
import { isReason, reject } from './errors.js';
import { MIXED_SCRIPT_MARKER, sanitizeDisplayText } from './text.js';

describe('sanitizeDisplayText rejections (S3-12)', () => {
  it.each([
    ['U+202E RLO', 'pay‮fdp.exe', 'bidi_control'],
    ['U+2066 LRI', 'a⁦b', 'bidi_control'],
    ['U+200E LRM', 'a‎b', 'bidi_control'],
    ['U+200B ZWSP', 'a​b', 'default_ignorable'],
    ['U+200D ZWJ', 'a‍b', 'default_ignorable'],
    ['U+00AD soft hyphen', 'a­b', 'default_ignorable'],
    ['U+E0041 tag A', 'a\u{E0041}b', 'tag_character'],
    ['U+E000 private use', 'ab', 'private_use'],
    ['U+000A newline', 'a\nb', 'control_character'],
    ['lone high surrogate', 'a\uD800b', 'unpaired_surrogate'],
    ['lone low surrogate', 'a\uDC00', 'unpaired_surrogate'],
  ])('rejects %s', (_n, s, reason) => {
    expect(sanitizeDisplayText(s)).toEqual(reject(reason as 'bidi_control'));
  });

  it('rejects non-strings and over-long text', () => {
    expect(sanitizeDisplayText(1 as unknown as string)).toEqual(reject('not_a_string'));
    expect(sanitizeDisplayText('a'.repeat(4097))).toEqual(reject('too_long'));
  });
});

describe('sanitizeDisplayText acceptance and marking', () => {
  it('passes plain text and normalises to NFC', () => {
    expect(sanitizeDisplayText('café ok')).toEqual({
      ok: true,
      text: 'café ok',
      replaced: 0,
      mixedScript: false,
    });
  });

  it('accepts astral characters (valid surrogate pairs)', () => {
    expect(isReason(sanitizeDisplayText('a \u{1F600} b'))).toBe(false);
  });

  it('marks Latin + Cyrillic а tokens', () => {
    const r = sanitizeDisplayText('pаypal ok');
    expect(r).toEqual({
      ok: true,
      text: `${MIXED_SCRIPT_MARKER}pаypal ok`,
      replaced: 1,
      mixedScript: true,
    });
  });

  it('marks Latin + Greek tokens, counts each token', () => {
    const r = sanitizeDisplayText('bοb xοx fine');
    expect(r).toMatchObject({ replaced: 2, mixedScript: true });
  });

  it('does not flag pure Cyrillic or pure Greek words', () => {
    expect(sanitizeDisplayText('привет καλη')).toMatchObject({ replaced: 0 });
  });

  it('allowZwjEmoji permits joiners between visible characters only', () => {
    const family = '\u{1F468}‍\u{1F469}️';
    expect(isReason(sanitizeDisplayText(family))).toBe(true);
    expect(isReason(sanitizeDisplayText(family, { allowZwjEmoji: true }))).toBe(false);
    expect(sanitizeDisplayText('‍x', { allowZwjEmoji: true })).toEqual(reject('default_ignorable'));
    expect(sanitizeDisplayText('x‍', { allowZwjEmoji: true })).toEqual(reject('default_ignorable'));
    expect(sanitizeDisplayText('x ‍ y', { allowZwjEmoji: true })).toEqual(reject('default_ignorable'));
    expect(sanitizeDisplayText('x‍ ', { allowZwjEmoji: true })).toEqual(reject('default_ignorable'));
  });

  it('allowZwjEmoji still rejects other invisibles and bidi', () => {
    expect(sanitizeDisplayText('a​b', { allowZwjEmoji: true })).toEqual(reject('default_ignorable'));
    expect(sanitizeDisplayText('a‮b', { allowZwjEmoji: true })).toEqual(reject('bidi_control'));
  });

  it('is linear time on long adversarial input', () => {
    const inputs = [
      'a'.repeat(4096),
      'а'.repeat(2048) + 'a'.repeat(2048),
      ' a'.repeat(2048),
      '\u{1F600}'.repeat(2048),
    ];
    const t0 = performance.now();
    for (const s of inputs) sanitizeDisplayText(s);
    sanitizeDisplayText('a'.repeat(1_000_000));
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
