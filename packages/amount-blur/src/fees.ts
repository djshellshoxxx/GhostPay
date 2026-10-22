import { routerFee, routerSplit, type RouterSplit } from '@ghostpay/chain-adapters';
import { fail } from './errors.js';
import type { PlannedPart } from './types.js';

/** Hard maximum number of parts. */
export const HARD_MAX_PARTS = 8;

/** Parts below this pay zero router fee (dust, FEE_SCHEDULE section 3); the floor keeps F-PAY intact. */
export const ABS_MIN_PART_BASE = 400n;

/**
 * Default minimum part: `max(400, 10^(decimals-2))` base units (one cent of the token at least).
 *
 * @param decimals Token decimals, integer 0..36.
 * @returns Floor in base units.
 */
export function defaultMinPartBase(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) fail('INVALID_INPUT', 'decimals out of range');
  const cent = decimals >= 2 ? 10n ** BigInt(decimals - 2) : 1n;
  return cent > ABS_MIN_PART_BASE ? cent : ABS_MIN_PART_BASE;
}

/**
 * Router fee split of one part, exactly as chain-adapters computes it.
 *
 * @param gross Part gross, `1..MAX_ROUTER_GROSS`.
 * @returns `{ gross, fee, net }`.
 * @throws {AmountBlurError} `INVALID_INPUT` out of range.
 */
export function splitPart(gross: bigint): RouterSplit {
  try {
    return routerSplit(gross);
  } catch {
    return fail('INVALID_INPUT', 'part gross out of router range');
  }
}

/** Aggregate totals. */
export interface Totals {
  readonly grossTotal: bigint;
  readonly feeTotal: bigint;
  readonly netTotal: bigint;
}

/**
 * Sums parts.
 *
 * @param parts Planned or split parts.
 * @returns Totals.
 */
export function totalsOf(parts: readonly RouterSplit[]): Totals {
  let grossTotal = 0n;
  let feeTotal = 0n;
  let netTotal = 0n;
  for (const p of parts) {
    grossTotal += p.gross;
    feeTotal += p.fee;
    netTotal += p.net;
  }
  return { grossTotal, feeTotal, netTotal };
}

/**
 * Fee the protocol forgoes by splitting: `routerFee(grossTotal) - feeTotal`, in `[0, k-1]` (R-FEE-1).
 *
 * @param grossTotal Sum of part grosses.
 * @param feeTotal Sum of part fees.
 * @returns Fee delta in base units.
 */
export function feeDelta(grossTotal: bigint, feeTotal: bigint): bigint {
  try {
    return routerFee(grossTotal) - feeTotal;
  } catch {
    return fail('INVALID_INPUT', 'gross total out of router range');
  }
}

/**
 * Asserts the AB-S1..S3 invariants on a finished plan.
 *
 * @param parts Planned parts.
 * @param invoiceNet Required minimum of the summed nets.
 * @param snapSlackGross Sum of upward rounding increments.
 * @param minPartBase Part floor (`>= 400n`).
 * @throws {AmountBlurError} `INVALID_INPUT` on any violation (indicates a bug or tampered plan).
 */
export function assertPlanInvariants(
  parts: readonly PlannedPart[],
  invoiceNet: bigint,
  snapSlackGross: bigint,
  minPartBase: bigint,
): void {
  const k = BigInt(parts.length);
  if (parts.length < 2 || parts.length > HARD_MAX_PARTS) fail('INVALID_INPUT', 'part count out of range');
  if (minPartBase < ABS_MIN_PART_BASE) fail('PART_BELOW_FLOOR', 'minPartBase below 400');
  for (const p of parts) {
    const s = splitPart(p.gross);
    if (p.gross < minPartBase || p.fee !== s.fee || p.net !== s.net || p.fee + p.net !== p.gross) {
      fail('INVALID_INPUT', 'part violates fee or floor invariant');
    }
  }
  const t = totalsOf(parts);
  if (t.netTotal < invoiceNet) fail('INVALID_INPUT', 'seller would receive less than the invoice net');
  if (t.netTotal - invoiceNet > k + snapSlackGross) fail('INVALID_INPUT', 'overpay above bound');
  const d = feeDelta(t.grossTotal, t.feeTotal);
  if (d < 0n || d > k - 1n) fail('INVALID_INPUT', 'fee delta outside 0..k-1');
}

/**
 * Index of the single part that may carry the gas buffer (AB-F3): the largest gross, first on ties.
 *
 * @param parts Planned parts (non-empty).
 * @returns Index into `parts`.
 */
export function pickBufferPart(parts: readonly PlannedPart[]): number {
  if (parts.length === 0) fail('INVALID_INPUT', 'no parts');
  let best = 0;
  for (let i = 1; i < parts.length; i += 1) {
    if ((parts[i] as PlannedPart).gross > (parts[best] as PlannedPart).gross) best = i;
  }
  return best;
}
