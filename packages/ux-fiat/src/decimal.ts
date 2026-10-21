import { err, ok, type Result, type RoundingMode } from './types.js';

/** Max absolute magnitude of any base-unit amount (uint256-sized, 78 digits). */
export const MAX_AMOUNT_DIGITS = 78;
export const MAX_ASSET_DECIMALS = 36;
export const MAX_FIAT_DECIMALS = 18;

/** 10n ** n for small non-negative integer n. */
export function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** @returns true when `n` is an integer in [0, max]. */
export function isSmallInt(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** Validate a base-unit amount (bigint, bounded magnitude). */
export function checkAmount(amount: unknown): Result<bigint> {
  if (typeof amount !== 'bigint') return err('bad-amount', 'amount must be a bigint');
  if (absBig(amount) >= pow10(MAX_AMOUNT_DIGITS)) {
    return err('overflow', 'amount exceeds supported magnitude');
  }
  return ok(amount);
}

/**
 * Integer division n/d (d > 0) with an explicit rounding mode.
 * @security Exact; never uses floats. Caller guarantees d > 0.
 */
export function divRound(n: bigint, d: bigint, mode: RoundingMode): bigint {
  if (d <= 0n) throw new RangeError('divisor must be positive');
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const neg = n < 0n;
  const away = neg ? q - 1n : q + 1n;
  switch (mode) {
    case 'trunc':
      return q;
    case 'away':
      return away;
    case 'floor':
      return neg ? away : q;
    case 'ceil':
      return neg ? q : away;
    default: {
      const twice = 2n * absBig(r);
      if (twice > d) return away;
      if (twice < d) return q;
      if (mode === 'half-away') return away;
      if (mode === 'half-trunc') return q;
      return q % 2n === 0n ? q : away; // half-even
    }
  }
}

const DEC_RE = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

/**
 * Strictly parse an unsigned plain decimal string into digits/scale.
 * Rejects sign, whitespace, exponent, empty parts, leading zeros ("01").
 */
export function parseUnsignedDecimal(
  s: unknown,
  maxIntDigits: number,
  maxFracDigits: number,
): Result<{ num: bigint; scale: number }> {
  if (typeof s !== 'string') return err('bad-input', 'expected a string');
  const m = DEC_RE.exec(s);
  if (!m) return err('bad-input', 'not a plain unsigned decimal');
  const int = m[1] ?? '';
  const frac = m[2] ?? '';
  if (int.length > maxIntDigits) return err('overflow', 'too many integer digits');
  if (frac.length > maxFracDigits) return err('excess-precision', 'too many fractional digits');
  return ok({ num: BigInt(int + frac), scale: frac.length });
}

/**
 * Parse a human decimal string into base units. Excess fractional digits are
 * an error (never silently truncated) unless a rounding mode is supplied.
 */
export function parseUnits(s: string, decimals: number, mode?: RoundingMode): Result<bigint> {
  if (!isSmallInt(decimals, MAX_ASSET_DECIMALS)) return err('bad-decimals', 'bad decimals');
  const p = parseUnsignedDecimal(s, MAX_AMOUNT_DIGITS, mode ? 4 * MAX_AMOUNT_DIGITS : decimals);
  if (!p.ok) return p;
  const { num, scale } = p.value;
  let v: bigint;
  if (scale <= decimals) v = num * pow10(decimals - scale);
  else v = divRound(num, pow10(scale - decimals), mode ?? 'trunc');
  return checkAmount(v);
}

/** Canonical decimal string for a base-unit amount ("-" prefix if negative, trailing zeros trimmed). */
export function formatUnits(amount: bigint, decimals: number): Result<string> {
  const a = checkAmount(amount);
  if (!a.ok) return a;
  if (!isSmallInt(decimals, MAX_ASSET_DECIMALS)) return err('bad-decimals', 'bad decimals');
  const neg = amount < 0n;
  const digits = absBig(amount)
    .toString()
    .padStart(decimals + 1, '0');
  const int = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return ok(`${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`);
}
