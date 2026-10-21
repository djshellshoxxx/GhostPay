import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseMetaAddress } from './address.js';
import { BillingError } from './errors.js';

export interface OriginalPayment {
  /** Verified payment identifier (tx hash + log index). */
  readonly paymentId: string;
  readonly invoiceNonce: string;
  readonly chainId: number;
  readonly token: string;
  readonly paidAmount: bigint;
  /** On-chain sender address (lowercase 0x). Must never be the refund destination. */
  readonly senderAddress: string;
}

export type RefundStatus = 'planned' | 'submitted' | 'confirmed' | 'failed';

export interface RefundPlan {
  readonly refundId: string;
  readonly idempotencyKey: string;
  readonly paymentId: string;
  readonly invoiceNonce: string;
  readonly chainId: number;
  readonly token: string;
  readonly amount: bigint;
  /** Payer-provided fresh stealth meta-address; the on-chain recipient is derived from it. */
  readonly destinationMeta: string;
  readonly status: RefundStatus;
}

export interface RefundRequest {
  readonly idempotencyKey: string;
  readonly amount: bigint;
  readonly destinationMeta: string;
}

export interface RefundOutcome {
  readonly plan: RefundPlan;
  readonly replayed: boolean;
  /** Still refundable after this plan (failed refunds do not count). */
  readonly remainingRefundable: bigint;
}

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const PID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Builds (or replays) a private refund plan for an original payment.
 *
 * @remarks Rules: the cumulative non-failed refunds never exceed `paidAmount`;
 * the destination must be a valid stealth meta-address (a plain address, including
 * the original sender, is rejected so the refund cannot link payer and merchant);
 * the destination may not equal any meta-address in `linkedMetas` (e.g. the one
 * used to pay). The same idempotency key with identical parameters returns the
 * existing plan; with different parameters it is rejected. `refundId` is
 * sha256 over the payment id and key, so retries cannot create a second refund.
 *
 * @param prior Existing refund plans for this payment.
 * @param linkedMetas Meta-addresses already associated with the payer.
 * @throws {BillingError} `REFUND`, `IDEMPOTENCY`, `META_ADDRESS`.
 * @security `destinationMeta` is payer-supplied: validated as curve points. The
 * sender address is compared only to refuse it; it is never used as a destination.
 */
export function planRefund(
  original: OriginalPayment,
  prior: readonly RefundPlan[],
  req: RefundRequest,
  linkedMetas: readonly string[] = [],
): RefundOutcome {
  if (!PID_RE.test(original.paymentId) || original.paidAmount <= 0n)
    throw new BillingError('REFUND', 'invalid original payment');
  if (!KEY_RE.test(req.idempotencyKey)) throw new BillingError('IDEMPOTENCY', 'invalid idempotency key');
  const mine = prior.filter((p) => p.paymentId === original.paymentId);
  const counted = mine.filter((p) => p.status !== 'failed').reduce((a, p) => a + p.amount, 0n);

  const existing = mine.find((p) => p.idempotencyKey === req.idempotencyKey);
  if (existing !== undefined) {
    if (existing.amount !== req.amount || existing.destinationMeta !== req.destinationMeta)
      throw new BillingError('IDEMPOTENCY', 'key reused with different parameters');
    return { plan: existing, replayed: true, remainingRefundable: original.paidAmount - counted };
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(req.destinationMeta) || req.destinationMeta.toLowerCase() === original.senderAddress)
    throw new BillingError('META_ADDRESS', 'plain address destination refused');
  const meta = parseMetaAddress(req.destinationMeta);
  if (linkedMetas.includes(meta)) throw new BillingError('META_ADDRESS', 'meta-address not fresh');
  if (req.amount <= 0n) throw new BillingError('REFUND', 'amount must be positive');
  if (counted + req.amount > original.paidAmount) throw new BillingError('REFUND', 'exceeds paid amount');

  const refundId = bytesToHex(
    sha256(utf8ToBytes(`ghostpay-refund-v1\n${original.paymentId}\n${req.idempotencyKey}`)),
  );
  const plan: RefundPlan = {
    refundId,
    idempotencyKey: req.idempotencyKey,
    paymentId: original.paymentId,
    invoiceNonce: original.invoiceNonce,
    chainId: original.chainId,
    token: original.token,
    amount: req.amount,
    destinationMeta: meta,
    status: 'planned',
  };
  return { plan, replayed: false, remainingRefundable: original.paidAmount - counted - req.amount };
}

const NEXT: Record<RefundStatus, readonly RefundStatus[]> = {
  planned: ['submitted', 'failed'],
  submitted: ['confirmed', 'failed'],
  confirmed: [],
  failed: [],
};

/** Moves a refund through planned, submitted, confirmed or failed. Terminal states are final. */
export function transitionRefund(plan: RefundPlan, to: RefundStatus): RefundPlan {
  if (plan.status === to) return plan;
  if (!NEXT[plan.status].includes(to)) throw new BillingError('REFUND', 'illegal transition');
  return { ...plan, status: to };
}
