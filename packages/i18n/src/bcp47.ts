import { I18nError } from './errors.js';

export const MAX_LOCALE_LENGTH = 35;

export interface ParsedLocale {
  /** Canonical-cased tag, e.g. `zh-Hant-TW`. */
  readonly tag: string;
  readonly language: string;
  readonly script: string | undefined;
  readonly region: string | undefined;
  readonly variants: readonly string[];
  /** Extension and private-use subtags, lower-cased, joined (informational only). */
  readonly extensions: string;
}

const ALPHA = /^[A-Za-z]+$/;
const ALNUM = /^[A-Za-z0-9]+$/;
const DIGITS = /^[0-9]+$/;

const bad = (): never => {
  throw new I18nError('bad_locale', 'not a well-formed BCP47 language tag');
};

/**
 * Parse and canonicalise a BCP47 language tag (well-formedness only; the IANA registry is not consulted).
 * Grandfathered tags and extended language subtags are rejected.
 * @security trust boundary: tags come from browsers, headers, URLs. Strict charset, length <= 35.
 */
export function parseLocale(input: string): ParsedLocale {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_LOCALE_LENGTH) return bad();
  if (!/^[A-Za-z0-9-]+$/.test(input)) return bad();
  const parts = input.split('-');
  let i = 0;
  const next = (): string | undefined => parts[i];
  const lang = next() ?? '';
  if (!ALPHA.test(lang) || !((lang.length >= 2 && lang.length <= 3) || (lang.length >= 5 && lang.length <= 8))) {
    return bad();
  }
  i++;
  let script: string | undefined;
  let region: string | undefined;
  const variants: string[] = [];
  let p = next();
  if (p !== undefined && p.length === 4 && ALPHA.test(p)) {
    script = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    i++;
    p = next();
  }
  if (p !== undefined && ((p.length === 2 && ALPHA.test(p)) || (p.length === 3 && DIGITS.test(p)))) {
    region = p.toUpperCase();
    i++;
    p = next();
  }
  while (p !== undefined && p.length > 1 && ALNUM.test(p)) {
    const isVariant = (p.length >= 5 && p.length <= 8) || (p.length === 4 && /^[0-9]/.test(p));
    if (!isVariant) break;
    const v = p.toLowerCase();
    if (variants.includes(v)) return bad();
    variants.push(v);
    i++;
    p = next();
  }
  const ext: string[] = [];
  const seen = new Set<string>();
  while (p !== undefined) {
    if (p.length !== 1 || !ALNUM.test(p)) return bad();
    const singleton = p.toLowerCase();
    if (seen.has(singleton)) return bad();
    seen.add(singleton);
    i++;
    const start = i;
    const isPrivate = singleton === 'x';
    for (;;) {
      const q = next();
      if (q === undefined) break;
      if (!isPrivate && q.length === 1) break; // next singleton
      if (q.length > 8 || !ALNUM.test(q) || (!isPrivate && q.length < 2)) return bad();
      i++;
    }
    if (i === start) return bad();
    ext.push([singleton, ...parts.slice(start, i).map((s) => s.toLowerCase())].join('-'));
    p = next();
  }
  const language = lang.toLowerCase();
  const tag = [language, script, region, ...variants, ...ext].filter((s): s is string => s !== undefined).join('-');
  return { tag, language, script, region, variants, extensions: ext.join('-') };
}

/** Type guard: true iff `input` is a well-formed tag. Never throws. */
export function isValidLocale(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  try {
    parseLocale(input);
    return true;
  } catch {
    return false;
  }
}

/** Canonical casing of a valid tag; throws `bad_locale` otherwise. */
export function canonicalizeLocale(input: string): string {
  return parseLocale(input).tag;
}
