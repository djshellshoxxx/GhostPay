import { JsonParseError } from './errors.js';

/** JSON value domain accepted by the strict parser (numbers are safe non-negative integers only). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const MAX_DEPTH = 8;
const INT_RE = /^(?:0|[1-9][0-9]{0,15})$/;
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

class Parser {
  private i = 0;
  public constructor(private readonly s: string) {}

  public parseDocument(): JsonValue {
    this.ws();
    const v = this.value(0);
    this.ws();
    if (this.i !== this.s.length) throw new JsonParseError();
    return v;
  }

  private ws(): void {
    for (;;) {
      const c = this.s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i++;
      else return;
    }
  }

  private value(depth: number): JsonValue {
    if (depth >= MAX_DEPTH) throw new JsonParseError();
    const ch = this.s[this.i];
    if (ch === '{') return this.object(depth);
    if (ch === '[') return this.array(depth);
    if (ch === '"') return this.string();
    if (ch === 't') return this.literal('true', true);
    if (ch === 'f') return this.literal('false', false);
    if (ch === 'n') return this.literal('null', null);
    return this.number();
  }

  private literal(word: string, v: boolean | null): boolean | null {
    if (!this.s.startsWith(word, this.i)) throw new JsonParseError();
    this.i += word.length;
    return v;
  }

  private number(): number {
    const start = this.i;
    while (this.i < this.s.length && /[-+.0-9eE]/.test(this.s[this.i] as string)) this.i++;
    const tok = this.s.slice(start, this.i);
    // Integers only: no sign, fraction, exponent, leading zeros, or values above 2^53-1.
    if (!INT_RE.test(tok)) throw new JsonParseError();
    const n = Number(tok);
    if (!Number.isSafeInteger(n)) throw new JsonParseError();
    return n;
  }

  private string(): string {
    this.i++; // opening quote
    let out = '';
    for (;;) {
      if (this.i >= this.s.length) throw new JsonParseError();
      const c = this.s.charCodeAt(this.i);
      if (c === 0x22) {
        this.i++;
        return out;
      }
      if (c < 0x20) throw new JsonParseError();
      if (c !== 0x5c) {
        out += this.s[this.i];
        this.i++;
        continue;
      }
      const e = this.s[this.i + 1];
      this.i += 2;
      switch (e) {
        case '"':
          out += '"';
          break;
        case '\\':
          out += '\\';
          break;
        case '/':
          out += '/';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'u': {
          const hex = this.s.slice(this.i, this.i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new JsonParseError();
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 4;
          break;
        }
        default:
          throw new JsonParseError();
      }
    }
  }

  private array(depth: number): JsonValue[] {
    this.i++;
    const out: JsonValue[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      out.push(this.value(depth + 1));
      this.ws();
      const c = this.s[this.i++];
      if (c === ']') return out;
      if (c !== ',') throw new JsonParseError();
    }
  }

  private object(depth: number): { [key: string]: JsonValue } {
    this.i++;
    const out: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') throw new JsonParseError();
      const key = this.string();
      if (FORBIDDEN_KEYS.has(key) || key in out) throw new JsonParseError();
      this.ws();
      if (this.s[this.i++] !== ':') throw new JsonParseError();
      this.ws();
      out[key] = this.value(depth + 1);
      this.ws();
      const c = this.s[this.i++];
      if (c === '}') return out;
      if (c !== ',') throw new JsonParseError();
    }
  }
}

/**
 * Strict JSON parser for untrusted invoice data.
 *
 * @remarks Differs from `JSON.parse`: rejects duplicate keys, the keys
 * `__proto__`/`constructor`/`prototype`, any number that is not a non-negative
 * integer <= 2^53-1 (so no floats, exponents, NaN, Infinity, negatives, `-0`,
 * leading zeros or huge values), and nesting deeper than 8. Objects have a null
 * prototype. Trailing content is rejected.
 *
 * @param text Decoded JSON text.
 * @returns Parsed value.
 * @throws {JsonParseError} On any violation. The message never includes input.
 * @security Never log `text`.
 * @testVector json-strict
 */
export function parseStrictJson(text: string): JsonValue {
  return new Parser(text).parseDocument();
}

/**
 * Deterministic canonical JSON: sorted keys, no whitespace, integers only.
 *
 * @remarks Keys sorted by UTF-16 code unit order (all schema keys are ASCII).
 * Strings use `JSON.stringify` escaping; callers must have validated them as
 * well-formed NFC. Numbers must be non-negative safe integers; floats, NaN,
 * negatives, `undefined`, functions, bigint and non-plain objects throw.
 *
 * @param value Value to serialize.
 * @returns Canonical JSON text.
 * @throws {JsonParseError} On unsupported values.
 * @security Output contains whatever the input contains.
 * @testVector json-canonical
 */
export function canonicalize(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new JsonParseError();
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((v: unknown) => canonicalize(v)).join(',')}]`;
  if (typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) throw new JsonParseError();
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(',')}}`;
  }
  throw new JsonParseError();
}
