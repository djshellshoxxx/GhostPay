import { describe, expect, it } from 'vitest';
import { parseNlAmount, separatorsForLocale } from './nlamount.js';

const assets = [{ symbol: 'USDC', decimals: 6 }];

function amount(input: string, locale: string): bigint | string {
  const result = parseNlAmount(input, { assets, locale });
  return result.ok ? result.value.amount : result.code;
}

describe('natural-language amount locale prefix', () => {
  it('preserves Swiss decimal interpretation for an accepted regional variant', () => {
    expect(amount('1.234 usdc', 'de-CH-1996')).toBe(1_234_000n);
  });

  it('normalizes multiple accepted underscore separators', () => {
    expect(amount('1.234 usdc', 'de_CH_1996')).toBe(1_234_000n);
  });

  it('preserves Swiss apostrophe grouping in a regional variant', () => {
    expect(amount('1’234.5 usdc', 'de-CH-1901')).toBe(1_234_500_000n);
  });

  it('preserves exact regional and ordinary language fallback', () => {
    expect(amount('1.234 usdc', 'de-CH')).toBe(1_234_000n);
    expect(amount('1.234 usdc', 'de-DE')).toBe(1_234_000_000n);
    expect(amount('1,5 usdc', 'de-AT')).toBe(1_500_000n);
    expect(amount('1.234 usdc', 'en-US')).toBe(1_234_000n);
  });

  it('keeps unknown and unsupported tag syntax rejected', () => {
    expect(separatorsForLocale('xx')).toBeNull();
    expect(separatorsForLocale('de;CH')).toBeNull();
    expect(separatorsForLocale('de-CH-u-nu-latn')).toBeNull();
  });
});
