import { parseLocale, isValidLocale } from './bcp47.js';
import { I18nError } from './errors.js';
import { formatNodes, type FormatArgs, type FormatOptions } from './format.js';
import { fallbackChain, negotiateLocale, type Negotiated } from './negotiate.js';
import { parseMessage, type Node } from './parse.js';
import { textDirection } from './rtl.js';

export type Catalog = Readonly<Record<string, string>>;

export const KEY_PATTERN = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
export const MAX_KEY_LENGTH = 128;

export type MissingKind = 'fallback' | 'missing' | 'missing-arg';

export interface MissingKeyEvent {
  readonly kind: MissingKind;
  /** Locale the caller asked for (canonical, or the default if the request was invalid). */
  readonly locale: string;
  readonly key: string;
  /** For `fallback`: locale that actually served the message. For `missing-arg`: the argument name. */
  readonly detail?: string;
}

/** Collects unique missing-key events, bounded so a hostile locale/key stream cannot grow memory. */
export class MissingKeyTracker {
  private readonly seen = new Map<string, MissingKeyEvent>();
  constructor(private readonly limit = 1000) {}
  record(e: MissingKeyEvent): void {
    const id = `${e.kind}|${e.locale}|${e.key}|${e.detail ?? ''}`;
    if (this.seen.has(id) || this.seen.size >= this.limit) return;
    this.seen.set(id, e);
  }
  /** Sorted snapshot. */
  report(): MissingKeyEvent[] {
    return [...this.seen.values()].sort((a, b) =>
      `${a.kind}|${a.locale}|${a.key}`.localeCompare(`${b.kind}|${b.locale}|${b.key}`, 'en'),
    );
  }
  get size(): number {
    return this.seen.size;
  }
  clear(): void {
    this.seen.clear();
  }
}

export interface I18nOptions {
  readonly catalogs: Readonly<Record<string, Catalog>>;
  readonly defaultLocale: string;
  /** Throw on missing keys / arguments instead of degrading. Use in tests and CI, not in production UI. */
  readonly strict?: boolean;
  readonly onMissing?: (e: MissingKeyEvent) => void;
  readonly format?: Pick<FormatOptions, 'escape' | 'isolate'>;
  readonly tracker?: MissingKeyTracker;
}

export interface Translator {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  t(key: string, args?: FormatArgs): string;
}

export interface I18n {
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly tracker: MissingKeyTracker;
  /** Pick a supported locale from an ordered preference list (e.g. `navigator.languages`). */
  negotiate(requested: readonly string[]): Negotiated;
  t(locale: string, key: string, args?: FormatArgs): string;
  translator(locale: string): Translator;
  has(locale: string, key: string): boolean;
}

/**
 * Build an I18n instance. All catalogs are validated and pre-parsed up front (fail fast).
 * @throws I18nError bad_locale | bad_key | bad_catalog | syntax | ...
 */
export function createI18n(opts: I18nOptions): I18n {
  const def = parseLocale(opts.defaultLocale).tag;
  const store = new Map<string, Map<string, Node[]>>();
  for (const [rawLocale, cat] of Object.entries(opts.catalogs)) {
    const loc = parseLocale(rawLocale).tag;
    if (store.has(loc)) throw new I18nError('bad_locale', 'duplicate locale after canonicalisation');
    const m = new Map<string, Node[]>();
    for (const [key, msg] of Object.entries(cat)) {
      if (key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) throw new I18nError('bad_key', 'invalid catalog key');
      if (typeof msg !== 'string') throw new I18nError('bad_catalog', 'catalog values must be strings');
      m.set(key, parseMessage(msg));
    }
    store.set(loc, m);
  }
  if (!store.has(def)) throw new I18nError('bad_catalog', 'no catalog for the default locale');
  const locales = [...store.keys()];
  const tracker = opts.tracker ?? new MissingKeyTracker();
  const strict = opts.strict ?? false;
  const report = (e: MissingKeyEvent): void => {
    tracker.record(e);
    opts.onMissing?.(e);
  };

  const t = (locale: string, key: string, args: FormatArgs = {}): string => {
    if (key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) throw new I18nError('bad_key', 'invalid message key');
    const want = isValidLocale(locale) ? parseLocale(locale).tag : def;
    const chain = fallbackChain(want, def).filter((c) => store.has(c));
    for (const [idx, loc] of chain.entries()) {
      const nodes = store.get(loc)?.get(key);
      if (nodes === undefined) continue;
      if (idx > 0 || loc !== want) {
        if (strict) throw new I18nError('missing_key', 'message missing in requested locale');
        report({ kind: 'fallback', locale: want, key, detail: loc });
      }
      return formatNodes(nodes, loc, args, {
        ...opts.format,
        strict,
        onMissingArg: (name) => report({ kind: 'missing-arg', locale: want, key, detail: name }),
      });
    }
    if (strict) throw new I18nError('missing_key', 'message missing in every locale');
    report({ kind: 'missing', locale: want, key });
    return key;
  };

  return {
    locales,
    defaultLocale: def,
    tracker,
    negotiate: (requested) => negotiateLocale(requested, locales, def),
    t,
    translator(locale) {
      const loc = isValidLocale(locale) ? parseLocale(locale).tag : def;
      return { locale: loc, dir: textDirection(loc), t: (key, args) => t(loc, key, args) };
    },
    has: (locale, key) => isValidLocale(locale) && (store.get(parseLocale(locale).tag)?.has(key) ?? false),
  };
}
