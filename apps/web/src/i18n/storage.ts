import { isPseudoLocale, LANGUAGES } from './languages';

export const LOCALE_STORAGE_KEY = 'ghostpay.locale';
export const AUTO = 'auto';

/** A user's language choice: 'auto' (follow the browser) or a registry language code. */
export type LocalePreference = string;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function isValidPreference(value: string, allowPseudo: boolean): boolean {
  if (value === AUTO) return true;
  if (isPseudoLocale(value)) return allowPseudo;
  return LANGUAGES.some((l) => l.code === value);
}

/** Reads the stored choice; any failure (blocked storage, private mode, unknown value) means 'auto'. */
export function loadPreference(allowPseudo: boolean, storage: StorageLike | undefined = defaultStorage()): LocalePreference {
  try {
    const v = storage?.getItem(LOCALE_STORAGE_KEY);
    if (typeof v === 'string' && isValidPreference(v, allowPseudo)) return v;
  } catch {
    // Storage can throw (blocked cookies, private windows). The picker still works for this page view.
  }
  return AUTO;
}

/** Persists the choice. Returns false when storage refused; the choice then applies until the page is closed. */
export function savePreference(value: LocalePreference, storage: StorageLike | undefined = defaultStorage()): boolean {
  try {
    if (storage === undefined) return false;
    if (value === AUTO) storage.removeItem(LOCALE_STORAGE_KEY);
    else storage.setItem(LOCALE_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
