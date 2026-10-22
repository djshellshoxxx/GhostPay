import { parseLocale } from './bcp47.js';
import { I18nError } from './errors.js';
import { pluralCategoriesFor } from './format.js';
import type { Catalog } from './i18n.js';
import { argumentNames, parseMessage, pluralCategoriesUsed } from './parse.js';

export interface PlaceholderMismatch {
  readonly key: string;
  readonly expected: readonly string[];
  readonly actual: readonly string[];
}

export interface LocaleReport {
  readonly locale: string;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly placeholderMismatches: readonly PlaceholderMismatch[];
  readonly syntaxErrors: readonly { readonly key: string; readonly code: string }[];
  /** Messages that look like they contain HTML tags (`<x`): output is plain text, so this is almost surely a mistake. */
  readonly htmlLike: readonly string[];
  readonly missingPluralCategories: readonly { readonly key: string; readonly categories: readonly string[] }[];
  readonly translated: number;
  readonly total: number;
  readonly ok: boolean;
}

export interface CompletenessReport {
  readonly base: string;
  readonly ok: boolean;
  readonly locales: readonly LocaleReport[];
}

const HTML_LIKE = /<\s*\/?\s*[A-Za-z!]/;

/**
 * Compare every catalog to the `base` locale. Pure; suitable for CI.
 * Plural category check: each plural in a non-base locale must have every category CLDR defines for that locale
 * (the `other` branch is already enforced by the parser).
 */
export function checkCatalogs(catalogs: Readonly<Record<string, Catalog>>, base: string): CompletenessReport {
  const baseTag = parseLocale(base).tag;
  const canon = new Map<string, Catalog>();
  for (const [l, c] of Object.entries(catalogs)) canon.set(parseLocale(l).tag, c);
  const baseCat = canon.get(baseTag);
  if (baseCat === undefined) throw new I18nError('bad_catalog', 'base locale has no catalog');
  const baseKeys = Object.keys(baseCat).sort();
  const baseArgs = new Map<string, string[]>();
  for (const k of baseKeys) {
    try {
      baseArgs.set(k, argumentNames(parseMessage(baseCat[k] ?? '')));
    } catch {
      /* reported as a syntax error on the base locale below */
    }
  }

  const reports: LocaleReport[] = [];
  for (const [loc, cat] of [...canon.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const keys = Object.keys(cat).sort();
    const missing = baseKeys.filter((k) => !Object.hasOwn(cat, k));
    const extra = keys.filter((k) => !Object.hasOwn(baseCat, k));
    const mism: PlaceholderMismatch[] = [];
    const syn: { key: string; code: string }[] = [];
    const html: string[] = [];
    const plur: { key: string; categories: string[] }[] = [];
    const need = pluralCategoriesFor(loc);
    for (const k of keys) {
      const msg = cat[k] ?? '';
      if (HTML_LIKE.test(msg)) html.push(k);
      try {
        const nodes = parseMessage(msg);
        const exp = baseArgs.get(k);
        const act = argumentNames(nodes);
        if (exp !== undefined && exp.join('\u0000') !== act.join('\u0000')) {
          mism.push({ key: k, expected: exp, actual: act });
        }
        if (loc !== baseTag) {
          const lacking = new Set<string>();
          for (const used of pluralCategoriesUsed(nodes)) for (const c of need) if (!used.includes(c)) lacking.add(c);
          if (lacking.size > 0) plur.push({ key: k, categories: [...lacking].sort() });
        }
      } catch (e) {
        syn.push({ key: k, code: e instanceof I18nError ? e.code : 'syntax' });
      }
    }
    const ok = [missing, extra, mism, syn, html, plur].every((a) => a.length === 0);
    reports.push({
      locale: loc,
      missing,
      extra,
      placeholderMismatches: mism,
      syntaxErrors: syn,
      htmlLike: html,
      missingPluralCategories: plur,
      translated: baseKeys.length - missing.length,
      total: baseKeys.length,
      ok,
    });
  }
  return { base: baseTag, ok: reports.every((r) => r.ok), locales: reports };
}
