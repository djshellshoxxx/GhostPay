import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { MAX_UINT256, ZERO_ADDRESS } from '@ghostpay/chain-adapters';
import { invalid } from './errors.js';

/** Decoded plain JSON object guarded against prototype tricks. */
export type JsonObject = Readonly<Record<string, unknown>>;

/**
 * Asserts `v` is a plain JSON object with exactly the allowed keys.
 *
 * @param v Untrusted value.
 * @param field Fixed field label used in the error class.
 * @param required Keys that must be present.
 * @param optional Keys that may be present.
 * @returns The object.
 * @throws {RelayerError} `invalid_<field>` (400) for non-objects, unknown keys or missing keys.
 */
export function parseObject(v: unknown, field: string, required: readonly string[], optional: readonly string[] = []): JsonObject {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw invalid(field);
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== null && proto !== Object.prototype) throw invalid(field);
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (!required.includes(k) && !optional.includes(k)) throw invalid(field);
  }
  for (const k of required) {
    if (rec[k] === undefined) throw invalid(field);
  }
  return rec;
}

/**
 * Parses a non-zero EVM address (hex, EIP-55 checksum enforced when mixed case).
 *
 * @param v Untrusted value.
 * @param field Field label.
 * @returns Checksummed address.
 * @throws {RelayerError} `invalid_<field>`.
 */
export function parseAddress(v: unknown, field: string): Address {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v) || !isAddress(v, { strict: true })) throw invalid(field);
  if (v.toLowerCase() === ZERO_ADDRESS) throw invalid(field);
  return getAddress(v);
}

/**
 * Parses a canonical unsigned decimal string (no sign, no leading zeros, no whitespace).
 *
 * @param v Untrusted value.
 * @param field Field label.
 * @param min Inclusive lower bound (default 0).
 * @param max Inclusive upper bound (default uint256 max).
 * @returns The value.
 * @throws {RelayerError} `invalid_<field>`.
 */
export function parseUint(v: unknown, field: string, min = 0n, max: bigint = MAX_UINT256): bigint {
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/.test(v)) throw invalid(field);
  const n = BigInt(v);
  if (n < min || n > max) throw invalid(field);
  return n;
}

/**
 * Parses a JSON number that must be a safe integer within bounds.
 *
 * @param v Untrusted value.
 * @param field Field label.
 * @param min Inclusive lower bound.
 * @param max Inclusive upper bound.
 * @returns The integer.
 * @throws {RelayerError} `invalid_<field>`.
 */
export function parseInt53(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw invalid(field);
  return v;
}

/**
 * Parses fixed-length hex bytes.
 *
 * @param v Untrusted value.
 * @param field Field label.
 * @param bytes Exact byte length.
 * @returns Lower-cased hex.
 * @throws {RelayerError} `invalid_<field>`.
 */
export function parseHex(v: unknown, field: string, bytes: number): Hex {
  if (typeof v !== 'string' || v.length !== 2 + bytes * 2 || !/^0x[0-9a-fA-F]+$/.test(v)) throw invalid(field);
  return v.toLowerCase() as Hex;
}
