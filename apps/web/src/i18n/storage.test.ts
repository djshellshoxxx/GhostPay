import { describe, expect, it } from 'vitest';
import { AUTO, isValidPreference, loadPreference, LOCALE_STORAGE_KEY, savePreference } from './storage';

function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const throwing = {
  getItem: (): string | null => { throw new Error('blocked'); },
  setItem: (): void => { throw new Error('blocked'); },
  removeItem: (): void => { throw new Error('blocked'); },
};

describe('locale preference storage', () => {
  it('round-trips a language and clears on auto', () => {
    const m = memory();
    expect(loadPreference(false, m)).toBe(AUTO);
    expect(savePreference('ja', m)).toBe(true);
    expect(m.data.get(LOCALE_STORAGE_KEY)).toBe('ja');
    expect(loadPreference(false, m)).toBe('ja');
    expect(savePreference(AUTO, m)).toBe(true);
    expect(loadPreference(false, m)).toBe(AUTO);
  });

  it('ignores unknown values and pseudo-locales unless allowed', () => {
    const m = memory();
    m.data.set(LOCALE_STORAGE_KEY, 'klingon');
    expect(loadPreference(true, m)).toBe(AUTO);
    m.data.set(LOCALE_STORAGE_KEY, 'en-XA');
    expect(loadPreference(false, m)).toBe(AUTO);
    expect(loadPreference(true, m)).toBe('en-XA');
    expect(isValidPreference('zh-Hant', false)).toBe(true);
  });

  it('survives blocked or missing storage', () => {
    expect(loadPreference(false, throwing)).toBe(AUTO);
    expect(savePreference('es', throwing)).toBe(false);
    expect(savePreference('es', undefined)).toBe(false);
    expect(loadPreference(false, undefined)).toBe(AUTO);
  });
});
