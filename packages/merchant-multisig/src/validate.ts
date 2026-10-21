import { MultisigError, type MultisigErrorCode } from './errors.js';

/** Returns `value` as a record if it is a plain (prototype Object or null) non-array object. */
export function asRecord(value: unknown, code: MultisigErrorCode, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new MultisigError(code, path);
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new MultisigError(code, path);
  return value as Record<string, unknown>;
}

/**
 * Reads exactly the listed own data properties; rejects unknown keys, missing keys
 * and accessor properties (getters could return different values on each read).
 */
export function readExact(
  value: unknown,
  keys: readonly string[],
  code: MultisigErrorCode,
  path: string,
): Record<string, unknown> {
  const rec = asRecord(value, code, path);
  const own = Object.keys(rec);
  if (own.length !== keys.length) throw new MultisigError(code, path);
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(rec, k);
    if (d === undefined || !('value' in d)) throw new MultisigError(code, path === '' ? k : `${path}.${k}`);
    out[k] = d.value;
  }
  return out;
}

/** Validates a string against a regex (anchored by the caller). */
export function str(value: unknown, re: RegExp, code: MultisigErrorCode, path: string): string {
  if (typeof value !== 'string' || !re.test(value)) throw new MultisigError(code, path);
  return value;
}

/** Validates an integer in [min, max]. */
export function int(value: unknown, min: number, max: number, code: MultisigErrorCode, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new MultisigError(code, path);
  }
  return value;
}

/** Validates a canonical decimal string (no sign, no leading zeros) in [min, max]. */
export function decimal(
  value: unknown,
  min: bigint,
  max: bigint,
  code: MultisigErrorCode,
  path: string,
): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/.test(value))
    throw new MultisigError(code, path);
  const n = BigInt(value);
  if (n < min || n > max) throw new MultisigError(code, path);
  return n;
}

/** Like {@link decimal} but returns the validated string. */
export function decimalString(
  value: unknown,
  min: bigint,
  max: bigint,
  code: MultisigErrorCode,
  path: string,
): string {
  decimal(value, min, max, code, path);
  return value as string;
}

/** Account id: lowercase slug, 1..64 chars. */
export const ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Compressed secp256k1 public key, lowercase hex. */
export const PUBKEY_RE = /^0[23][0-9a-f]{64}$/;
/** Controller label (who physically controls a key), case-insensitive. */
export const CONTROLLER_RE = /^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,63}$/;
/** Asset identifier (CAIP-19-like). */
export const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9:/._-]{0,127}$/;
/** Destination address / account string. */
export const DEST_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
/** Invoice id referenced by a refund. */
export const INVOICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** 32-byte lowercase hex. */
export const HEX32_RE = /^[0-9a-f]{64}$/;
/** 64-byte compact signature, lowercase hex. */
export const SIG_RE = /^[0-9a-f]{128}$/;
