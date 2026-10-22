import { fail } from './errors.js';

/** A translatable message: i18n key plus plain string/number params (bigints are pre-stringified). */
export interface MessageRef {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * Builds a {@link MessageRef}.
 *
 * @param key i18n key.
 * @param params Plain parameters.
 * @returns Message reference.
 */
export function msg(key: string, params: Readonly<Record<string, string | number>> = {}): MessageRef {
  return { key, params };
}

/** Sanity ceiling for any amount accepted here (2^200); far above any real balance, keeps math bounded. */
export const MAX_AMOUNT: bigint = 1n << 200n;

/**
 * Asserts a bigint in `[min, max]`.
 *
 * @param v Candidate.
 * @param what Field name.
 * @param min Inclusive minimum (default 0).
 * @param max Inclusive maximum (default {@link MAX_AMOUNT}).
 * @returns The value.
 * @throws {UxFeesError} INVALID_INPUT.
 */
export function bigintIn(v: unknown, what: string, min = 0n, max: bigint = MAX_AMOUNT): bigint {
  if (typeof v !== 'bigint' || v < min || v > max) return fail(`${what} out of range`);
  return v;
}

/**
 * Asserts a safe integer in `[min, max]`.
 *
 * @param v Candidate.
 * @param what Field name.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns The value.
 * @throws {UxFeesError} INVALID_INPUT.
 */
export function intIn(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    return fail(`${what} out of range`);
  return v;
}

/**
 * Ceiling division for non-negative operands.
 *
 * @param a Numerator.
 * @param b Positive denominator.
 * @returns `ceil(a / b)`.
 */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/**
 * Formats base units as an exact plain decimal string (no locale, no rounding, trailing zeros trimmed).
 *
 * @remarks Locale formatting is the UI layer's job (ux-i18n); this string is a stable, exact fallback.
 * @param v Non-negative amount.
 * @param decimals Token decimals `0..36`.
 * @returns e.g. `1.5`, `0.000001`, `42`.
 * @throws {UxFeesError} INVALID_INPUT.
 */
export function formatUnits(v: bigint, decimals: number): string {
  bigintIn(v, 'amount');
  intIn(decimals, 'decimals', 0, 36);
  const s = v.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

/** Symbols are untrusted token metadata: allow only a tight ASCII set (anti-homograph, anti-markup). */
const SYMBOL_RE = /^[A-Za-z0-9.$_-]{1,12}$/;

/**
 * Validates a display symbol.
 *
 * @param s Candidate.
 * @param what Field name.
 * @returns The symbol.
 * @throws {UxFeesError} INVALID_INPUT.
 */
export function symbolOf(s: unknown, what: string): string {
  if (typeof s !== 'string' || !SYMBOL_RE.test(s)) return fail(`${what} invalid symbol`);
  return s;
}

/** A `Record` own-key lookup that cannot hit `Object.prototype` members. */
export function ownGet<T>(rec: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(rec, key) ? rec[key] : undefined;
}
