import { LedgerError } from './errors.js';

/** Rounding rules for integer division. */
export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

const MINOR_RE = /^(?:0|[1-9][0-9]{0,77})$/;
const EXPONENTS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  BHD: 3,
  KWD: 3,
  JOD: 3,
  OMR: 3,
  TND: 3,
};

/**
 * Parse a non-negative integer decimal string (fiat minor units) into bigint.
 *
 * @param s Decimal string, no sign, no leading zeros, at most 78 digits.
 * @returns The value.
 * @throws {LedgerError} `bad-amount` for anything else (floats, signs, exponents, whitespace).
 * @security Trust boundary: amounts come from payment observers and stored invoices.
 */
export function parseMinor(s: unknown): bigint {
  if (typeof s !== 'string' || !MINOR_RE.test(s)) throw new LedgerError('bad-amount');
  return BigInt(s);
}

/** Number of minor-unit decimals for a currency (ISO-4217 subset; default 2). */
export function currencyExponent(currency: string, overrides?: Readonly<Record<string, number>>): number {
  const o = overrides?.[currency];
  if (o !== undefined) {
    if (!Number.isInteger(o) || o < 0 || o > 18) throw new LedgerError('bad-exponent');
    return o;
  }
  return EXPONENTS[currency] ?? 2;
}

/**
 * Format minor units as a plain decimal string (`1234n`, exp 2 -> `12.34`).
 *
 * @param minor Amount, may be negative.
 * @param exponent Decimals of the currency.
 * @returns Decimal string with exactly `exponent` fraction digits.
 */
export function formatMinor(minor: bigint, exponent: number): string {
  const neg = minor < 0n;
  const digits = (neg ? -minor : minor).toString().padStart(exponent + 1, '0');
  const int = digits.slice(0, digits.length - exponent);
  const frac = digits.slice(digits.length - exponent);
  return `${neg ? '-' : ''}${int}${exponent > 0 ? `.${frac}` : ''}`;
}

/**
 * Integer division `n / d` with an explicit rounding rule.
 *
 * @param n Numerator (non-negative).
 * @param d Denominator (positive).
 * @param mode Rounding rule; ties apply to half-up (away from zero) and half-even.
 * @returns Rounded quotient.
 * @throws {LedgerError} `bad-division` on negative numerator or non-positive denominator.
 */
export function roundDiv(n: bigint, d: bigint, mode: RoundingMode): bigint {
  if (n < 0n || d <= 0n) throw new LedgerError('bad-division');
  const q = n / d;
  const r = n % d;
  if (r === 0n || mode === 'down') return q;
  if (mode === 'up') return q + 1n;
  const twice = r * 2n;
  if (twice > d) return q + 1n;
  if (twice < d) return q;
  return mode === 'half-up' || q % 2n === 1n ? q + 1n : q;
}

/**
 * Tax on a subtotal: `subtotal * rateBps / 10000` with the given rounding rule.
 *
 * @param subtotalMinor Subtotal in minor units.
 * @param rateBps Integer basis points, 0..100000.
 * @param mode Rounding rule.
 * @returns Tax in minor units.
 */
export function computeTax(subtotalMinor: bigint, rateBps: number, mode: RoundingMode = 'half-up'): bigint {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 100_000) throw new LedgerError('bad-rate');
  return roundDiv(subtotalMinor * BigInt(rateBps), 10_000n, mode);
}
