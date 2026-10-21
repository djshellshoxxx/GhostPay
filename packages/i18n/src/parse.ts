import { I18nError } from './errors.js';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_DEPTH = 4;
export const MAX_NODES = 500;

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
const CATEGORIES: ReadonlySet<string> = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

export type Node =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'arg'; readonly name: string }
  | { readonly t: 'hash' }
  | {
      readonly t: 'plural';
      readonly name: string;
      readonly exact: ReadonlyMap<number, readonly Node[]>;
      readonly cats: ReadonlyMap<PluralCategory, readonly Node[]>;
    };

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

class Parser {
  private pos = 0;
  private nodes = 0;
  constructor(private readonly src: string) {}

  private err(code: 'syntax' | 'too_deep' | 'too_complex' | 'unsupported_type', msg: string): never {
    throw new I18nError(code, `${msg} (at offset ${String(this.pos)})`);
  }

  private count(): void {
    if (++this.nodes > MAX_NODES) this.err('too_complex', 'message has too many nodes');
  }

  private ws(): void {
    while (this.pos < this.src.length && /\s/.test(this.src.charAt(this.pos))) this.pos++;
  }

  parseTop(): Node[] {
    const n = this.parseNodes(0, false);
    if (this.pos < this.src.length) this.err('syntax', 'unbalanced closing brace');
    return n;
  }

  /** Parse until end of input or an unconsumed `}` (left for the caller). */
  private parseNodes(depth: number, inPlural: boolean): Node[] {
    const out: Node[] = [];
    let buf = '';
    const flush = (): void => {
      if (buf !== '') {
        this.count();
        out.push({ t: 'text', v: buf });
        buf = '';
      }
    };
    while (this.pos < this.src.length) {
      const c = this.src.charAt(this.pos);
      if (c === '}') break;
      if (c === '{') {
        flush();
        out.push(this.parsePlaceholder(depth));
        continue;
      }
      if (c === '#' && inPlural) {
        flush();
        this.count();
        out.push({ t: 'hash' });
        this.pos++;
        continue;
      }
      if (c === "'") {
        const nx = this.src.charAt(this.pos + 1);
        if (nx === "'") {
          buf += "'";
          this.pos += 2;
          continue;
        }
        if (nx === '{' || nx === '}' || (nx === '#' && inPlural)) {
          // quoted literal until the next lone apostrophe ('' inside is a literal apostrophe)
          this.pos++;
          for (;;) {
            if (this.pos >= this.src.length) break;
            const q = this.src.charAt(this.pos);
            if (q === "'") {
              if (this.src.charAt(this.pos + 1) === "'") {
                buf += "'";
                this.pos += 2;
                continue;
              }
              this.pos++;
              break;
            }
            buf += q;
            this.pos++;
          }
          continue;
        }
      }
      buf += c;
      this.pos++;
    }
    flush();
    return out;
  }

  private readName(): string {
    this.ws();
    const start = this.pos;
    while (this.pos < this.src.length && /[A-Za-z0-9_]/.test(this.src.charAt(this.pos))) this.pos++;
    const name = this.src.slice(start, this.pos);
    if (!NAME.test(name)) this.err('syntax', 'invalid placeholder name');
    return name;
  }

  private expect(ch: string): void {
    this.ws();
    if (this.src.charAt(this.pos) !== ch) this.err('syntax', `expected "${ch}"`);
    this.pos++;
  }

  private parsePlaceholder(depth: number): Node {
    this.pos++; // {
    const name = this.readName();
    this.ws();
    this.count();
    if (this.src.charAt(this.pos) === '}') {
      this.pos++;
      return { t: 'arg', name };
    }
    this.expect(',');
    this.ws();
    const ts = this.pos;
    while (this.pos < this.src.length && /[a-z]/.test(this.src.charAt(this.pos))) this.pos++;
    const type = this.src.slice(ts, this.pos);
    if (type !== 'plural') this.err('unsupported_type', 'only "plural" arguments are supported');
    if (depth + 1 > MAX_DEPTH) this.err('too_deep', 'plural nesting too deep');
    this.expect(',');
    const exact = new Map<number, Node[]>();
    const cats = new Map<PluralCategory, Node[]>();
    for (;;) {
      this.ws();
      if (this.src.charAt(this.pos) === '}') break;
      if (this.pos >= this.src.length) this.err('syntax', 'unterminated plural');
      const ss = this.pos;
      let isExact = false;
      if (this.src.charAt(this.pos) === '=') {
        isExact = true;
        this.pos++;
      }
      const s0 = this.pos;
      while (this.pos < this.src.length && /[A-Za-z0-9]/.test(this.src.charAt(this.pos))) this.pos++;
      const sel = this.src.slice(s0, this.pos);
      this.expect('{');
      const body = this.parseNodes(depth + 1, true);
      this.expect('}');
      if (isExact) {
        if (!/^[0-9]{1,9}$/.test(sel)) {
          this.pos = ss;
          this.err('syntax', 'invalid exact selector');
        }
        const k = Number(sel);
        if (exact.has(k)) this.err('syntax', 'duplicate selector');
        exact.set(k, body);
      } else {
        if (!CATEGORIES.has(sel)) {
          this.pos = ss;
          this.err('syntax', 'unknown plural category');
        }
        const c = sel as PluralCategory;
        if (cats.has(c)) this.err('syntax', 'duplicate selector');
        cats.set(c, body);
      }
    }
    this.pos++; // }
    if (!cats.has('other')) this.err('syntax', 'plural requires an "other" branch');
    return { t: 'plural', name, exact, cats };
  }
}

/**
 * Parse an ICU-lite message into an AST.
 * @security catalog content is semi-trusted (translators): bounded length, depth and node count; no code paths evaluate it.
 * @throws I18nError syntax | too_long | too_deep | too_complex | unsupported_type
 */
export function parseMessage(src: string): Node[] {
  if (typeof src !== 'string') throw new I18nError('syntax', 'message must be a string');
  if (src.length > MAX_MESSAGE_LENGTH) throw new I18nError('too_long', 'message exceeds 4000 characters');
  return new Parser(src).parseTop();
}

/** Names of all arguments referenced by a message (placeholders and plural selectors), sorted. */
export function argumentNames(nodes: readonly Node[]): string[] {
  const names = new Set<string>();
  const walk = (ns: readonly Node[]): void => {
    for (const n of ns) {
      if (n.t === 'arg') names.add(n.name);
      else if (n.t === 'plural') {
        names.add(n.name);
        for (const b of n.exact.values()) walk(b);
        for (const b of n.cats.values()) walk(b);
      }
    }
  };
  walk(nodes);
  return [...names].sort();
}

/** Plural categories used by every plural node in the message (union). */
export function pluralCategoriesUsed(nodes: readonly Node[]): PluralCategory[][] {
  const res: PluralCategory[][] = [];
  const walk = (ns: readonly Node[]): void => {
    for (const n of ns) {
      if (n.t !== 'plural') continue;
      res.push([...n.cats.keys()]);
      for (const b of n.exact.values()) walk(b);
      for (const b of n.cats.values()) walk(b);
    }
  };
  walk(nodes);
  return res;
}
