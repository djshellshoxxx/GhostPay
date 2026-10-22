/** Scripts we distinguish for mixed-script detection. Anything else letter-like is `Other`. */
const SCRIPT_TESTS: readonly (readonly [string, RegExp])[] = [
  ['Latin', /^\p{Script=Latin}$/u],
  ['Cyrillic', /^\p{Script=Cyrillic}$/u],
  ['Greek', /^\p{Script=Greek}$/u],
  ['Armenian', /^\p{Script=Armenian}$/u],
  ['Hebrew', /^\p{Script=Hebrew}$/u],
  ['Arabic', /^\p{Script=Arabic}$/u],
  ['Devanagari', /^\p{Script=Devanagari}$/u],
  ['Thai', /^\p{Script=Thai}$/u],
  ['CJK', /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]$/u],
];

/**
 * Returns the set of scripts used by the letters of `s` (marks, digits, punctuation ignored).
 * Han/Kana/Hangul/Bopomofo are merged into `CJK` so legitimate Japanese text is not "mixed".
 *
 * @security Building block for homoglyph defence (Latin `a` vs Cyrillic `а`).
 */
export function scriptsOf(s: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const ch of s) {
    if (!/^\p{L}$/u.test(ch)) continue;
    const hit = SCRIPT_TESTS.find(([, re]) => re.test(ch));
    out.add(hit === undefined ? 'Other' : hit[0]);
  }
  return out;
}

/** True when letters from two or more scripts appear in `s`. */
export function isMixedScript(s: string): boolean {
  return scriptsOf(s).size > 1;
}

/** True for control, format (zero-width, bidi), and line/paragraph separator characters. */
export function hasControlOrInvisible(s: string): boolean {
  return /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s);
}
