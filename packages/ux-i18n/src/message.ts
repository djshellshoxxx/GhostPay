import { I18nError } from './errors.js';
import { type IntlLike, defaultIntl } from './intl.js';
import { parseLocale } from './locale.js';

/** Parsed message node. */
export type MessageNode =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'arg'; readonly name: string }
  | { readonly t: 'pound' }
  | { readonly t: 'plural'; readonly name: string; readonly cases: readonly MessageCase[] }
  | { readonly t: 'select'; readonly name: string; readonly cases: readonly MessageCase[] };

/** One branch of a plural/select. */
export interface MessageCase {
  readonly key: string;
  readonly body: readonly MessageNode[];
}

/** Allowed parameter value types. */
export type MessageParam = string | number | bigint;
/** Parameters for a message. */
export type MessageParams = Readonly<Record<string, MessageParam>>;

/** Escaping applied to interpolated VALUES (templates are trusted, values are not). */
export type EscapeMode = 'html' | 'text';

const MAX_SRC = 2000;
const MAX_DEPTH = 4;
const MAX_VALUE = 1000;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLURAL_KEY_RE = /^(?:zero|one|two|few|many|other|=\d{1,9})$/;
const SELECT_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Parse an ICU-lite template: `{name}`, `{n, plural, =0 {..} one {# x} other {# xs}}`,
 * `{k, select, a {..} other {..}}`, `#` inside plural, apostrophe quoting (`'{'`, `''`).
 * No HTML is interpreted anywhere. Offsets, selectordinal, number/date skeletons are unsupported.
 * @security Length- and depth-bounded recursive descent; no regex on unbounded input.
 */
export function parseMessage(src: string): MessageNode[] {
  if (typeof src !== 'string') throw new I18nError('syntax', 'template must be a string');
  if (src.length > MAX_SRC) throw new I18nError('too-long', 'template too long');
  let i = 0;

  const fail = (msg: string): never => {
    throw new I18nError('syntax', `${msg} at ${String(i)}`);
  };
  const ws = (): void => {
    while (i < src.length && /\s/.test(src.charAt(i))) i++;
  };

  const parseNodes = (depth: number, inPlural: boolean): MessageNode[] => {
    if (depth > MAX_DEPTH) throw new I18nError('too-deep', 'template nested too deeply');
    const out: MessageNode[] = [];
    let buf = '';
    const flush = (): void => {
      if (buf !== '') out.push({ t: 'text', v: buf });
      buf = '';
    };
    while (i < src.length) {
      const c = src.charAt(i);
      if (c === '}') {
        if (depth === 0) fail('unmatched }');
        break;
      }
      if (c === "'") {
        const n = src.charAt(i + 1);
        if (n === "'") {
          buf += "'";
          i += 2;
        } else if (n === '{' || n === '}') {
          i++;
          while (i < src.length) {
            if (src.charAt(i) === "'") {
              if (src.charAt(i + 1) === "'") {
                buf += "'";
                i += 2;
                continue;
              }
              i++;
              break;
            }
            buf += src.charAt(i);
            i++;
          }
        } else {
          buf += c;
          i++;
        }
      } else if (c === '#' && inPlural) {
        flush();
        out.push({ t: 'pound' });
        i++;
      } else if (c === '{') {
        flush();
        i++;
        out.push(parseArg(depth, inPlural));
      } else {
        buf += c;
        i++;
      }
    }
    flush();
    return out;
  };

  const parseArg = (depth: number, inPlural: boolean): MessageNode => {
    ws();
    const start = i;
    while (i < src.length && src.charAt(i) !== ',' && src.charAt(i) !== '}') i++;
    const name = src.slice(start, i).trim();
    if (!NAME_RE.test(name)) fail('bad argument name');
    if (src.charAt(i) === '}') {
      i++;
      return { t: 'arg', name };
    }
    if (i >= src.length) fail('unterminated argument');
    i++; // comma
    ws();
    const ts = i;
    while (i < src.length && src.charAt(i) !== ',' && src.charAt(i) !== '}') i++;
    const type = src.slice(ts, i).trim();
    if (type !== 'plural' && type !== 'select') return fail('unsupported argument type');
    if (src.charAt(i) !== ',') fail('expected , after type');
    i++;
    const cases: MessageCase[] = [];
    for (;;) {
      ws();
      if (i >= src.length) fail('unterminated argument');
      if (src.charAt(i) === '}') {
        i++;
        break;
      }
      const ks = i;
      while (i < src.length && !/[\s{}]/.test(src.charAt(i))) i++;
      const key = src.slice(ks, i);
      const keyRe = type === 'plural' ? PLURAL_KEY_RE : SELECT_KEY_RE;
      if (!keyRe.test(key)) fail('bad case selector');
      if (cases.some((c) => c.key === key)) fail('duplicate case');
      ws();
      if (src.charAt(i) !== '{') fail('expected {');
      i++;
      const body = parseNodes(depth + 1, type === 'plural' ? true : inPlural);
      if (src.charAt(i) !== '}') fail('unterminated case');
      i++;
      cases.push({ key, body });
    }
    if (!cases.some((c) => c.key === 'other')) fail('missing other case');
    return { t: type, name, cases };
  };

  const nodes = parseNodes(0, false);
  return nodes;
}

