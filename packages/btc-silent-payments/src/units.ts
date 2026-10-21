import { fail } from './errors.js';

/** Satoshis per bitcoin. */
export const SATS_PER_BTC = 100_000_000n;

/** Consensus MAX_MONEY: 21,000,000 BTC in satoshis. */
export const MAX_MONEY_SATS = 2_100_000_000_000_000n;

const BTC_DECIMAL = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,8}))?$/;

/**
 * Formats satoshis as a canonical BTC decimal string (BIP-21 `amount`): no sign, no exponent,
 * at most 8 fractional digits, no trailing zeros, no trailing dot (`1`, `0.5`, `0.00000001`).
 *
 * @param sats Integer satoshis in [0, MAX_MONEY].
 * @returns Decimal string.
 * @throws {SilentPaymentError} `INVALID_AMOUNT` for non-bigint, negative or above MAX_MONEY.
 */
export function satsToBtcString(sats: bigint): string {
  if (typeof sats !== 'bigint' || sats < 0n || sats > MAX_MONEY_SATS) return fail('INVALID_AMOUNT');
  const whole = sats / SATS_PER_BTC;
  const frac = (sats % SATS_PER_BTC).toString().padStart(8, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole.toString()}.${frac}`;
}

/**
 * Strictly parses a BTC decimal string into satoshis.
 *
 * @remarks Accepts digits with an optional `.` and 1 to 8 fractional digits. Rejects signs,
 * exponents, whitespace, thousands separators, leading zeros (`01`), a bare dot (`.5`, `1.`),
 * more than 8 decimals (no silent rounding) and values above MAX_MONEY.
 *
 * @param value Decimal string.
 * @returns Satoshis.
 * @throws {SilentPaymentError} `INVALID_AMOUNT`.
 */
export function btcStringToSats(value: string): bigint {
  if (typeof value !== 'string') return fail('INVALID_AMOUNT');
  const m = BTC_DECIMAL.exec(value);
  if (m === null) return fail('INVALID_AMOUNT');
  const sats = BigInt(m[1] as string) * SATS_PER_BTC + BigInt((m[2] ?? '').padEnd(8, '0') || '0');
  if (sats > MAX_MONEY_SATS) return fail('INVALID_AMOUNT');
  return sats;
}
