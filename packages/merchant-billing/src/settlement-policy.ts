/**
 * Deterministic settlement classification for one invoice: on-time, late, after-cancellation, duplicate, excess,
 * underpaid and misdirected payments, with the refund eligibility each implies under an explicit seller policy.
 *
 * Purpose: an expired or cancelled invoice must never erase evidence of money received, a late payment must never be
 * silently discarded or auto-refunded, and the refundable portion of every payment must be computed exactly
 * (bigint base units) so a refund request can be bounded by it. Pure logic over verified outcomes only.
 *
 * Timing uses the canonical block-header timestamp of each verified payment and the invoice-schema rule
 * "expired at and after `expiresAt`". The client clock is used only for the invoice's overall status.
 * Router payments carry no invoice id: the invoice attribution of each outcome is the seller ledger's, not the chain's.
 *
 * Author: GhostPay. Licence: UNLICENSED (repository licence).
 */
import { BillingError } from './errors.js';
import type { OutcomeChecker, RefundReason, VerifiedPaymentOutcome } from './refund-lifecycle.js';

/** What the seller has decided in advance for payments outside the invoice terms. */
export interface SettlementPolicy {
  /** Late payments: `review` (default) asks the seller; `accept` counts them; `refund` marks them refund-eligible. */
  readonly late: 'review' | 'accept' | 'refund';
  /** Excess over the amount due (overpayment, duplicates): `review` (default) or `refund`. */
  readonly excess: 'review' | 'refund';
  /** On-time payments of an invoice that expired underpaid: `review` (default) or `refund`. */
  readonly expiredPartial: 'review' | 'refund';
}

/** Nothing is refund-eligible without a seller decision unless the seller opted in. */
export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = Object.freeze({ late: 'review', excess: 'review', expiredPartial: 'review' });

/** Invoice terms the classification needs. */
export interface InvoiceTerms {
  readonly invoiceId: string;
  readonly chainId: number;
  /** Lowercase token address or `native`. */
  readonly assetId: string;
  /** Net base units the seller expects to receive. */
  readonly amountDue: bigint;
  /** Unix seconds; expired at and after this instant. */
  readonly expiresAt: number;
  /** Unix seconds the seller cancelled the invoice, or null. */
  readonly cancelledAt: number | null;
}

export type PaymentTiming = 'on-time' | 'late' | 'after-cancellation';

/**
 * - `applied`: counted toward the amount due (possibly with an `excess` part);
 * - `duplicate`: a whole extra payment of exactly the amount due after the invoice was already covered;
 * - `excess`: any other payment after the invoice was already covered;
 * - `late` / `after-cancellation`: not counted (unless the late policy accepts it);
 * - `wrong-chain` / `wrong-asset`: attributed to this invoice but not payable toward it.
 */
export type PaymentDisposition = 'applied' | 'duplicate' | 'excess' | 'late' | 'after-cancellation' | 'wrong-chain' | 'wrong-asset';

/**
 * - `eligible`: the seller's policy pre-authorizes refunding `refundableUpTo` (an explicit refund authorization is
 *   still required to execute);
 * - `seller-decision`: refundable only if the seller decides so;
 * - `awaiting-finality`: the payment is not final; decide after finality;
 * - `not-eligible`: nothing outside the invoice terms to refund.
 */
export type RefundEligibility = 'eligible' | 'seller-decision' | 'awaiting-finality' | 'not-eligible';

/** One classified payment. */
export interface ClassifiedPayment {
  readonly paymentId: string;
  readonly amount: bigint;
  readonly timing: PaymentTiming;
  readonly disposition: PaymentDisposition;
  /** Part counted toward the amount due. */
  readonly applied: bigint;
  /** `amount - applied`. */
  readonly excess: bigint;
  readonly final: boolean;
  readonly eligibility: RefundEligibility;
  /** Ceiling for a refund request of this payment under this classification (0 when not eligible). */
  readonly refundableUpTo: bigint;
  /** Reason to record on a refund of this payment, or null. */
  readonly suggestedReason: RefundReason | null;
}

export type InvoiceSettlement = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'expired-unpaid' | 'expired-partial' | 'cancelled';

