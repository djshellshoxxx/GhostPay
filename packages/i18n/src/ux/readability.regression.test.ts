import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { estimateReadingLevel } from './readability.js';

describe('sentence boundary scanning', () => {
  it.each([
    ['', 1],
    ['One... Two?! Three!', 3],
    ['One!two?three.end', 1],
    ['One.\nTwo?\r\nThree!\u00a0Four.\u2028', 4],
    ['...!?. ', 1],
  ])('preserves sentence counts for %j', (text, sentences) => {
    expect(estimateReadingLevel(text).sentences).toBe(sentences);
  });

  it('matches the original sentence-count semantics over seeded bounded inputs', () => {
    const input = fc.array(fc.constantFrom('a', 'Z', '.', '!', '?', ' ', '\t', '\n', '\r', '\u00a0', '\u2028', '\u200b'), { maxLength: 120 }).map((chars) => chars.join(''));
    fc.assert(fc.property(input, (text) => {
      // Bounded reference input keeps the historical pattern safe in this oracle.
      const expected = Math.max(1, (text.match(/[.!?]+(?:\s|$)/g) ?? []).length);
      expect(estimateReadingLevel(text).sentences).toBe(expected);
    }), { seed: 20261116, numRuns: 1000 });
  });

  it('processes a long punctuation run without quadratic backtracking', () => {
    const text = `First. ${'!'.repeat(60_000)}x Last.`;
    const start = performance.now();
    expect(estimateReadingLevel(text).sentences).toBe(2);
    // Linear scanning takes milliseconds; the historical pattern takes seconds.
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
