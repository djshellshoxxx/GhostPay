import { SchemaError } from './errors.js';
import type { Invoice } from './schema.js';

/** Result of {@link checkExpiry}. */
export interface ExpiryStatus {
  /** `now >= invoice.expiresAt`. */
  readonly invoiceExpired: boolean;
  /** `now >= invoice.quote.expiresAt`. */
  readonly quoteExpired: boolean;
  /** Seconds until the invoice expires (0 when expired). */
  readonly secondsRemaining: number;
}

/**
 * Checks invoice and quote expiry against a caller-supplied clock.
 *
 * @remarks Expiry is exclusive: an invoice is valid while `now < expiresAt` and
 * expired at `now === expiresAt`. The clock is injected (unix seconds) so the
 * function is pure and testable; the caller owns clock trust, and a payer's
 * clock can be wrong. Requires a non-negative safe integer.
 *
 * @param invoice Validated invoice.
 * @param nowSeconds Current unix time in whole seconds.
 * @returns Expiry flags and time remaining.
 * @throws {SchemaError} If `nowSeconds` is not a non-negative safe integer.
 * @security Expiry is advisory client-side policy; it is not enforced on-chain (ADR-0003).
 * @testVector expiry-edges
 */
export function checkExpiry(invoice: Invoice, nowSeconds: number): ExpiryStatus {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new SchemaError('now');
  return {
    invoiceExpired: nowSeconds >= invoice.expiresAt,
    quoteExpired: nowSeconds >= invoice.quote.expiresAt,
    secondsRemaining: Math.max(0, invoice.expiresAt - nowSeconds),
  };
}
