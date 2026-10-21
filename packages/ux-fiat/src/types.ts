/**
 * Shared types for fiat display. All money is BigInt; no floating point anywhere.
 * @security Pure data types. No I/O, no clocks, no network.
 */

/** Stable machine-readable error codes (map to i18n keys in the UI layer). */
export type FiatErrorCode =
  | 'bad-amount'
  | 'bad-decimals'
  | 'bad-rate-format'
  | 'rate-zero'
  | 'rate-negative'
  | 'rate-too-large'
  | 'rate-too-small'
  | 'bad-timestamp'
  | 'bad-source'
  | 'bad-asset'
  | 'bad-fiat'
  | 'rate-mismatch'
  | 'bad-policy'
  | 'bad-rounding'
  | 'bad-format'
  | 'bad-input'
  | 'excess-precision'
  | 'rate-jump'
  | 'overflow';

export interface FiatError {
  readonly code: FiatErrorCode;
  readonly message: string;
}

export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FiatError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(code: FiatErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});

/**
 * Rounding modes for integer division. "trunc" etc. are sign-aware so that
 * behaviour for negative deltas is explicit.
 * - trunc: toward zero; away: away from zero; floor: toward -inf; ceil: toward +inf
 * - half-away / half-trunc / half-even: nearest, ties broken as named.
 */
export type RoundingMode = 'trunc' | 'away' | 'floor' | 'ceil' | 'half-away' | 'half-trunc' | 'half-even';

export const ROUNDING_MODES: readonly RoundingMode[] = [
  'trunc',
  'away',
  'floor',
  'ceil',
  'half-away',
  'half-trunc',
  'half-even',
];

/** Rate quote injected by the caller. This package never fetches rates. */
export interface RateQuote {
  /** Asset identifier the rate prices (opaque, e.g. "ETH"). */
  readonly asset: string;
  /** ISO-4217-style uppercase fiat code, e.g. "USD". */
  readonly fiat: string;
  /** Fiat per ONE whole token, plain decimal string (no exponent, no sign, no spaces). */
  readonly rate: string;
  /** Quote time, integer milliseconds since epoch (as reported by the source). */
  readonly timestampMs: number;
  /** Human label of where the rate came from (untrusted display text). */
  readonly source: string;
}

/** A validated rate: rate = num / 10^scale. */
export interface ParsedRate {
  readonly num: bigint;
  readonly scale: number;
  readonly asset: string;
  readonly fiat: string;
  readonly timestampMs: number;
  readonly source: string;
}

export interface AssetInfo {
  readonly id: string;
  /** Base-unit decimals (0..36). */
  readonly decimals: number;
}

export interface FiatInfo {
  readonly code: string;
  /** Minor-unit decimals (0..18), e.g. 2 for USD, 0 for JPY. */
  readonly decimals: number;
}
