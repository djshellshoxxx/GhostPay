import { BillingError } from './errors.js';

/** Largest accepted amount: 2^256 - 1 (token base units). */
export const MAX_AMOUNT = (1n << 256n) - 1n;
const AMOUNT_RE = /^(?:0|[1-9][0-9]{0,77})$/;

/**
 * Parses a non-negative integer decimal string into a bigint.
 *
 * @param s Candidate (no sign, no leading zeros, no whitespace, no exponent).
 * @returns The value.
 * @throws {BillingError} `AMOUNT` when malformed or above 2^256-1.
 * @security Untrusted input (CSV, API). Floats are never accepted.
 */
export function parseAmount(s: unknown): bigint {
  if (typeof s !== 'string' || !AMOUNT_RE.test(s)) throw new BillingError('AMOUNT', 'invalid amount');
  const v = BigInt(s);
  if (v > MAX_AMOUNT) throw new BillingError('AMOUNT', 'amount too large');
  return v;
}

/**
 * Parses a human decimal such as `12.5` into base units with exactly `decimals` precision.
 *
 * @param s e.g. `"1250.75"`; at most `decimals` fractional digits, no sign/exponent.
 * @param decimals 0..36.
 * @returns Base units as bigint.
 * @throws {BillingError} `AMOUNT`.
 * @security Rejects excess precision instead of rounding (no silent value change).
 */
export function parseDecimal(s: unknown, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new BillingError('AMOUNT', 'invalid decimals');
  if (typeof s !== 'string') throw new BillingError('AMOUNT', 'invalid amount');
  const m = /^(0|[1-9][0-9]{0,40})(?:\.([0-9]{1,36}))?$/.exec(s);
  if (m === null) throw new BillingError('AMOUNT', 'invalid amount');
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new BillingError('AMOUNT', 'too many decimals');
  return parseAmount(`${m[1] as string}${frac.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, ''));
}

/** Formats base units as a decimal string with `decimals` fractional digits (trailing zeros kept). */
export function formatDecimal(v: bigint, decimals: number): string {
  if (v < 0n) throw new BillingError('AMOUNT', 'negative amount');
  const s = v.toString().padStart(decimals + 1, '0');
  return decimals === 0 ? s : `${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`;
}

/** Ceiling-free basis-point share: floor(v * bps / 10000). */
export function bpsOf(v: bigint, bps: number): bigint {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) throw new BillingError('BPS', 'invalid bps');
  return (v * BigInt(bps)) / 10_000n;
}

/** Round-half-up of `v * num / den`; `den` must be positive. */
export function mulDivRound(v: bigint, num: bigint, den: bigint): bigint {
  if (den <= 0n || num < 0n || v < 0n) throw new BillingError('AMOUNT', 'invalid ratio');
  return (v * num * 2n + den) / (den * 2n);
}

/** A share of a split. */
export interface Share {
  readonly id: string;
  /** Basis points; all shares must sum to exactly 10000. */
  readonly bps: number;
}

/**
 * Splits `total` by basis points with exact remainder allocation.
 *
 * @remarks Each share gets floor(total*bps/10000); the leftover units
 * (always fewer than the number of shares) go one each to the shares with the
 * largest fractional remainders, ties broken by input order. The result always
 * sums to `total` exactly and is deterministic.
 *
 * @param total Amount in base units.
 * @param shares 1..10000 shares, bps summing to 10000, unique ids.
 * @returns Allocations in input order.
 * @throws {BillingError} `BPS` or `AMOUNT`.
 */
export function splitByBps(
  total: bigint,
  shares: readonly Share[],
): readonly { readonly id: string; readonly amount: bigint }[] {
  if (total < 0n || total > MAX_AMOUNT) throw new BillingError('AMOUNT', 'invalid total');
  if (shares.length === 0 || shares.length > 10_000) throw new BillingError('BPS', 'invalid shares');
  const ids = new Set<string>();
  let sum = 0;
  for (const s of shares) {
    if (!Number.isSafeInteger(s.bps) || s.bps < 0 || s.bps > 10_000)
      throw new BillingError('BPS', 'invalid bps');
    if (ids.has(s.id)) throw new BillingError('BPS', 'duplicate share id');
    ids.add(s.id);
    sum += s.bps;
  }
  if (sum !== 10_000) throw new BillingError('BPS', 'shares must sum to 10000 bps');
  const base = shares.map((s) => (total * BigInt(s.bps)) / 10_000n);
  const rem = shares.map((s) => (total * BigInt(s.bps)) % 10_000n);
  let left = total - base.reduce((a, b) => a + b, 0n);
  const order = shares
    .map((_, i) => i)
    .sort((a, b) => {
      const d = (rem[b] as bigint) - (rem[a] as bigint);
      return d > 0n ? 1 : d < 0n ? -1 : a - b;
    });
  const out = base.slice();
  for (const i of order) {
    if (left === 0n) break;
    out[i] = (out[i] as bigint) + 1n;
    left -= 1n;
  }
  return shares.map((s, i) => ({ id: s.id, amount: out[i] as bigint }));
}

/** Splits `total` into `n` near-equal parts (earlier parts get the extra units); sums to `total`. */
export function splitEqual(total: bigint, n: number): readonly bigint[] {
  if (!Number.isSafeInteger(n) || n < 1 || n > 10_000) throw new BillingError('AMOUNT', 'invalid count');
  if (total < 0n) throw new BillingError('AMOUNT', 'invalid total');
  const q = total / BigInt(n);
  const r = Number(total % BigInt(n));
  return Array.from({ length: n }, (_, i) => (i < r ? q + 1n : q));
}
