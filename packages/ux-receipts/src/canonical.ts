import { ReceiptError } from './errors.js';

const MAX_DEPTH = 16;

/**
 * Canonical JSON (JCS-like): keys sorted by UTF-16 code units, no whitespace,
 * only null/boolean/string/safe-integer/array/plain-object. Floats, undefined,
 * bigint, functions, symbols, non-plain objects and cycles/deep nesting are rejected.
 * @security Deterministic bytes are required so the digest is reproducible by any verifier.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, 0);
}

function encode(v: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new ReceiptError('NOT_CANONICALIZABLE', '', 'nesting too deep');
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'string':
      return JSON.stringify(v);
    case 'number':
      if (!Number.isSafeInteger(v))
        throw new ReceiptError('NOT_CANONICALIZABLE', '', 'only safe integers allowed');
      return String(v);
    case 'object': {
      if (Array.isArray(v)) return '[' + v.map((x) => encode(x, depth + 1)).join(',') + ']';
      const proto = Object.getPrototypeOf(v) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        throw new ReceiptError('NOT_CANONICALIZABLE', '', 'non-plain object');
      }
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + encode(obj[k], depth + 1)).join(',') + '}';
    }
    default:
      throw new ReceiptError('NOT_CANONICALIZABLE', '', 'unsupported value type');
  }
}