/** Result of {@link classifySettlement}. */
export interface SettlementReport {
  readonly invoiceId: string;
  readonly status: InvoiceSettlement;
  /** True while any counted payment is not final or observations remain unresolved: the status may still change. */
  readonly provisional: boolean;
  readonly amountDue: bigint;
  readonly applied: bigint;
  readonly outstanding: bigint;
  /** Total received for this invoice that is not applied to it. */
  readonly unapplied: bigint;
  /** Observations (e.g. RPC failures, unverified announcements) that could not be classified. */
  readonly unresolvedObservations: number;
  /** Payments in canonical chain order (block, log index, id). */
  readonly payments: readonly ClassifiedPayment[];
}

/** Options of {@link classifySettlement}. */
export interface ClassifyOptions {
  /** Current Unix seconds (only for the invoice's overall expiry/cancellation status). */
  readonly now: number;
  readonly policy?: SettlementPolicy;
  /** Count of payments seen but not verified; keeps the report provisional. */
  readonly unresolvedObservations?: number;
}

const ADDR_RE = /^0x[0-9a-f]{40}$/;
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const bad = (message: string): never => {
  throw new BillingError('REFUND', message);
};
const isSeconds = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function checkTerms(t: InvoiceTerms): void {
  if (typeof t !== 'object' || t === null) bad('invoice terms');
  if (typeof t.invoiceId !== 'string' || !ID_RE.test(t.invoiceId)) bad('invoice id');
  if (!Number.isSafeInteger(t.chainId) || t.chainId < 1) bad('invoice chain');
  if (t.assetId !== 'native' && (typeof t.assetId !== 'string' || !ADDR_RE.test(t.assetId))) bad('invoice asset');
  if (typeof t.amountDue !== 'bigint' || t.amountDue < 1n || t.amountDue >= 1n << 256n) bad('invoice amount');
  if (!isSeconds(t.expiresAt)) bad('invoice expiry');
  if (t.cancelledAt !== null && !isSeconds(t.cancelledAt)) bad('invoice cancellation');
}

function checkPolicy(p: SettlementPolicy): void {
  if (typeof p !== 'object' || p === null || !['review', 'accept', 'refund'].includes(p.late) ||
      !['review', 'refund'].includes(p.excess) || !['review', 'refund'].includes(p.expiredPartial)) bad('settlement policy');
}

const decide = (opted: boolean): RefundEligibility => (opted ? 'eligible' : 'seller-decision');

/**
 * Classifies the verified payments attributed to one invoice.
 *
 * @param checker Recognizes outcomes minted by the trusted verifier; any other value is refused.
 * @param terms Invoice terms.
 * @param outcomes Verified outcomes the seller ledger attributes to this invoice (`invoiceId` must match).
 * @param options Clock, policy and unresolved-observation count.
 * @returns Deterministic report; independent of input order.
 * @throws {BillingError} `EVIDENCE` for unverified, foreign or duplicate outcomes; `REFUND` for invalid terms/options.
 */
