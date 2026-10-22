// ICU-style message parser and formatter (subset). Deliberately a LEAF module: it has no relative runtime imports so
// that scripts/i18n/*.mjs can load it directly with Node's built-in type stripping (no build step, no extra tooling).
// Do not add enums, namespaces or parameter properties here (they are not erasable).
//
// Supported syntax:
//   {name}                         plain value (string, number, bigint, Date)
//   {n, number[, percent|integer|compact]}   {d, date[, short|medium|long|full]}   {d, time[, ...]}
//   {n, plural[, offset:N], =0 {..} one {..} other {..}}     {n, selectordinal, ...}     {x, select, a {..} other {..}}
//   #                              the (offset-adjusted) plural number inside a plural branch
//   {#tag}text{/tag}               markup-free rich text: <Trans> maps tag names to components; t() drops the tag
//   'x'                            apostrophe quoting, ICU "double optional" mode: '' is ', '{' '}' (and '#' in plurals) are literal
// Values are never re-parsed, so a value such as "{x}" or "<b>" is inserted as inert text.

export class MessageSyntaxError extends Error {
  override readonly name = 'MessageSyntaxError';
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.position = position;
  }
}

export interface Branch {
  readonly selector: string;
  readonly body: readonly Node[];
}

export type Node =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'pound' }
  | { readonly t: 'arg'; readonly name: string }
  | { readonly t: 'format'; readonly name: string; readonly kind: 'number' | 'date' | 'time'; readonly style: string | undefined }
  | { readonly t: 'plural'; readonly name: string; readonly ordinal: boolean; readonly offset: number; readonly branches: readonly Branch[] }
  | { readonly t: 'select'; readonly name: string; readonly branches: readonly Branch[] }
  | { readonly t: 'tag'; readonly name: string; readonly children: readonly Node[] };

export type ArgValue = string | number | bigint | Date;
export type MessageValues = Readonly<Record<string, ArgValue>>;
export type Part = string | { readonly tag: string; readonly children: readonly Part[] };

const NUMBER_STYLES = ['percent', 'integer', 'compact'];
const DATE_STYLES = ['short', 'medium', 'long', 'full'];

