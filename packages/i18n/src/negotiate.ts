import { parseLocale, isValidLocale } from './bcp47.js';
import { I18nError } from './errors.js';

/** Progressively less specific forms of a valid tag: `zh-Hant-TW` -> `[zh-Hant-TW, zh-Hant, zh]` (extensions dropped). */
export function truncations(tag: string): string[] {
  const out: string[] = [];
  const push = (t: string): void => {
    if (!out.includes(t)) out.push(t);
  };
  const p = parseLocale(tag);
  const base = [p.language, p.script, p.region].filter((s): s is string => s !== undefined);
  push([...base, ...p.variants].join('-'));
  push(base.join('-'));
  if (p.script !== undefined) push([p.language, p.script].join('-'));
  push(p.language);
  return out;
}

/**
 * Fallback chain for a locale, most specific first, ending with the default locale's chain.
 * `zh-Hant-TW` with default `en` -> `[zh-Hant-TW, zh-Hant, zh, en]`. Invalid input yields just the default chain.
 */
export function fallbackChain(locale: string, defaultLocale: string): string[] {
  const out = isValidLocale(locale) ? truncations(locale) : [];
  for (const t of truncations(defaultLocale)) if (!out.includes(t)) out.push(t);
  return out;
}

export interface Negotiated {
  readonly locale: string;
  /** exact tag, truncated tag, same language other region, or default. */
  readonly how: 'exact' | 'truncated' | 'language' | 'default';
}

/**
 * Pick the best supported locale for an ordered preference list. Invalid requested tags are ignored.
 * @throws I18nError bad_locale if `defaultLocale` is invalid or not in `supported`.
 */
export function negotiateLocale(
  requested: readonly string[],
  supported: readonly string[],
  defaultLocale: string,
): Negotiated {
  const sup = supported.map((s) => parseLocale(s).tag);
  const def = parseLocale(defaultLocale).tag;
  if (!sup.includes(def)) throw new I18nError('bad_locale', 'default locale is not in the supported list');
  for (const r of requested.slice(0, 32)) {
    if (!isValidLocale(r)) continue;
    const want = parseLocale(r);
    for (const [idx, cand] of truncations(want.tag).entries()) {
      if (sup.includes(cand)) return { locale: cand, how: idx === 0 ? 'exact' : 'truncated' };
    }
    const sameLang = sup.find((s) => parseLocale(s).language === want.language);
    if (sameLang !== undefined) return { locale: sameLang, how: 'language' };
  }
  return { locale: def, how: 'default' };
}

const MAX_HEADER = 1000;
const MAX_ENTRIES = 32;
const Q = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/;

/**
 * Parse an Accept-Language header into tags ordered by q (stable). Wildcards, q=0 and invalid entries are dropped.
 * @security untrusted header: length capped at 1000, 32 entries.
 */
export function parseAcceptLanguage(header: string): string[] {
  if (typeof header !== 'string' || header.length > MAX_HEADER) return [];
  const items: { tag: string; q: number; i: number }[] = [];
  for (const [i, raw] of header.split(',').slice(0, MAX_ENTRIES).entries()) {
    const [tagPart, ...params] = raw.trim().split(';');
    const tag = (tagPart ?? '').trim();
    if (!isValidLocale(tag)) continue;
    let q = 1;
    let okParams = true;
    for (const prm of params) {
      const m = /^\s*q\s*=\s*(\S+)\s*$/i.exec(prm);
      if (m === null || m[1] === undefined || !Q.test(m[1])) {
        okParams = false;
        break;
      }
      q = Number(m[1]);
    }
    if (!okParams || q === 0) continue;
    items.push({ tag: parseLocale(tag).tag, q, i });
  }
  items.sort((a, b) => b.q - a.q || a.i - b.i);
  return items.map((x) => x.tag);
}
