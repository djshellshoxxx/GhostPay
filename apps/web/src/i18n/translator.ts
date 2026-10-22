import type { CatalogLayer, MessageKey } from './catalog';
import { SOURCE_LOCALE } from './languages';
import {
  dateTimeFormat,
  formatToParts,
  MessageSyntaxError,
  numberFormat,
  parseMessage,
  partsToString,
  type FormatIssue,
  type MessageValues,
  type Node,
  type Part,
} from './message';

export type I18nIssue =
  | { readonly kind: 'missing-key'; readonly key: string; readonly locale: string }
  | { readonly kind: 'fallback'; readonly key: string; readonly locale: string; readonly usedLocale: string }
  | { readonly kind: 'syntax'; readonly key: string; readonly locale: string; readonly message: string }
  | { readonly kind: 'argument'; readonly key: string; readonly locale: string; readonly name: string; readonly problem: FormatIssue['kind'] };

export interface Translator {
  /** Locale used for number, date, plural and list formatting. */
  readonly locale: string;
  /** Plain-text message. Markup tags are dropped and their text kept. */
  readonly t: (key: MessageKey, values?: MessageValues) => string;
  /** Message split around its markup tags, for <Trans>. */
  readonly parts: (key: MessageKey, values?: MessageValues) => Part[];
  readonly number: (value: number | bigint, options?: Intl.NumberFormatOptions) => string;
  readonly date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  readonly relativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string;
  readonly list: (items: readonly string[], options?: Intl.ListFormatOptions) => string;
}

export interface TranslatorOptions {
  /** Called for missing keys, fallbacks, broken messages and bad arguments. Wire to console in development only. */
  readonly onIssue?: ((issue: I18nIssue) => void) | undefined;
}

const astCache = new Map<string, readonly Node[] | MessageSyntaxError>();

function ast(src: string): readonly Node[] | MessageSyntaxError {
  let v = astCache.get(src);
  if (v === undefined) {
    try {
      v = parseMessage(src);
    } catch (e) {
      if (!(e instanceof MessageSyntaxError)) throw e;
      v = e;
    }
    astCache.set(src, v);
  }
  return v;
}

function usableLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? SOURCE_LOCALE;
  } catch {
    return SOURCE_LOCALE;
  }
}

/**
 * Builds a translator from catalog layers (most specific first, English last). A key is looked up layer by layer, so a
 * missing or broken translation falls back to the next layer and finally to the English text, never to a blank.
 */
export function createTranslator(locale: string, layers: readonly CatalogLayer[], options: TranslatorOptions = {}): Translator {
  // 'en-XA' / 'en-XB' are valid BCP 47 tags (private-use region codes) so Intl accepts them as 'en'.
  const intl = usableLocale(locale);
  const reported = new Set<string>();
  const report = (issue: I18nIssue, id: string): void => {
    if (options.onIssue === undefined || reported.has(id)) return;
    reported.add(id);
    options.onIssue(issue);
  };

  const parts = (key: MessageKey, values: MessageValues = {}): Part[] => {
    let first: CatalogLayer | undefined;
    for (const layer of layers) {
      first ??= layer;
      const src = layer.messages[key];
      if (src === undefined) continue;
      const parsed = ast(src);
      if (parsed instanceof MessageSyntaxError) {
        report({ kind: 'syntax', key, locale: layer.locale, message: parsed.message }, `s|${layer.locale}|${key}`);
        continue;
      }
      if (layer !== first) report({ kind: 'fallback', key, locale: first?.locale ?? locale, usedLocale: layer.locale }, `f|${key}`);
      return formatToParts(parsed, values, {
        locale: intl,
        onIssue: (i) => {
          report({ kind: 'argument', key, locale: layer.locale, name: i.name, problem: i.kind }, `a|${layer.locale}|${key}|${i.name}`);
        },
      });
    }
    report({ kind: 'missing-key', key, locale }, `m|${key}`);
    return [key];
  };

  return {
    locale: intl,
    t: (key, values) => partsToString(parts(key, values)),
    parts,
    number: (value, opts) => numberFormat(intl, opts).format(value),
    date: (value, opts) => dateTimeFormat(intl, opts ?? { dateStyle: 'medium' }).format(value),
    relativeTime: (value, unit, opts) => new Intl.RelativeTimeFormat(intl, opts).format(value, unit),
    list: (items, opts) => new Intl.ListFormat(intl, opts).format(items),
  };
}
