import { describe, expect, it } from 'vitest';
import { parseNlAmount, separatorsForLocale } from './nlamount.js';

describe('locale separator snapshots', () => {
  it('does not let edits to one returned descriptor alter later amount parsing', () => {
    const exposed = separatorsForLocale('en');
    if (exposed === null) throw new Error('expected English separators');
    const original = { ...exposed };
    try {
      exposed.decimal = ',';
      exposed.groups = '.';
      const assets = [{ symbol: 'USDC', decimals: 6 }];
      for (const locale of ['en', 'en-US', 'en-AU', 'ja']) {
        expect(separatorsForLocale(locale)).toEqual(original);
        expect(parseNlAmount('1,234 usdc', { assets, locale })).toMatchObject({
          ok: true,
          value: { amount: 1_234_000_000n, normalized: '1234' },
        });
      }
    } finally {
      Object.assign(exposed, original);
    }
  });

  it('preserves exact and fallback locales and unknown-tag rejection', () => {
    expect(separatorsForLocale('de-AT')).toEqual({ decimal: ',', groups: '.' });
    expect(separatorsForLocale('de_CH')).toEqual({ decimal: '.', groups: "'\u2019" });
    expect(separatorsForLocale('xx')).toBeNull();
    expect(separatorsForLocale('')).toBeNull();
  });
});
