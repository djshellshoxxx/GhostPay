import { I18nError } from './errors.js';
import { type IntlLike, defaultIntl } from './intl.js';
import { fallbackChain, parseLocale } from './locale.js';
import {
  type EscapeMode,
  type MessageNode,
  type MessageParams,
  messageParamNames,
  parseMessage,
  renderMessage,
} from './message.js';

/** Flat message catalog: dotted key -> ICU-lite template. */
export type MessageCatalog = Readonly<Record<string, string>>;
/** Catalogs by canonical locale tag. */
export type CatalogSet = Readonly<Record<string, MessageCatalog>>;

/** Allowed catalog key shape, e.g. `send.confirm.title`. */
export const CATALOG_KEY_RE = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)*$/;

/** Why a lookup/format did not produce the requested translation. */
export type I18nIssue =
  | { readonly kind: 'missing-key'; readonly key: string; readonly locale: string }
  | { readonly kind: 'format-error'; readonly key: string; readonly locale: string; readonly code: string }
  | { readonly kind: 'invalid-key'; readonly key: string };

/** Translator options. */
export interface TranslatorOptions {
  readonly locale: string;
  readonly catalogs: CatalogSet;
  /** Extra fallback locales after the language chain. Default `['en']`. */
  readonly fallbacks?: readonly string[];
  readonly intl?: IntlLike;
  /** Default `html` (values escaped). Use `text` for text-node sinks. */
  readonly escape?: EscapeMode;
  /** Called for every missing key / format failure (missing-key detection hook). */
  readonly onIssue?: (issue: I18nIssue) => void;
}

/** Translator returned by {@link createTranslator}. */
export interface Translator {
  readonly locale: string;
  /** Never throws. On failure returns the key itself and reports an issue. */
  t(key: string, params?: MessageParams): string;
  /** True if the key exists in any locale of the chain. */
  has(key: string): boolean;
}

/**
 * Create a translator with locale-chain fallback and parse caching.
 * @security Keys are allow-listed and looked up with hasOwn (no prototype keys).
 * Values are escaped per `escape`; templates are trusted developer content.
 */
export function createTranslator(opts: TranslatorOptions): Translator {
  const locale = parseLocale(opts.locale)?.tag ?? 'en';
  const chain = fallbackChain(locale, opts.fallbacks ?? ['en']);
  const cache = new Map<string, MessageNode[]>();
  const report = opts.onIssue ?? ((): void => undefined);

  const find = (key: string): { src: string; loc: string } | undefined => {
    for (const loc of chain) {
      const cat = Object.hasOwn(opts.catalogs, loc) ? opts.catalogs[loc] : undefined;
      if (cat !== undefined && Object.hasOwn(cat, key)) {
        const src = cat[key];
        if (src !== undefined) return { src, loc };
      }
    }
    return undefined;
  };

  return {
    locale,
    has(key: string): boolean {
      return CATALOG_KEY_RE.test(key) && find(key) !== undefined;
    },
    t(key: string, params: MessageParams = {}): string {
      if (!CATALOG_KEY_RE.test(key)) {
        report({ kind: 'invalid-key', key: key.slice(0, 80) });
        return key.slice(0, 80);
      }
      const hit = find(key);
      if (hit === undefined) {
        report({ kind: 'missing-key', key, locale });
        return key;
      }
      try {
        const id = `${hit.loc}\u0000${key}`;
        let nodes = cache.get(id);
        if (nodes === undefined) {
          nodes = parseMessage(hit.src);
          cache.set(id, nodes);
        }
        return renderMessage(nodes, params, {
          locale: hit.loc,
          ...(opts.intl === undefined ? {} : { intl: opts.intl }),
          ...(opts.escape === undefined ? {} : { escape: opts.escape }),
        });
      } catch (e) {
        report({
          kind: 'format-error',
          key,
          locale,
          code: e instanceof I18nError ? e.code : 'unknown',
        });
        return key;
      }
    },
  };
}

/** Result of {@link checkCatalogCompleteness}. */
export interface CompletenessReport {
  readonly locale: string;
  /** Keys in the base catalog absent from the target. */
  readonly missing: readonly string[];
  /** Keys in the target absent from the base (likely stale). */
  readonly extra: readonly string[];
  /** Keys whose parameter sets differ from the base. */
  readonly paramMismatch: readonly { key: string; expected: readonly string[]; actual: readonly string[] }[];
  /** Keys with invalid names or templates that fail to parse. */
  readonly invalid: readonly { key: string; reason: string }[];
  /** Completed share of base keys, 0..1 (1 when base is empty). */
  readonly coverage: number;
  /** No missing, extra, mismatched or invalid entries. */
  readonly ok: boolean;
}

/** Compare a catalog to the base (reference) catalog. Pure; suitable for a unit test gate. */
export function checkCatalogCompleteness(
  base: MessageCatalog,
  target: MessageCatalog,
  locale = 'und',
): CompletenessReport {
  const baseKeys = Object.keys(base).sort();
  const targetKeys = Object.keys(target).sort();
  const missing = baseKeys.filter((k) => !Object.hasOwn(target, k));
  const extra = targetKeys.filter((k) => !Object.hasOwn(base, k));
  const invalid: { key: string; reason: string }[] = [];
  const paramMismatch: { key: string; expected: readonly string[]; actual: readonly string[] }[] = [];
  const params = (src: string): string[] | undefined => {
    try {
      return messageParamNames(parseMessage(src));
    } catch {
      return undefined;
    }
  };
  for (const k of targetKeys) {
    if (!CATALOG_KEY_RE.test(k)) {
      invalid.push({ key: k, reason: 'bad key' });
      continue;
    }
    const tSrc = target[k];
    const bSrc = Object.hasOwn(base, k) ? base[k] : undefined;
    const tp = tSrc === undefined ? undefined : params(tSrc);
    if (tp === undefined) {
      invalid.push({ key: k, reason: 'template does not parse' });
      continue;
    }
    if (bSrc !== undefined) {
      const bp = params(bSrc) ?? [];
      if (bp.join(',') !== tp.join(',')) paramMismatch.push({ key: k, expected: bp, actual: tp });
    }
  }
  const present = baseKeys.length - missing.length;
  return {
    locale,
    missing,
    extra,
    paramMismatch,
    invalid,
    coverage: baseKeys.length === 0 ? 1 : present / baseKeys.length,
    ok: missing.length + extra.length + paramMismatch.length + invalid.length === 0,
  };
}

/** Check every non-base locale in a set against the base locale. */
export function checkCatalogSet(set: CatalogSet, baseLocale: string): CompletenessReport[] {
  const base = Object.hasOwn(set, baseLocale) ? set[baseLocale] : undefined;
  if (base === undefined) throw new I18nError('bad-input', 'base locale catalog not found');
  return Object.keys(set)
    .sort()
    .filter((l) => l !== baseLocale)
    .map((l) => checkCatalogCompleteness(base, set[l] ?? {}, l));
}

/** Re-export default for convenience. */
export { defaultIntl };