export function parseMessage(src: string): readonly Node[] {
  let i = 0;
  const fail = (m: string): never => {
    throw new MessageSyntaxError(`${m} at position ${String(i)}`, i);
  };
  const skipWs = (): void => {
    while (i < src.length && /\s/.test(src.charAt(i))) i++;
  };
  const expect = (ch: string): void => {
    skipWs();
    if (src.charAt(i) !== ch) fail(`expected "${ch}"`);
    i++;
  };
  const readName = (): string => {
    skipWs();
    const s = i;
    while (i < src.length && !/[\s,{}]/.test(src.charAt(i))) i++;
    if (i === s) fail('expected a name');
    return src.slice(s, i);
  };

  function branches(inPlural: boolean): Branch[] {
    const out: Branch[] = [];
    for (;;) {
      skipWs();
      if (i >= src.length) fail('missing "}" after branches');
      if (src.charAt(i) === '}') {
        i++;
        break;
      }
      const selector = readName();
      if (out.some((b) => b.selector === selector)) fail(`duplicate branch "${selector}"`);
      expect('{');
      const body = seq(inPlural, undefined, true);
      expect('}');
      out.push({ selector, body });
    }
    if (!out.some((b) => b.selector === 'other')) fail('branches need an "other" case');
    return out;
  }

  function seq(inPlural: boolean, closeTag: string | undefined, nested: boolean): Node[] {
    const out: Node[] = [];
    let text = '';
    let closed = false;
    const flush = (): void => {
      if (text !== '') {
        out.push({ t: 'text', v: text });
        text = '';
      }
    };
    while (i < src.length) {
      const c = src.charAt(i);
      if (c === "'") {
        const n = src.charAt(i + 1);
        if (n === "'") {
          text += "'";
          i += 2;
        } else if (n === '{' || n === '}' || (inPlural && n === '#')) {
          i++;
          while (i < src.length) {
            if (src.charAt(i) === "'") {
              if (src.charAt(i + 1) === "'") {
                text += "'";
                i += 2;
                continue;
              }
              i++;
              break;
            }
            text += src.charAt(i);
            i++;
          }
        } else {
          text += c;
          i++;
        }
      } else if (c === '{') {
        flush();
        i++;
        skipWs();
        const lead = src.charAt(i);
        if (lead === '/') {
          i++;
          const name = readName();
          expect('}');
          if (closeTag !== name) fail(`unexpected closing tag "${name}"`);
          return out;
        }
        if (lead === '#') {
          i++;
          const name = readName();
          expect('}');
          out.push({ t: 'tag', name, children: seq(inPlural, name, false) });
          continue;
        }
        const name = readName();
        skipWs();
        if (src.charAt(i) === '}') {
          i++;
          out.push({ t: 'arg', name });
          continue;
        }
        expect(',');
        const type = readName();
        if (type === 'number' || type === 'date' || type === 'time') {
          skipWs();
          let style: string | undefined;
          if (src.charAt(i) === ',') {
            i++;
            style = readName();
            const allowed = type === 'number' ? NUMBER_STYLES : DATE_STYLES;
            if (!allowed.includes(style)) fail(`unknown ${type} style "${style}"`);
          }
          expect('}');
          out.push({ t: 'format', name, kind: type, style });
        } else if (type === 'plural' || type === 'selectordinal') {
          expect(',');
          skipWs();
          let offset = 0;
          if (src.startsWith('offset:', i)) {
            i += 'offset:'.length;
            const digits = /^\d+/.exec(src.slice(i));
            if (digits === null) return fail('offset needs a number');
            offset = Number(digits[0]);
            i += digits[0].length;
          }
          out.push({ t: 'plural', name, ordinal: type === 'selectordinal', offset, branches: branches(true) });
        } else if (type === 'select') {
          expect(',');
          out.push({ t: 'select', name, branches: branches(inPlural) });
        } else {
          fail(`unknown argument type "${type}"`);
        }
      } else if (c === '}') {
        if (nested) {
          closed = true;
          break;
        }
        fail('unmatched "}"');
      } else if (c === '#' && inPlural) {
        flush();
        out.push({ t: 'pound' });
        i++;
      } else {
        text += c;
        i++;
      }
    }
    if (closeTag !== undefined) fail(`unclosed tag "${closeTag}"`);
    if (nested && !closed) fail('missing "}"');
    flush();
    return out;
  }

  return seq(false, undefined, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting

export interface FormatIssue {
  readonly kind: 'missing-argument' | 'bad-argument';
  readonly name: string;
}

export interface FormatOptions {
  readonly locale: string;
  readonly onIssue?: ((issue: FormatIssue) => void) | undefined;
}

const intlCache = new Map<string, unknown>();

function cached<T>(kind: string, locale: string, opts: object, make: () => T): T {
  const k = `${kind}|${locale}|${JSON.stringify(opts)}`;
  let v = intlCache.get(k) as T | undefined;
  if (v === undefined) {
    v = make();
    intlCache.set(k, v);
  }
  return v;
}

export function numberFormat(locale: string, opts: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  return cached('n', locale, opts, () => new Intl.NumberFormat(locale, opts));
}

export function dateTimeFormat(locale: string, opts: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  return cached('d', locale, opts, () => new Intl.DateTimeFormat(locale, opts));
}

export function pluralRules(locale: string, ordinal: boolean): Intl.PluralRules {
  return cached('p', locale, { ordinal }, () => new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' }));
}

function numberOptions(style: string | undefined): Intl.NumberFormatOptions {
  if (style === 'percent') return { style: 'percent' };
  if (style === 'integer') return { maximumFractionDigits: 0 };
  if (style === 'compact') return { notation: 'compact' };
  return {};
}

function dateOptions(kind: 'date' | 'time', style: string | undefined): Intl.DateTimeFormatOptions {
  const s = (style ?? 'medium') as 'short' | 'medium' | 'long' | 'full';
  return kind === 'date' ? { dateStyle: s } : { timeStyle: s };
}

function asNumber(v: ArgValue): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'bigint') return Number(v);
  return undefined;
}

function asDate(v: ArgValue): Date | undefined {
  const d = v instanceof Date ? v : typeof v === 'number' ? new Date(v) : undefined;
  return d !== undefined && !Number.isNaN(d.getTime()) ? d : undefined;
}

export function formatToParts(nodes: readonly Node[], values: MessageValues, opts: FormatOptions): Part[] {
  const { locale } = opts;
  const issue = (kind: FormatIssue['kind'], name: string): void => {
    opts.onIssue?.({ kind, name });
  };

  function render(list: readonly Node[], pound: number | undefined): Part[] {
    const out: Part[] = [];
    const push = (p: Part): void => {
      const last = out[out.length - 1];
      if (typeof p === 'string' && typeof last === 'string') out[out.length - 1] = last + p;
      else out.push(p);
    };
    for (const n of list) {
      switch (n.t) {
        case 'text':
          push(n.v);
          break;
        case 'pound':
          push(pound === undefined ? '#' : numberFormat(locale).format(pound));
          break;
        case 'arg': {
          const v = values[n.name];
          if (v === undefined) {
            issue('missing-argument', n.name);
            push(`{${n.name}}`);
          } else if (typeof v === 'string') push(v);
          else if (v instanceof Date) {
            const d = asDate(v);
            if (d === undefined) {
              issue('bad-argument', n.name);
              push(`{${n.name}}`);
            } else push(dateTimeFormat(locale, { dateStyle: 'medium' }).format(d));
          } else push(numberFormat(locale).format(v));
          break;
        }
        case 'format': {
          const v = values[n.name];
          if (v === undefined) {
            issue('missing-argument', n.name);
            push(`{${n.name}}`);
          } else if (n.kind === 'number') {
            const num = typeof v === 'bigint' ? v : asNumber(v);
            if (num === undefined) {
              issue('bad-argument', n.name);
              push(String(v));
            } else push(numberFormat(locale, numberOptions(n.style)).format(num));
          } else {
            const d = asDate(v);
            if (d === undefined) {
              issue('bad-argument', n.name);
              push(String(v));
            } else push(dateTimeFormat(locale, dateOptions(n.kind, n.style)).format(d));
          }
          break;
        }
        case 'plural': {
          const v = values[n.name];
          if (v === undefined) {
            issue('missing-argument', n.name);
            push(`{${n.name}}`);
            break;
          }
          const num = asNumber(v);
          if (num === undefined) {
            issue('bad-argument', n.name);
            push(String(v));
            break;
          }
          const shifted = num - n.offset;
          const exact = n.branches.find((b) => b.selector === `=${String(num)}`);
          const category = pluralRules(locale, n.ordinal).select(shifted);
          const branch = exact ?? n.branches.find((b) => b.selector === category) ?? n.branches.find((b) => b.selector === 'other');
          for (const p of render(branch?.body ?? [], shifted)) push(p);
          break;
        }
        case 'select': {
          const v = values[n.name];
          if (v === undefined) {
            issue('missing-argument', n.name);
            push(`{${n.name}}`);
            break;
          }
          const key = String(v);
          const branch = n.branches.find((b) => b.selector === key) ?? n.branches.find((b) => b.selector === 'other');
          for (const p of render(branch?.body ?? [], pound)) push(p);
          break;
        }
        case 'tag':
          out.push({ tag: n.name, children: render(n.children, pound) });
          break;
      }
    }
    return out;
  }

  return render(nodes, undefined);
}

/** Concatenates parts to plain text; markup tags are dropped and their content kept. */
export function partsToString(parts: readonly Part[]): string {
  let s = '';
  for (const p of parts) s += typeof p === 'string' ? p : partsToString(p.children);
  return s;
}

// ---------------------------------------------------------------------------------------------------------------------
// Analysis (used by scripts/i18n/check.mjs)

export interface ArgSignature {
  /** Distinct usage kinds: plain | number | date | time | plural | ordinal | select. */
  readonly kinds: readonly string[];
  /** Branch selectors of every plural usage of this argument. */
  readonly plurals: readonly (readonly string[])[];
  readonly ordinals: readonly (readonly string[])[];
  readonly selects: readonly (readonly string[])[];
}

export interface MessageSignature {
  readonly args: Readonly<Record<string, ArgSignature>>;
  readonly tags: readonly string[];
}

export function analyzeMessage(nodes: readonly Node[]): MessageSignature {
  const args: Record<string, { kinds: Set<string>; plurals: string[][]; ordinals: string[][]; selects: string[][] }> = {};
  const tags = new Set<string>();
  const slot = (name: string): { kinds: Set<string>; plurals: string[][]; ordinals: string[][]; selects: string[][] } =>
    (args[name] ??= { kinds: new Set(), plurals: [], ordinals: [], selects: [] });
  const walk = (list: readonly Node[]): void => {
    for (const n of list) {
      if (n.t === 'arg') slot(n.name).kinds.add('plain');
      else if (n.t === 'format') slot(n.name).kinds.add(n.kind);
      else if (n.t === 'plural') {
        const s = slot(n.name);
        s.kinds.add(n.ordinal ? 'ordinal' : 'plural');
        (n.ordinal ? s.ordinals : s.plurals).push(n.branches.map((b) => b.selector));
        for (const b of n.branches) walk(b.body);
      } else if (n.t === 'select') {
        const s = slot(n.name);
        s.kinds.add('select');
        s.selects.push(n.branches.map((b) => b.selector));
        for (const b of n.branches) walk(b.body);
      } else if (n.t === 'tag') {
        tags.add(n.name);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  const outArgs: Record<string, ArgSignature> = {};
  for (const name of Object.keys(args).sort()) {
    const a = args[name];
    if (a === undefined) continue;
    outArgs[name] = { kinds: [...a.kinds].sort(), plurals: a.plurals, ordinals: a.ordinals, selects: a.selects };
  }
  return { args: outArgs, tags: [...tags].sort() };
}

// ---------------------------------------------------------------------------------------------------------------------
// Serialisation and pseudo-localisation

export function stringifyMessage(nodes: readonly Node[], inPlural = false): string {
  let s = '';
  const quote = (v: string): string => {
    let o = '';
    for (const ch of v) {
      if (ch === "'") o += "''";
      else if (ch === '{' || ch === '}' || (inPlural && ch === '#')) o += `'${ch}'`;
      else o += ch;
    }
    return o;
  };
  const branchesToString = (bs: readonly Branch[], plural: boolean): string =>
    bs.map((b) => ` ${b.selector} {${stringifyMessage(b.body, plural || inPlural)}}`).join('');
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        s += quote(n.v);
        break;
      case 'pound':
        s += '#';
        break;
      case 'arg':
        s += `{${n.name}}`;
        break;
      case 'format':
        s += `{${n.name}, ${n.kind}${n.style === undefined ? '' : `, ${n.style}`}}`;
        break;
      case 'plural':
        s += `{${n.name}, ${n.ordinal ? 'selectordinal' : 'plural'},${n.offset > 0 ? ` offset:${String(n.offset)}` : ''}${branchesToString(n.branches, true)}}`;
        break;
      case 'select':
        s += `{${n.name}, select,${branchesToString(n.branches, false)}}`;
        break;
      case 'tag':
        s += `{#${n.name}}${stringifyMessage(n.children, inPlural)}{/${n.name}}`;
        break;
    }
  }
  return s;
}

const ACCENTED: Readonly<Record<string, string>> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ṁ', n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

export type PseudoVariant = 'XA' | 'XB';

/**
 * en-XA: accented letters, every text run 40 % longer, wrapped in [ ] so truncation is visible.
 * en-XB: the same, with each run in a right-to-left embedding so mirrored layouts and bidi bugs show up.
 * Placeholders, plural structure and markup tags are preserved, so the result is still a valid message.
 */
export function pseudolocalize(src: string, variant: PseudoVariant): string {
  const nodes = parseMessage(src);
  const text = (v: string): string => {
    let letters = 0;
    let o = '';
    for (const ch of v) {
      const m = ACCENTED[ch];
      if (m !== undefined) letters++;
      o += m ?? ch;
    }
    o += '·'.repeat(Math.ceil(letters * 0.4));
    return variant === 'XB' ? `‫${o}‬` : o;
  };
  const map = (list: readonly Node[]): Node[] =>
    list.map((n): Node => {
      if (n.t === 'text') return { t: 'text', v: text(n.v) };
      if (n.t === 'plural' || n.t === 'select') return { ...n, branches: n.branches.map((b) => ({ selector: b.selector, body: map(b.body) })) };
      if (n.t === 'tag') return { ...n, children: map(n.children) };
      return n;
    });
  return `[${stringifyMessage(map(nodes))}]`;
}
