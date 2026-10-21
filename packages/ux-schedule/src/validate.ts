import { err, ok, type Result } from './result.js';

/** Strict plain-object check (rejects arrays, null, class instances). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Reject unknown keys on untrusted objects.
 * @security Prevents smuggling of unvalidated fields through imports.
 */
export function checkKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  what: string,
): Result<true> {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return err('unknown_field', `${what}: unknown field "${k}"`);
  }
  return ok(true);
}

const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const TOKEN_RE = /^[A-Za-z0-9:_.-]{1,64}$/;
const ADDR_RE = /^[\x21-\x7e]{1,128}$/;
const AMOUNT_RE = /^[1-9][0-9]{0,77}$/;

export function validId(v: unknown, what: string): Result<string> {
  return typeof v === 'string' && ID_RE.test(v) ? ok(v) : err('bad_id', `${what}: invalid id`);
}

export function validToken(v: unknown, what: string): Result<string> {
  return typeof v === 'string' && TOKEN_RE.test(v)
    ? ok(v)
    : err('bad_token', `${what}: invalid identifier`);
}

/** Recipient is chain-specific and checked elsewhere; here only printable ASCII, no spaces. */
export function validRecipient(v: unknown): Result<string> {
  return typeof v === 'string' && ADDR_RE.test(v)
    ? ok(v)
    : err('bad_recipient', 'recipient must be 1-128 printable ASCII characters without spaces');
}

/** Positive integer amount in base units, as a decimal string (no float, no leading zeros). */
export function validAmount(v: unknown): Result<string> {
  return typeof v === 'string' && AMOUNT_RE.test(v)
    ? ok(v)
    : err('bad_amount', 'amount must be a positive integer string of base units');
}

/** Text with no control characters and no bidi override characters. */
export function validText(v: unknown, what: string, min: number, max: number): Result<string> {
  if (typeof v !== 'string') return err('bad_text', `${what}: must be a string`);
  const cps = Array.from(v);
  if (cps.length < min || cps.length > max) {
    return err('bad_text', `${what}: length must be ${min}-${max} characters`);
  }
  for (const ch of cps) {
    const c = ch.codePointAt(0) ?? 0;
    const bidi = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || bidi || c === 0x2028 || c === 0x2029) {
      return err('bad_text', `${what}: contains a forbidden control character`);
    }
  }
  return ok(v);
}

export function validInt(v: unknown, what: string, min: number, max: number): Result<number> {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
    ? ok(v)
    : err('bad_int', `${what}: must be an integer in ${min}..${max}`);
}
