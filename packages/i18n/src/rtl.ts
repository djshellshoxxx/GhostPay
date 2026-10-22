import { parseLocale } from './bcp47.js';

const RTL_SCRIPTS: ReadonlySet<string> = new Set([
  'Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg', 'Mand', 'Samr', 'Mend',
]);
const RTL_LANGS: ReadonlySet<string> = new Set([
  'ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ug', 'ckb', 'syr', 'nqo',
]);
/**
 * True if the locale is written right-to-left. An explicit script subtag wins over the language default
 * (`az-Arab` is RTL, `ar-Latn` is not). Invalid tags are LTR (never throws).
 */
export function isRtl(tag: string): boolean {
  let p;
  try {
    p = parseLocale(tag);
  } catch {
    return false;
  }
  if (p.script !== undefined) return RTL_SCRIPTS.has(p.script);
  return RTL_LANGS.has(p.language);
}

/** Value for the HTML `dir` attribute. */
export function textDirection(tag: string): 'rtl' | 'ltr' {
  return isRtl(tag) ? 'rtl' : 'ltr';
}
