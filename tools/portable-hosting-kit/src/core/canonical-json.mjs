// @ts-check
// RFC 8785 (JSON Canonicalization Scheme) for the value subset the kit uses: null, booleans, strings, safe
// integers, arrays and plain objects. Anything else (non-integers, unsafe integers, undefined, lone surrogates,
// non-plain objects) is rejected rather than approximated.
import { ERROR_CODES, KitError } from '../errors.mjs';

const LONE_SURROGATE_RE = /\p{Cs}/u;

/**
 * @param {string} s
 * @returns {string}
 */
function serializeString(s) {
  if (LONE_SURROGATE_RE.test(s)) throw new KitError(ERROR_CODES.USAGE, 'canonical JSON: string contains a lone surrogate');
  // ECMAScript JSON.stringify string escaping is exactly the RFC 8785 string serialization.
  return JSON.stringify(s);
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {unknown} v
 * @param {number} depth
 * @returns {string}
 */
function serialize(v, depth) {
  if (depth > 64) throw new KitError(ERROR_CODES.USAGE, 'canonical JSON: nesting too deep');
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'string') return serializeString(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new KitError(ERROR_CODES.USAGE, `canonical JSON: ${v} is not a safe integer`);
    return Object.is(v, -0) ? '0' : String(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => serialize(x, depth + 1)).join(',')}]`;
  if (isPlainObject(v)) {
    // RFC 8785 3.2.3: sort property names by their UTF-16 code units (the default JS string order).
    const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = [];
    for (const k of keys) {
      if (v[k] === undefined) throw new KitError(ERROR_CODES.USAGE, `canonical JSON: property "${k}" is undefined`);
      parts.push(`${serializeString(k)}:${serialize(v[k], depth + 1)}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new KitError(ERROR_CODES.USAGE, `canonical JSON: unsupported value of type ${typeof v}`);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return serialize(value, 0);
}

/**
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function canonicalBytes(value) {
  return new TextEncoder().encode(canonicalJson(value));
}
