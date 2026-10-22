// Language registry and locale resolution. LEAF module (no relative runtime imports): scripts/i18n/*.mjs load it directly.

export type Direction = 'ltr' | 'rtl';

export interface LanguageInfo {
  /** BCP 47 tag; also the catalog file name (apps/web/locales/<code>.json). */
  readonly code: string;
  /** Name in the language itself. */
  readonly name: string;
  readonly englishName: string;
  readonly dir: Direction;
}

export const SOURCE_LOCALE = 'en';
export const MACHINE_DRAFTED_STATUS = 'machine-drafted: needs native review';
export const SOURCE_STATUS = 'source';
export const REVIEWED_STATUS = 'reviewed';

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', name: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', englishName: 'Spanish', dir: 'ltr' },
  { code: 'fr', name: 'Français', englishName: 'French', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', englishName: 'German', dir: 'ltr' },
  { code: 'pt-BR', name: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', dir: 'ltr' },
  { code: 'it', name: 'Italiano', englishName: 'Italian', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', englishName: 'Dutch', dir: 'ltr' },
  { code: 'pl', name: 'Polski', englishName: 'Polish', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', englishName: 'Turkish', dir: 'ltr' },
  { code: 'ru', name: 'Русский', englishName: 'Russian', dir: 'ltr' },
  { code: 'uk', name: 'Українська', englishName: 'Ukrainian', dir: 'ltr' },
  { code: 'ar', name: 'العربية', englishName: 'Arabic', dir: 'rtl' },
  { code: 'he', name: 'עברית', englishName: 'Hebrew', dir: 'rtl' },
  { code: 'fa', name: 'فارسی', englishName: 'Persian', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', dir: 'ltr' },
  { code: 'bn', name: 'বাংলা', englishName: 'Bengali', dir: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', englishName: 'Indonesian', dir: 'ltr' },
  { code: 'vi', name: 'Tiếng Việt', englishName: 'Vietnamese', dir: 'ltr' },
  { code: 'th', name: 'ไทย', englishName: 'Thai', dir: 'ltr' },
  { code: 'zh-Hans', name: '简体中文', englishName: 'Chinese (Simplified)', dir: 'ltr' },
  { code: 'zh-Hant', name: '繁體中文', englishName: 'Chinese (Traditional)', dir: 'ltr' },
  { code: 'ja', name: '日本語', englishName: 'Japanese', dir: 'ltr' },
  { code: 'ko', name: '한국어', englishName: 'Korean', dir: 'ltr' },
  { code: 'sw', name: 'Kiswahili', englishName: 'Swahili', dir: 'ltr' },
];

/**
 * Locales whose catalog a native speaker has reviewed. Empty today: every non-English catalog is machine-drafted, and
 * the language picker says so. A locale is added here only together with status "reviewed" in its catalog meta
 * (scripts/i18n/check.mjs enforces that the two agree).
 */
export const REVIEWED_LOCALES: ReadonlySet<string> = new Set<string>();

export function isReviewed(code: string): boolean {
  return REVIEWED_LOCALES.has(code);
}

/** Development-only test locales generated from English (see pseudolocalize). Never offered in production builds. */
export const PSEUDO_LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en-XA', name: 'Pseudo (accented, +40 %)', englishName: 'Pseudo-locale (accented)', dir: 'ltr' },
  { code: 'en-XB', name: 'Pseudo (right-to-left)', englishName: 'Pseudo-locale (bidi)', dir: 'rtl' },
];

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'ckb', 'dv']);
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo']);

export function isPseudoLocale(code: string): boolean {
  return PSEUDO_LANGUAGES.some((l) => l.code === code);
}

export function findLanguage(code: string): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.code === code) ?? PSEUDO_LANGUAGES.find((l) => l.code === code);
}

/** Canonical form of a BCP 47 tag, or undefined if it is not a well-formed tag. */
export function normalizeTag(tag: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(tag.trim().replace(/_/g, '-'))[0];
  } catch {
    return undefined;
  }
}

export function directionOf(tag: string): Direction {
  if (tag === 'en-XB') return 'rtl';
  const norm = normalizeTag(tag);
  if (norm === undefined) return 'ltr';
  try {
    const loc = new Intl.Locale(norm);
    if (loc.script !== undefined && RTL_SCRIPTS.has(loc.script)) return 'rtl';
    if (loc.script === undefined && RTL_LANGUAGES.has(loc.language)) return 'rtl';
    return 'ltr';
  } catch {
    return 'ltr';
  }
}

/** Maps any tag to the closest registry language code, or undefined when no language matches (even loosely). */
export function matchSupported(tag: string): string | undefined {
  const norm = normalizeTag(tag);
  if (norm === undefined) return undefined;
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === norm.toLowerCase());
  if (exact !== undefined) return exact.code;
  try {
    const loc = new Intl.Locale(norm);
    if (loc.language === 'zh') {
      const script = loc.script ?? loc.maximize().script;
      return script === 'Hant' ? 'zh-Hant' : 'zh-Hans';
    }
    return LANGUAGES.find((l) => l.code.split('-')[0] === loc.language)?.code;
  } catch {
    return undefined;
  }
}

/** pt-BR -> [pt-BR, pt, en]; pt-PT -> [pt-PT, pt-BR, pt, en]; zh-TW -> [zh-TW, zh-Hant, zh, en]; xx -> [xx, en]. */
export function fallbackChain(tag: string): readonly string[] {
  const norm = normalizeTag(tag);
  const out: string[] = [];
  const add = (t: string | undefined): void => {
    if (t !== undefined && !out.includes(t)) out.push(t);
  };
  if (isPseudoLocale(tag)) {
    add(tag);
    add(SOURCE_LOCALE);
    return out;
  }
  if (norm !== undefined) {
    add(norm);
    const m = matchSupported(norm);
    add(m);
    add((m ?? norm).split('-')[0]);
  }
  add(SOURCE_LOCALE);
  return out;
}

/** First supported language among the user's preferred languages (navigator.languages order), else English. */
export function detectLocale(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const m = matchSupported(tag);
    if (m !== undefined) return m;
  }
  return SOURCE_LOCALE;
}

export function pluralCategories(locale: string, ordinal: boolean): readonly string[] {
  return new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' }).resolvedOptions().pluralCategories;
}
