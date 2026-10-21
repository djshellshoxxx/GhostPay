import { checkAmount, isSmallInt, MAX_FIAT_DECIMALS, pow10 } from './decimal.js';
import { err, ok, type Result } from './types.js';

/** Locale data supplied by the caller (this package has no locale tables). */
export interface FiatFormat {
  /** Currency symbol, e.g. "$" or "CHF" (untrusted text, passed through as a part). */
  readonly symbol: string;
  readonly symbolPosition: 'prefix' | 'suffix';
  /** Insert a space between symbol and number. */
  readonly symbolSpace: boolean;
  /** Thousands separator; '' disables grouping. */
  readonly groupSeparator: string;
  /** Decimal separator, e.g. "." or ",". */
  readonly decimalSeparator: string;
  /** Group sizes: 3 => 1,234,567; 'indian' => 12,34,567. */
  readonly grouping: 3 | 'indian';
  /** Sign text for negatives, e.g. "-" or U+2212. */
  readonly minusSign: string;
  /** Fraction digits shown (<= fiat decimals; value is NOT re-rounded, must be exact). */
  readonly minFractionDigits?: number;
}

export type FormatPartType =
  | 'sign'
  | 'symbol'
  | 'space'
  | 'integer'
  | 'group'
  | 'decimal'
  | 'fraction';

export interface FormatPart {
  readonly type: FormatPartType;
  readonly value: string;
}

const BAD_SEP_RE = /[0-9\p{Cc}\p{Cf}]/u;

function checkFormat(f: FiatFormat, decimals: number): Result<true> {
  const sepOk = (s: string, max: number, allowEmpty: boolean): boolean =>
    typeof s === 'string' &&
    (allowEmpty || s.length > 0) &&
    s.length <= max &&
    !BAD_SEP_RE.test(s);
  if (!sepOk(f.symbol, 8, true) || !sepOk(f.minusSign, 2, false)) {
    return err('bad-format', 'bad symbol or minus sign');
  }
  if (!sepOk(f.groupSeparator, 2, true) || !sepOk(f.decimalSeparator, 2, false)) {
    return err('bad-format', 'bad separator');
  }
  if (f.groupSeparator === f.decimalSeparator) return err('bad-format', 'separators must differ');
  if (f.symbolPosition !== 'prefix' && f.symbolPosition !== 'suffix') {
    return err('bad-format', 'bad symbol position');
  }
  if (f.grouping !== 3 && f.grouping !== 'indian') return err('bad-format', 'bad grouping');
  if (f.minFractionDigits !== undefined && !isSmallInt(f.minFractionDigits, decimals)) {
    return err('bad-format', 'minFractionDigits out of range');
  }
  return ok(true);
}

function groupDigits(int: string, f: FiatFormat): string[] {
  if (f.groupSeparator === '' || int.length <= 3) return [int];
  const out: string[] = [];
  let rest = int;
  out.unshift(rest.slice(-3));
  rest = rest.slice(0, -3);
  const size = f.grouping === 3 ? 3 : 2;
  while (rest.length > 0) {
    out.unshift(rest.slice(-size));
    rest = rest.slice(0, -size);
  }
  return out;
}

/**
 * Format fiat minor units into typed parts (UI joins/styles them). Locale-neutral:
 * every symbol/separator comes from `fmt`. Trailing zeros are kept to `decimals`
 * unless minFractionDigits is lower, in which case only zeros are trimmed
 * (value is never rounded here).
 * @security Pure; separators are validated so digits can't be spoofed.
 */
export function formatFiatParts(
  minor: bigint,
  decimals: number,
  fmt: FiatFormat,
): Result<FormatPart[]> {
  const a = checkAmount(minor);
  if (!a.ok) return a;
  if (!isSmallInt(decimals, MAX_FIAT_DECIMALS)) return err('bad-decimals', 'bad fiat decimals');
  const c = checkFormat(fmt, decimals);
  if (!c.ok) return c;
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const scale = pow10(decimals);
  const intStr = (abs / scale).toString();
  let frac = decimals === 0 ? '' : (abs % scale).toString().padStart(decimals, '0');
  const minFrac = fmt.minFractionDigits ?? decimals;
  while (frac.length > minFrac && frac.endsWith('0')) frac = frac.slice(0, -1);

  const num: FormatPart[] = [];
  groupDigits(intStr, fmt).forEach((g, i, arr) => {
    num.push({ type: 'integer', value: g });
    if (i < arr.length - 1) num.push({ type: 'group', value: fmt.groupSeparator });
  });
  if (frac.length > 0) {
    num.push({ type: 'decimal', value: fmt.decimalSeparator }, { type: 'fraction', value: frac });
  }
  const parts: FormatPart[] = [];
  if (neg) parts.push({ type: 'sign', value: fmt.minusSign });
  const sym: FormatPart[] = fmt.symbol ? [{ type: 'symbol', value: fmt.symbol }] : [];
  const sp: FormatPart[] = fmt.symbol && fmt.symbolSpace ? [{ type: 'space', value: ' ' }] : [];
  if (fmt.symbolPosition === 'prefix') parts.push(...sym, ...sp, ...num);
  else parts.push(...num, ...sp, ...sym);
  return ok(parts);
}

/** Convenience: concatenate parts. */
export function joinParts(parts: readonly FormatPart[]): string {
  return parts.map((p) => p.value).join('');
}

/**
 * Parse user-typed fiat text into minor units using the locale's separators.
 * Strict: only digits, one decimal separator, optional group separators between
 * digit runs; excess fractional digits are rejected (not rounded).
 */
export function parseFiatInput(
  text: string,
  decimals: number,
  fmt: Pick<FiatFormat, 'groupSeparator' | 'decimalSeparator'>,
): Result<bigint> {
  if (!isSmallInt(decimals, MAX_FIAT_DECIMALS)) return err('bad-decimals', 'bad fiat decimals');
  if (typeof text !== 'string' || text.length === 0 || text.length > 100) {
    return err('bad-input', 'empty or oversized input');
  }
  const { groupSeparator: g, decimalSeparator: d } = fmt;
  if (d.length === 0 || d === g || BAD_SEP_RE.test(d) || BAD_SEP_RE.test(g)) {
    return err('bad-format', 'bad separators');
  }
  const idx = text.indexOf(d);
  if (idx !== text.lastIndexOf(d)) return err('bad-input', 'multiple decimal separators');
  const intRaw = idx === -1 ? text : text.slice(0, idx);
  const fracRaw = idx === -1 ? '' : text.slice(idx + d.length);
  const intDigits = g === '' ? intRaw : intRaw.split(g).join('');
  if (g !== '' && (intRaw.startsWith(g) || intRaw.endsWith(g) || intRaw.includes(g + g))) {
    return err('bad-input', 'misplaced group separator');
  }
  if (!/^[0-9]+$/.test(intDigits) || (fracRaw !== '' && !/^[0-9]+$/.test(fracRaw))) {
    return err('bad-input', 'not a number');
  }
  if (idx !== -1 && fracRaw === '') return err('bad-input', 'dangling decimal separator');
  if (fracRaw.length > decimals) return err('excess-precision', 'too many fractional digits');
  const v = BigInt(intDigits + fracRaw.padEnd(decimals, '0'));
  return checkAmount(v);
}
