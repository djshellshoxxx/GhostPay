/**
 * Display sanitiser for text that comes from an invoice (S3-12). The invoice schema accepts bidirectional controls,
 * zero-width and tag characters, which can reorder or hide text in the review screen. This replaces every such code
 * point with a visible `⟨U+XXXX⟩` marker and reports lookalike alphabets. The schema-level fix (reject them at parse time)
 * belongs to `packages/invoice-schema`; this is the defence at the point of display.
 */
const INVISIBLE = /\p{Cf}|\p{Co}|[\u{E0000}-\u{E007F}]|[\u{2028}\u{2029}\u{180E}]/gu;

export interface SafeText {
  readonly text: string;
  /** Number of replaced code points. */
  readonly replaced: number;
  /** A word mixes Latin with Cyrillic or Greek letters. */
  readonly mixedScript: boolean;
}

export function sanitizeDisplayText(input: string): SafeText {
  let replaced = 0;
  const text = input.replace(INVISIBLE, (ch) => {
    replaced++;
    return `⟨U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}⟩`;
  });
  const mixedScript = text.split(/[\s.,;:!?()[\]{}"'/\\|+-]+/u).some((w) => /\p{Script=Latin}/u.test(w) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(w));
  return { text, replaced, mixedScript };
}