export function classifySettlement(checker: OutcomeChecker, terms: InvoiceTerms, outcomes: readonly VerifiedPaymentOutcome[], options: ClassifyOptions): SettlementReport {
  checkTerms(terms);
  const policy = options.policy ?? DEFAULT_SETTLEMENT_POLICY;
  checkPolicy(policy);
  if (!isSeconds(options.now)) bad('invalid clock');
  const unresolved = options.unresolvedObservations ?? 0;
  if (!Number.isSafeInteger(unresolved) || unresolved < 0) bad('unresolved observations');
  if (!Array.isArray(outcomes) || outcomes.length > 1000) bad('too many payments');
  const seen = new Set<string>();
  for (const o of outcomes) {
    if (!checker.isVerified(o)) throw new BillingError('EVIDENCE', 'payment outcome is not verified');
    if (o.invoiceId !== terms.invoiceId) throw new BillingError('EVIDENCE', 'payment is attributed to another invoice');
    if (seen.has(o.paymentId)) throw new BillingError('EVIDENCE', 'duplicate payment');
    seen.add(o.paymentId);
  }
  const ordered = [...outcomes].sort((a, b) =>
    a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex || (a.paymentId < b.paymentId ? -1 : 1));

  const due = terms.amountDue;
  let remaining = due;
  const rows: ClassifiedPayment[] = [];
  for (const o of ordered) {
    const final = o.status === 'finalized';
    const row = (timing: PaymentTiming, disposition: PaymentDisposition, applied: bigint, eligibility: RefundEligibility, reason: RefundReason | null): ClassifiedPayment => {
      const excess = o.amount - applied;
      const refundable = eligibility === 'not-eligible' ? 0n : excess;
      return {
        paymentId: o.paymentId, amount: o.amount, timing, disposition, applied, excess, final,
        eligibility: !final && eligibility !== 'not-eligible' ? 'awaiting-finality' : eligibility,
        refundableUpTo: refundable, suggestedReason: refundable > 0n ? reason : null,
      };
    };
    const timing: PaymentTiming = terms.cancelledAt !== null && o.blockTimestamp >= terms.cancelledAt ? 'after-cancellation'
      : o.blockTimestamp >= terms.expiresAt ? 'late' : 'on-time';
    if (o.chainId !== terms.chainId) {
      rows.push(row(timing, 'wrong-chain', 0n, 'seller-decision', 'merchant-initiated'));
      continue;
    }
    if (o.assetId !== terms.assetId) {
      rows.push(row(timing, 'wrong-asset', 0n, 'seller-decision', 'merchant-initiated'));
      continue;
    }
    if (timing === 'after-cancellation') {
      rows.push(row(timing, 'after-cancellation', 0n, decide(policy.late === 'refund'), 'order-cancelled'));
      continue;
    }
    if (timing === 'late' && policy.late !== 'accept') {
      rows.push(row(timing, 'late', 0n, decide(policy.late === 'refund'), 'late-payment'));
      continue;
    }
    const applied = o.amount < remaining ? o.amount : remaining;
    remaining -= applied;
    if (applied > 0n) {
      rows.push(row(timing, 'applied', applied, o.amount > applied ? decide(policy.excess === 'refund') : 'not-eligible', 'overpayment'));
    } else {
      const duplicate = o.amount === due;
      rows.push(row(timing, duplicate ? 'duplicate' : 'excess', 0n, decide(policy.excess === 'refund'), duplicate ? 'duplicate-payment' : 'overpayment'));
    }
  }

  const applied = due - remaining;
  const cancelled = terms.cancelledAt !== null && options.now >= terms.cancelledAt;
  const expired = options.now >= terms.expiresAt;
  // An underpaid invoice that is over (expired or cancelled): its applied payments become refundable on decision.
  const reopen = applied < due && applied > 0n && (cancelled || expired);
  const payments = rows.map((r): ClassifiedPayment => {
    if (!(cancelled && r.applied > 0n) && !(reopen && r.applied > 0n)) return r;
    const opted = !cancelled && policy.expiredPartial === 'refund';
    return {
      ...r, refundableUpTo: r.amount, eligibility: r.final ? decide(opted) : 'awaiting-finality',
      suggestedReason: cancelled ? 'order-cancelled' : 'expired-partial',
    };
  });
  const status: InvoiceSettlement = cancelled ? 'cancelled'
    : applied >= due ? (rows.some((r) => r.disposition === 'applied' && r.excess > 0n) || rows.some((r) => r.disposition === 'duplicate' || r.disposition === 'excess') ? 'overpaid' : 'paid')
      : applied === 0n ? (expired ? 'expired-unpaid' : 'unpaid')
        : expired ? 'expired-partial' : 'partial';
  const provisional = unresolved > 0 || rows.some((r) => !r.final);
  const unapplied = rows.reduce((sum, r) => sum + r.excess, 0n);
  return Object.freeze({
    invoiceId: terms.invoiceId, status, provisional, amountDue: due, applied, outstanding: due - applied, unapplied,
    unresolvedObservations: unresolved, payments: Object.freeze(payments),
  });
}

/** User-facing refund availability for one classified payment. */
export type EligibilityDisplay = 'refund-available' | 'refund-requires-authorization' | 'refund-pending-finality' | 'refund-unavailable';

/**
 * Maps eligibility to the four honest UI categories. `refund-available` still needs an explicit authorization and a
 * wallet signature; no category promises reversal of the original payment.
 */
export function describeEligibility(p: Pick<ClassifiedPayment, 'eligibility' | 'refundableUpTo'>): EligibilityDisplay {
  if (p.refundableUpTo <= 0n || p.eligibility === 'not-eligible') return 'refund-unavailable';
  if (p.eligibility === 'awaiting-finality') return 'refund-pending-finality';
  return p.eligibility === 'eligible' ? 'refund-available' : 'refund-requires-authorization';
}