/** Collect every parameter name a template needs (sorted, unique). */
export function messageParamNames(nodes: readonly MessageNode[]): string[] {
  const set = new Set<string>();
  const walk = (ns: readonly MessageNode[]): void => {
    for (const n of ns) {
      if (n.t === 'arg') set.add(n.name);
      else if (n.t === 'plural' || n.t === 'select') {
        set.add(n.name);
        for (const c of n.cases) walk(c.body);
      }
    }
  };
  walk(nodes);
  return [...set].sort();
}

/**
 * Remove characters that enable spoofing or layout attacks from a value: C0/C1 controls
 * (except none), bidi embeddings/overrides/isolates, zero-width and BOM. Truncates to 1000 chars.
 * @security Defends against Trojan-Source style bidi reordering in addresses/labels shown to users.
 */
export function sanitizeValue(s: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '');
  return cleaned.length > MAX_VALUE ? cleaned.slice(0, MAX_VALUE) : cleaned;
}

/** Escape for insertion into HTML text or quoted attribute context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/** Options for {@link renderMessage}. */
export interface RenderOptions {
  readonly locale: string;
  readonly intl?: IntlLike;
  /** Default `html`: values are HTML-escaped. Use `text` only for textContent/text-node sinks. */
  readonly escape?: EscapeMode;
}

function safeLocale(l: string): string {
  return parseLocale(l)?.tag ?? 'en';
}

function fmtNum(v: number | bigint, locale: string, intl: IntlLike): string {
  try {
    return new intl.NumberFormat(locale).format(v);
  } catch {
    return new intl.NumberFormat('en').format(v);
  }
}

function pluralCategory(n: number, locale: string, intl: IntlLike): string {
  try {
    return new intl.PluralRules(locale).select(n);
  } catch {
    return new intl.PluralRules('en').select(n);
  }
}

/**
 * Render parsed nodes. Values are sanitised then escaped; template text is emitted as-is.
 * @security Output is plain text (or HTML-escaped values). Never interpret as markup unless
 * `escape: 'html'`. Throws I18nError on missing/ill-typed params.
 */
export function renderMessage(
  nodes: readonly MessageNode[],
  params: MessageParams,
  opts: RenderOptions,
): string {
  const intl = opts.intl ?? defaultIntl;
  const locale = safeLocale(opts.locale);
  const esc = opts.escape ?? 'html';
  const getParam = (name: string): MessageParam => {
    if (!Object.hasOwn(params, name)) throw new I18nError('missing-param', `missing parameter ${name}`);
    const v = params[name];
    if (typeof v === 'string' || typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    throw new I18nError('bad-param', `bad parameter ${name}`);
  };
  const valueText = (v: MessageParam): string => {
    if (typeof v === 'string') {
      const s = sanitizeValue(v);
      return esc === 'html' ? escapeHtml(s) : s;
    }
    return fmtNum(v, locale, intl);
  };
  const go = (ns: readonly MessageNode[], pound: number | bigint | undefined): string => {
    let out = '';
    for (const n of ns) {
      switch (n.t) {
        case 'text':
          out += n.v;
          break;
        case 'arg':
          out += valueText(getParam(n.name));
          break;
        case 'pound':
          out += pound === undefined ? '#' : fmtNum(pound, locale, intl);
          break;
        case 'plural': {
          const v = getParam(n.name);
          if (typeof v === 'string') throw new I18nError('bad-param', `plural needs number: ${n.name}`);
          const num = Number(v);
          const exact = n.cases.find((c) => c.key === `=${String(num)}`);
          const cat = exact ?? n.cases.find((c) => c.key === pluralCategory(num, locale, intl));
          const chosen = cat ?? n.cases.find((c) => c.key === 'other');
          out += go(chosen?.body ?? [], v);
          break;
        }
        case 'select': {
          const v = getParam(n.name);
          const key = String(v);
          const chosen = n.cases.find((c) => c.key === key) ?? n.cases.find((c) => c.key === 'other');
          out += go(chosen?.body ?? [], pound);
          break;
        }
      }
    }
    return out;
  };
  return go(nodes, undefined);
}

/** Parse and render in one step. */
export function formatMessage(src: string, params: MessageParams, opts: RenderOptions): string {
  return renderMessage(parseMessage(src), params, opts);
}
