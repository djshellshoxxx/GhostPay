import { ensure } from './errors.js';

/**
 * Rounds `x` UP to `sig` significant decimal digits (used for sponsor fees and gas funding amounts so
 * the public value does not reveal an exact estimate; `anonymization-research.md` 4.4).
 *
 * @param x Non-negative amount.
 * @param sig Significant digits to keep, >= 1.
 * @returns The smallest value >= `x` with at most `sig` significant digits.
 */
export function roundUpSigFigs(x: bigint, sig = 2): bigint {
  ensure(x >= 0n, 'amount must be >= 0');
  ensure(Number.isInteger(sig) && sig >= 1, 'sig must be an integer >= 1');
  const digits = x.toString().length;
  if (digits <= sig) return x;
  const unit = 10n ** BigInt(digits - sig);
  return ((x + unit - 1n) / unit) * unit;
}

/**
 * Ceiling division for non-negative bigints.
 *
 * @param a Numerator, >= 0.
 * @param b Denominator, > 0.
 * @returns `ceil(a / b)`.
 */
export function ceilDiv(a: bigint, b: bigint): bigint {
  ensure(a >= 0n && b > 0n, 'ceilDiv domain');
  return (a + b - 1n) / b;
}
