import { fail } from './errors.js';

/** Exact decimal: value = `mantissa` / 10^`scale`. */
export interface Decimal {
  readonly mantissa: bigint;
  readonly scale: number;
  /** Canonical text: no leading zeros, no trailing fractional zeros, no exponent. */
  readonly canonical: string;
}

const DEC = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

/**
 * Strict decimal-string parser (bigint arithmetic, never floats). Rejects signs, exponents, separators, empty
 * integer/fraction parts, leading zeros ("01"), zero values and excess precision.
 *
 * @param maxScale Maximum fractional digits after trailing zeros are removed.
 * @param max Inclusive upper bound of the value in units of 10^-maxScale.
 */
export function parseDecimal(s: string, maxScale: number, max: bigint): Decimal {
  if (typeof s !== 'string' || s.length > 100) return fail('INVALID_AMOUNT');
  const m = DEC.exec(s);
  if (!m) return fail('INVALID_AMOUNT');
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > maxScale) return fail('INVALID_AMOUNT');
  const mantissa = BigInt(m[1] + frac);
  if (mantissa === 0n) return fail('INVALID_AMOUNT');
  const scaled = mantissa * 10n ** BigInt(maxScale - frac.length);
  if (scaled > max) return fail('AMOUNT_OVERFLOW');
  return { mantissa, scale: frac.length, canonical: frac.length === 0 ? m[1]! : `${m[1]}.${frac}` };
}

/** Converts a {@link Decimal} to integer atomic units; rejects values needing more than `decimals` places. */
export function toAtomic(d: Decimal, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) return fail('INVALID_AMOUNT');
  if (d.scale > decimals) return fail('INVALID_AMOUNT');
  return d.mantissa * 10n ** BigInt(decimals - d.scale);
}

/** Formats a non-negative integer of atomic units as a canonical decimal string. */
export function formatAtomic(units: bigint, decimals: number): string {
  if (
    typeof units !== 'bigint' ||
    units <= 0n ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 77
  ) {
    return fail('INVALID_AMOUNT');
  }
  const s = units.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac === '' ? int : `${int}.${frac}`;
}
