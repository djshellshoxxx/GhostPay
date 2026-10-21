/** Reading-level estimate. */
export interface ReadingLevel {
  readonly words: number;
  readonly sentences: number;
  /** Flesch-Kincaid grade estimate (US school grade), clamped to >= 0, 1 decimal. */
  readonly grade: number;
  readonly band: 'plain' | 'standard' | 'advanced';
}

/** Heuristic English syllable count (>= 1 for any word). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w === '') return 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (/[^aeiouyl]e$/.test(w) || /[aeiouy]es$/.test(w) || /[^aeiouytd]ed$/.test(w)) n -= 1;
  return Math.max(1, n);
}

/**
 * Estimate English reading level (Flesch-Kincaid). A hint for writers and reviewers, not a
 * guarantee: heuristic syllables, English only. Bands: plain <= 8, standard <= 11, advanced.
 */
export function estimateReadingLevel(text: string): ReadingLevel {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const sentences = Math.max(1, (text.match(/[.!?]+(?:\s|$)/g) ?? []).length);
  if (words.length === 0) return { words: 0, sentences, grade: 0, band: 'plain' };
  const syl = words.reduce((a, w) => a + countSyllables(w), 0);
  const raw = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  const grade = Math.max(0, Math.round(raw * 10) / 10);
  return {
    words: words.length,
    sentences,
    grade,
    band: grade <= 8 ? 'plain' : grade <= 11 ? 'standard' : 'advanced',
  };
}
