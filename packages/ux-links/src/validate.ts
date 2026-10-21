import { fail, type LinkErrorCode } from './errors.js';

/**
 * Strict object-shape check for untrusted (e.g. JSON-imported) data.
 *
 * @remarks Rejects non-plain objects, arrays, symbol keys, accessor properties
 * (so no attacker getter ever runs), unknown keys (this also rejects
 * `__proto__`/`constructor` injected as own keys) and missing required keys.
 * @security Defence against prototype-pollution-style and mass-assignment input.
 * @returns The same object typed as a record of unknowns.
 */
export function exactRecord(
  v: unknown,
  allowed: readonly string[],
  required: readonly string[],
  code: LinkErrorCode,
  path: string,
): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(code, path);
  const proto = Object.getPrototypeOf(v) as unknown;
  if (proto !== Object.prototype && proto !== null) return fail(code, path);
  if (Object.getOwnPropertySymbols(v).length > 0) return fail(code, path);
  const rec = v as Record<string, unknown>;
  for (const k of Object.getOwnPropertyNames(rec)) {
    if (!allowed.includes(k)) return fail(code, path);
    const d = Object.getOwnPropertyDescriptor(rec, k);
    if (d === undefined || !('value' in d)) return fail(code, path);
  }
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(rec, k)) return fail(code, `${path}.${k}`);
  }
  return rec;
}

/** True for a non-negative safe integer. */
export function isUint(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** True for a positive safe integer. */
export function isPosInt(v: unknown): v is number {
  return isUint(v) && v > 0;
}
