import { describe, expect, it } from 'vitest';
import { estimateReadingLevel } from './readability.js';

describe('estimateReadingLevel sentence counting', () => {
  it('counts terminator runs followed by whitespace or end (semantics preserved)', () => {
    expect(estimateReadingLevel('One. Two!! Three?!').sentences).toBe(3);
    expect(estimateReadingLevel('No terminator').sentences).toBe(1);
    expect(estimateReadingLevel('a.b c').sentences).toBe(1);
    expect(estimateReadingLevel('Hi... there').sentences).toBe(1);
  });

  it('is linear on a long punctuation run not followed by whitespace (polynomial ReDoS)', () => {
    const hostile = `${'!'.repeat(60_000)}x`;
    const t0 = performance.now();
    estimateReadingLevel(hostile);
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
