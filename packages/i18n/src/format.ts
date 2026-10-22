import { I18nError } from './errors.js';
import { isRtl } from './rtl.js';
import { parseMessage, type Node, type PluralCategory } from './parse.js';

export type FormatValue = string | number | bigint;
export type FormatArgs = Readonly<Record<string, FormatValue>>;

export interface FormatOptions {
  /** `html` entity-escapes interpolated values (template text is trusted and left alone). Default `none` (plain text). */
  readonly escape?: 'none' | 'html';
  /** Wrap interpolated string values in FSI/PDI. `auto` = only for RTL locales. Default `auto`. */
  readonly isolate?: 'auto' | 'always' | 'never';
  /** Throw on a missing argument instead of leaving `{name}` in the output. */
  readonly strict?: boolean;
  /** Called for every missing argument name (non-strict mode). */
  readonly onMissingArg?: (name: string) => void;
}

export const MAX_OUTPUT_LENGTH = 20_000;
const FSI = '⁨';
const PDI = '⁩';

/* eslint-disable no-control-regex -- stripping control characters is the point */
const STRIP = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;
/* eslint-enable no-control-regex */

/** Entity-escape for HTML text and attribute contexts. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`]/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

const ruleCache = new Map<string, Intl.PluralRules>();
function rules(locale: string): Intl.PluralRules {
  let r = ruleCache.get(locale);
  if (r === undefined) {
    try {
      r = new Intl.PluralRules(locale);
    } catch {
      r = new Intl.PluralRules('en');
    }
    ruleCache.set(locale, r);
  }
  return r;
}

/** Plural categories CLDR defines for a locale (via Intl), e.g. `de` -> one, other. */
export function pluralCategoriesFor(locale: string): PluralCategory[] {
  return rules(locale).resolvedOptions().pluralCategories;
}

function toPluralNumber(v: FormatValue | undefined): { n: number; text: string } {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new I18nError('bad_argument', 'plural argument must be finite');
    return { n: Math.abs(v), text: String(Object.is(v, -0) ? 0 : v) };
  }
  if (typeof v === 'bigint') {
    const abs = v < 0n ? -v : v;
    // Intl needs a number; the low digits determine every CLDR integer plural category.
    const n = abs <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(abs) : Number(abs % 1_000_000_000n) + 1_000_000_000;
    return { n, text: v.toString() };
  }
  throw new I18nError('bad_argument', 'plural argument must be a number or bigint');
}

interface RenderOpts {
  readonly escape: 'none' | 'html';
  readonly isolate: boolean;
  readonly strict: boolean;
  readonly onMissingArg: ((name: string) => void) | undefined;
}

function render(nodes: readonly Node[], args: FormatArgs, locale: string, o: RenderOpts, hash: string | undefined): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += n.v;
    else if (n.t === 'hash') out += hash ?? '#';
    else if (n.t === 'arg') {
      const v = Object.hasOwn(args, n.name) ? args[n.name] : undefined;
      if (v === undefined) {
        if (o.strict) throw new I18nError('missing_argument', `missing argument "${n.name}"`);
        o.onMissingArg?.(n.name);
        out += `{${n.name}}`;
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') {
        let s = typeof v === 'string' ? v.replace(STRIP, '') : typeof v === 'number' && !Number.isFinite(v) ? '' : String(v);
        if (o.escape === 'html') s = escapeHtml(s);
        out += o.isolate && typeof v === 'string' ? `${FSI}${s}${PDI}` : s;
      } else {
        throw new I18nError('bad_argument', `argument "${n.name}" must be string, number or bigint`);
      }
    } else {
      const raw = Object.hasOwn(args, n.name) ? args[n.name] : undefined;
      if (raw === undefined) {
        if (o.strict) throw new I18nError('missing_argument', `missing argument "${n.name}"`);
        o.onMissingArg?.(n.name);
        out += `{${n.name}}`;
      } else {
        const { n: num, text } = toPluralNumber(raw);
        const body = n.exact.get(num) ?? n.cats.get(rules(locale).select(num)) ?? n.cats.get('other');
        out += render(body ?? [], args, locale, o, text);
      }
    }
    if (out.length > MAX_OUTPUT_LENGTH) throw new I18nError('output_too_long', 'formatted output too long');
  }
  return out;
}

/** Format a pre-parsed message. */
export function formatNodes(nodes: readonly Node[], locale: string, args: FormatArgs = {}, opts: FormatOptions = {}): string {
  const isolate = opts.isolate ?? 'auto';
  return render(
    nodes,
    args,
    locale,
    {
      escape: opts.escape ?? 'none',
      isolate: isolate === 'always' || (isolate === 'auto' && isRtl(locale)),
      strict: opts.strict ?? false,
      onMissingArg: opts.onMissingArg,
    },
    undefined,
  );
}

/**
 * Parse and format in one call.
 * @security output is PLAIN TEXT: set it with `textContent`, never `innerHTML`. Arguments are untrusted: they are
 * stripped of control/bidi characters, never re-parsed, and optionally HTML-escaped.
 */
export function formatMessage(message: string, locale: string, args: FormatArgs = {}, opts: FormatOptions = {}): string {
  return formatNodes(parseMessage(message), locale, args, opts);
}
