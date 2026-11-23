import { describe, expect, it } from 'vitest';
import { parseAcceptLanguage } from './negotiate.js';

describe('Accept-Language duplicate quality parameters', () => {
  it('rejects a range that tries to revive q=0 with a second q parameter', () => {
    expect(parseAcceptLanguage('en;q=0;q=1, fr;q=0.5')).toEqual(['fr']);
  });

  it('rejects duplicate q parameters in either order, preserving other ranges', () => {
    expect(parseAcceptLanguage('en;q=1;q=0, fr;q=0.5')).toEqual(['fr']);
    expect(parseAcceptLanguage('en;q=0.9;q=0.8, de, fr;q=0.5')).toEqual(['de', 'fr']);
  });

  it('preserves valid single-q ordering and exclusions', () => {
    expect(parseAcceptLanguage('fr;q=0.5, de;q=1, en;q=0')).toEqual(['de', 'fr']);
    expect(parseAcceptLanguage('en;q=0.8, fr;q=0.8')).toEqual(['en', 'fr']);
  });
});
