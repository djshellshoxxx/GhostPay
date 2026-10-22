import { ExportError } from './errors.js';

/** Largest value representable in a uint256 (on-chain amount ceiling). */
export const MAX_AMOUNT = (1n << 256n) - 1n;
/** Maximum supported token decimals. */
export const MAX_DECIMALS = 38;

/** Throws unless `decimals` is an integer in [0, MAX_DECIMALS]. */
export function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new ExportError('INVALID_AMOUNT', 'decimals must be an integer in 0..38');
  }
}

/**
 * Formats base units as an exact decimal string using only bigint arithmetic
 * (no floating point). Fixed `decimals` fractional digits unless `trim`.
 *
 * @example formatUnits(1500000n, 6) === '1.500000'; formatUnits(-5n, 1) === '-0.5'
 */
export function formatUnits(value: bigint, decimals: number, trim = false): string {
  assertDecimals(decimals);
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const digits = abs.toString().padStart(decimals + 1, '0');
  const int = digits.slice(0, digits.length - decimals);
  let frac = digits.slice(digits.length - decimals);
  if (trim) frac = frac.replace(/0+$/, '');
  const body = frac === '' ? int : `${int}.${frac}`;
  return neg ? `-${body}` : body;
}

const UNSIGNED = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

/**
 * Strictly parses an unsigned decimal string into base units.
 * Rejects exponents, signs, whitespace, leading zeros, thousands separators,
 * more fractional digits than `decimals` (no rounding) and values > uint256.
 *
 * @security Untrusted input: bounded length (<= 120 chars) before regex.
 */
export function parseUnits(text: string, decimals: number): bigint {
  assertDecimals(decimals);
  if (text.length > 120) throw new ExportError('INVALID_AMOUNT', 'amount too long');
  const m = UNSIGNED.exec(text);
  if (!m) throw new ExportError('INVALID_AMOUNT', 'amount is not a plain decimal number');
  const frac = m[2] ?? '';
  if (frac.length > decimals)
    throw new ExportError('INVALID_AMOUNT', 'amount has too many fractional digits');
  const v = BigInt((m[1] ?? '0') + frac.padEnd(decimals, '0'));
  if (v > MAX_AMOUNT) throw new ExportError('INVALID_AMOUNT', 'amount exceeds uint256');
  return v;
}
