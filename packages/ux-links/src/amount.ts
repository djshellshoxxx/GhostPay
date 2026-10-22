import { fail } from './errors.js';

/** Maximum fractional digits supported anywhere in this package. */
export const MAX_DECIMALS = 18;
const MAX_ATOMIC = (1n << 128n) - 1n;
const CANONICAL = /^(0|[1-9][0-9]{0,38})(?:\.([0-9]{1,18}))?$/;

/**
 * Parses a canonical, positive-or-zero decimal string into atomic units.
 *
 * @remarks Canonical means: no sign, no exponent, no whitespace, no leading
 * zeros, no trailing fractional zeros ("1.50" is rejected, "1.5" accepted), at
 * most `decimals` fractional digits, value below 2^128. Canonical-only input
 * removes malleability between equal amounts.
 * @param s Decimal string.
 * @param decimals Asset precision, integer 0..18.
 * @param opts `allowZero` permits "0" (default false).
 * @returns Amount in atomic units.
 * @throws {LinkError} `AMOUNT` on any violation.
 * @security Never uses floating point.
 */
export function parseAmount(s: unknown, decimals: number, opts: { allowZero?: boolean } = {}): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS)
    return fail('AMOUNT', 'decimals');
  if (typeof s !== 'string') return fail('AMOUNT', 'amount');
  const m = CANONICAL.exec(s);
  if (m === null) return fail('AMOUNT', 'amount');
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (frac.length > decimals || frac.endsWith('0')) return fail('AMOUNT', 'amount');
  const atomic = BigInt(whole + frac.padEnd(decimals, '0'));
  if (atomic > MAX_ATOMIC) return fail('AMOUNT', 'amount');
  if (atomic === 0n && opts.allowZero !== true) return fail('AMOUNT', 'amount');
  return atomic;
}

/**
 * Formats atomic units as a canonical decimal string (inverse of {@link parseAmount}).
 *
 * @param atomic Non-negative amount below 2^128.
 * @param decimals Integer 0..18.
 * @throws {LinkError} `AMOUNT` for negative/oversized values or bad decimals.
 */
export function formatAmount(atomic: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS)
    return fail('AMOUNT', 'decimals');
  if (typeof atomic !== 'bigint' || atomic < 0n || atomic > MAX_ATOMIC) return fail('AMOUNT', 'amount');
  const digits = atomic.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

/** Number of fractional digits in a canonical amount string (0 when none). */
export function fractionDigits(s: string): number {
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Validates an asset symbol: `[A-Z][A-Z0-9]{1,11}`. @throws {LinkError} `PARAM`. */
export function validateAsset(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Z][A-Z0-9]{1,11}$/.test(v)) return fail('PARAM', 'asset');
  return v;
}
