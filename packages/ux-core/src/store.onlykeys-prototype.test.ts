import { describe, expect, it } from 'vitest';
import { hasOnlyKeys } from './store.js';

describe('hasOnlyKeys requires a plain record', () => {
  it('rejects non-record objects even when they have no enumerable own keys', () => {
    expect(hasOnlyKeys(new Date(0), [])).toBe(false);
    expect(hasOnlyKeys(new Map<string, string>([['label', 'Alice']]), ['label'])).toBe(false);
    const inherited = Object.create({ hidden: 'value' }) as Record<string, unknown>;
    expect(hasOnlyKeys(inherited, [])).toBe(false);

    class CustomRecord {
      readonly label = 'Alice';
    }
    expect(hasOnlyKeys(new CustomRecord(), ['label'])).toBe(false);
  });

  it('preserves valid plain records, null-prototype dictionaries and disallowed-key rejection', () => {
    expect(hasOnlyKeys({ label: 'Alice' }, ['label'])).toBe(true);
    expect(hasOnlyKeys({}, [])).toBe(true);
    const dictionary = Object.create(null) as Record<string, unknown>;
    dictionary['label'] = 'Alice';
    expect(hasOnlyKeys(dictionary, ['label'])).toBe(true);
    expect(hasOnlyKeys({ label: 'Alice', extra: true }, ['label'])).toBe(false);
    expect(hasOnlyKeys([], [])).toBe(false);
    expect(hasOnlyKeys(null, [])).toBe(false);
  });
});
