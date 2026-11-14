import { I18nError } from './errors.js';

const TAG_RE = /^([A-Za-z]{2,3})(?:-([A-Za-z]{4}))?(?:-([A-Za-z]{2}|[0-9]{3}))?$/;
const MAX_TAG = 35;
const MAX_ACCEPT_HEADER = 1024;
const MAX_REQUESTED = 20;

/** Languages written right-to-left. */
const RTL_LANGS: ReadonlySet<string> = new Set([
  'ar',
  'he',
  'fa',
  'ur',
  'ps',
  'sd',
  'ug',
  'yi',
  'dv',
  'ckb',
  'ks',
]);
/** Scripts written right-to-left. */
const RTL_SCRIPTS: ReadonlySet<string> = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg']);

/** Parsed, canonically-cased locale tag (subset of BCP 47: language[-Script][-REGION]). */
export interface ParsedLocale {
  readonly language: string;
  readonly script?: string;
  readonly region?: string;
  readonly tag: string;
}

/**
 * Parse and canonicalise a locale tag. Returns undefined for anything outside the supported
 * subset (no variants, extensions or private use), so hostile input cannot reach Intl.
 * @security Strict allow-list parse of untrusted input (e.g. Accept-Language, stored prefs).
 */
export function parseLocale(input: unknown): ParsedLocale | undefined {
  if (typeof input !== 'string' || input.length > MAX_TAG) return undefined;
  const m = TAG_RE.exec(input);
  if (m === null) return undefined;
  const language = (m[1] ?? '').toLowerCase();
  const script = m[2] === undefined ? undefined : m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  const region = m[3] === undefined ? undefined : m[3].toUpperCase();
  const tag = [language, script, region].filter((x): x is string => x !== undefined).join('-');
  return {
    language,
    ...(script === undefined ? {} : { script }),
    ...(region === undefined ? {} : { region }),
    tag,
  };
}

/** Canonical tag or throw. */
export function requireLocale(input: unknown): string {
  const p = parseLocale(input);
  if (p === undefined) throw new I18nError('bad-locale', 'invalid locale tag');
  return p.tag;
}

/** True when the locale is written right-to-left. Unknown/invalid tags are LTR. */
export function isRtl(locale: string): boolean {
  const p = parseLocale(locale);
  if (p === undefined) return false;
  if (p.script !== undefined) return RTL_SCRIPTS.has(p.script);
  return RTL_LANGS.has(p.language);
}

/** Value for the `dir` attribute. */
export function textDirection(locale: string): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/**
 * Fallback chain, most specific first: `pt-BR` -> [`pt-BR`, `pt`, ...defaults].
 * Duplicates removed; invalid defaults ignored.
 */
export function fallbackChain(locale: string, defaults: readonly string[] = ['en']): string[] {
  const out: string[] = [];
  const push = (t: string): void => {
    if (!out.includes(t)) out.push(t);
  };
  const p = parseLocale(locale);
  if (p !== undefined) {
    push(p.tag);
    if (p.script !== undefined && p.region !== undefined) push(`${p.language}-${p.script}`);
    if (p.region !== undefined && p.script === undefined) push(p.language);
    if (p.script !== undefined) push(p.language);
  }
  for (const d of defaults) {
    const dp = parseLocale(d);
    if (dp === undefined) continue;
    push(dp.tag);
    if (dp.tag !== dp.language) push(dp.language);
  }
  return out;
}

/** Result of {@link negotiateLocale}. */
export interface NegotiatedLocale {
  readonly locale: string;
  readonly matchedBy: 'exact' | 'language' | 'sibling' | 'default';
}

/**
 * Pick the best supported locale for the user's ordered preferences.
 * Order of attempts per preference: exact tag, bare language, any supported tag of same language.
 * Invalid preferences are skipped. Never throws.
 */
export function negotiateLocale(
  requested: readonly string[],
  supported: readonly string[],
  defaultLocale: string,
): NegotiatedLocale {
  const sup = supported.map(parseLocale).filter((x): x is ParsedLocale => x !== undefined);
  for (const r of requested.slice(0, MAX_REQUESTED)) {
    const p = parseLocale(r);
    if (p === undefined) continue;
    const exact = sup.find((s) => s.tag === p.tag);
    if (exact !== undefined) return { locale: exact.tag, matchedBy: 'exact' };
    const lang = sup.find((s) => s.tag === p.language);
    if (lang !== undefined) return { locale: lang.tag, matchedBy: 'language' };
    const sib = sup.find((s) => s.language === p.language);
    if (sib !== undefined) return { locale: sib.tag, matchedBy: 'sibling' };
  }
  return { locale: parseLocale(defaultLocale)?.tag ?? 'en', matchedBy: 'default' };
}

/**
 * Parse an Accept-Language header into tags ordered by q (stable). Wildcards, q=0 and
 * invalid entries are dropped. Header longer than 1 KiB is rejected (returns []).
 * @security Untrusted input; bounded and allow-list validated.
 */
export function parseAcceptLanguage(header: string): string[] {
  if (typeof header !== 'string' || header.length > MAX_ACCEPT_HEADER) return [];
  const items: { tag: string; q: number; i: number }[] = [];
  header.split(',').forEach((part, i) => {
    const [rawTag, ...params] = part.trim().split(';');
    const parsed = parseLocale((rawTag ?? '').trim());
    if (parsed === undefined) return;
    let q = 1;
    for (const prm of params) {
      const m = /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.exec(prm);
      if (m !== null) q = Number(m[1]);
      else if (/^\s*q\s*=/.test(prm)) q = 0;
    }
    if (q > 0) items.push({ tag: parsed.tag, q, i });
  });
  items.sort((a, b) => b.q - a.q || a.i - b.i);
  const out: string[] = [];
  for (const it of items) if (!out.includes(it.tag)) out.push(it.tag);
  return out.slice(0, MAX_REQUESTED);
}
