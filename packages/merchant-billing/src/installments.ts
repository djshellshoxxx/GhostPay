import { BillingError } from './errors.js';
import { bpsOf, MAX_AMOUNT, parseAmount, splitEqual } from './money.js';

/** Tolerances, in base units (decimal strings) and bps of total; the larger of each pair applies. */
export interface Tolerance {
  readonly underpayAbs: string;
  readonly underpayBps: number;
  readonly overpayAbs: string;
  readonly overpayBps: number;
}

export interface Installment {
  readonly index: number;
  readonly kind: 'deposit' | 'installment';
  readonly amount: bigint;
  readonly dueAt: number;
}

export interface LedgerPayment {
  /** Idempotency key, e.g. transaction hash plus log index. Duplicates are ignored. */
  readonly id: string;
  readonly amount: bigint;
  readonly at: number;
}

export interface Ledger {
  readonly total: bigint;
  readonly tolerance: { underpay: bigint; overpay: bigint };
  readonly schedule: readonly Installment[];
  readonly payments: readonly LedgerPayment[];
}

export type LedgerStatus = 'unpaid' | 'partial' | 'settled' | 'overpaid';

export interface LedgerSummary {
  readonly paid: bigint;
  readonly remaining: bigint;
  /** Amount above total + overpay tolerance; candidate for the refund flow. */
  readonly refundableExcess: bigint;
  readonly status: LedgerStatus;
  readonly installments: readonly {
    readonly index: number;
    readonly due: bigint;
    readonly paid: bigint;
    readonly state: 'paid' | 'partial' | 'unpaid' | 'overdue';
  }[];
}

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/** Unix-second inputs must retain exact ordering and arithmetic at runtime. */
function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Builds a ledger with a deposit and equal installments.
 *
 * @param total Invoice total in base units, > 0.
 * @param depositBps Deposit share of total, 0..10000. Deposit rounds down; the remainder is
 * split across `count` installments so the schedule sums to exactly `total`.
 * @param count Number of installments after the deposit (0 only if depositBps is 10000).
 * @param firstDue Due time of the first installment; the deposit is due at `startAt`.
 * Times are non-negative safe integer Unix seconds. Installment intervals are at
 * least 3600 seconds; zero is permitted only for a full-upfront ledger. A deposit
 * cannot be due after the first installment (allocation follows schedule order).
 * @throws {BillingError} `LEDGER`.
 */
export function createLedger(args: {
  total: bigint;
  depositBps: number;
  count: number;
  startAt: number;
  firstDue: number;
  intervalSeconds: number;
  tolerance: Tolerance;
}): Ledger {
  const { total, depositBps, count } = args;
  if (typeof total !== 'bigint' || total <= 0n || total > MAX_AMOUNT) throw new BillingError('LEDGER', 'invalid total');
  const deposit = bpsOf(total, depositBps);
  if (!Number.isSafeInteger(count) || count < 0 || count > 120) throw new BillingError('LEDGER', 'invalid count');
  if ((count === 0) !== (deposit === total)) throw new BillingError('LEDGER', 'deposit and count mismatch');
  if (!validTime(args.startAt) || !validTime(args.firstDue)) throw new BillingError('LEDGER', 'invalid due time');
  if (count > 0 && deposit > 0n && args.firstDue < args.startAt)
    throw new BillingError('LEDGER', 'deposit must be due before installments');
  if (!validTime(args.intervalSeconds) || (count > 0 && args.intervalSeconds < 3600))
    throw new BillingError('LEDGER', 'invalid interval');
  if (count > 0 && !validTime(args.firstDue + (count - 1) * args.intervalSeconds))
    throw new BillingError('LEDGER', 'due time overflow');
  const t = args.tolerance;
  const under = max(parseAmount(t.underpayAbs), bpsOf(total, t.underpayBps));
  const over = max(parseAmount(t.overpayAbs), bpsOf(total, t.overpayBps));
  const parts = count === 0 ? [] : splitEqual(total - deposit, count);
  const schedule: Installment[] = [];
  if (deposit > 0n) schedule.push({ index: 0, kind: 'deposit', amount: deposit, dueAt: args.startAt });
  parts.forEach((amount, i) =>
    schedule.push({
      index: schedule.length,
      kind: 'installment',
      amount,
      dueAt: args.firstDue + i * args.intervalSeconds,
    }),
  );
  if (under >= total) throw new BillingError('LEDGER', 'tolerance too large');
  return { total, tolerance: { underpay: under, overpay: over }, schedule, payments: [] };
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * Applies a payment. Idempotent by `payment.id`: replays are ignored, but a replay with
 * a different amount is rejected (possible tampering).
 *
 * @security `id` must come from the verified on-chain event, not from the payer.
 * @throws {BillingError} `LEDGER`.
 */
export function applyPayment(ledger: Ledger, p: LedgerPayment): { ledger: Ledger; duplicate: boolean } {
  if (typeof p.id !== 'string' || !ID_RE.test(p.id) || typeof p.amount !== 'bigint' || p.amount <= 0n || p.amount > MAX_AMOUNT || !validTime(p.at))
    throw new BillingError('LEDGER', 'invalid payment');
  const prev = ledger.payments.find((x) => x.id === p.id);
  if (prev !== undefined) {
    if (prev.amount !== p.amount) throw new BillingError('LEDGER', 'conflicting replay');
    return { ledger, duplicate: true };
  }
  return { ledger: { ...ledger, payments: [...ledger.payments, p] }, duplicate: false };
}

/** Derives status by allocating payments oldest first; `now` is a non-negative safe integer Unix timestamp. */
export function summarize(ledger: Ledger, now: number): LedgerSummary {
  if (!validTime(now)) throw new BillingError('LEDGER', 'invalid summary time');
  const paid = ledger.payments.reduce((a, p) => a + p.amount, 0n);
  let pool = paid;
  const installments = ledger.schedule.map((s) => {
    const got = pool < s.amount ? pool : s.amount;
    pool -= got;
    const state =
      got === s.amount ? ('paid' as const) : now >= s.dueAt ? ('overdue' as const) : got > 0n ? ('partial' as const) : ('unpaid' as const);
    return { index: s.index, due: s.amount, paid: got, state };
  });
  const short = ledger.total > paid ? ledger.total - paid : 0n;
  const excess = paid > ledger.total ? paid - ledger.total : 0n;
  let status: LedgerStatus;
  if (excess > ledger.tolerance.overpay) status = 'overpaid';
  else if (short <= ledger.tolerance.underpay) status = 'settled';
  else status = paid > 0n ? 'partial' : 'unpaid';
  return {
    paid,
    remaining: short,
    refundableExcess: status === 'overpaid' ? excess : 0n,
    status,
    installments,
  };
}
