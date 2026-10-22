import { parseMinor } from './decimal.js';
import { LedgerError } from './errors.js';

export type InvoiceStatus = 'paid' | 'partial' | 'over' | 'unmatched' | 'expired';

export interface LedgerInvoice {
  readonly id: string;
  readonly currency: string;
  /** Total due in fiat minor units, decimal string. */
  readonly amountMinor: string;
  /** Unix seconds; expired at and after this instant. */
  readonly expiresAt: number;
}

export interface ObservedPayment {
  /** Unique payment id (e.g. tx hash + log index). */
  readonly id: string;
  /** Explicit invoice id when the observer knows it. */
  readonly invoiceId?: string;
  readonly currency: string;
  /** Fiat-equivalent minor units at observation time, decimal string. */
  readonly amountMinor: string;
  /** Unix seconds. */
  readonly observedAt: number;
}

export interface Tolerance {
  readonly absoluteMinor?: bigint;
  readonly bps?: number;
}

export interface ReconcileOptions {
  /** Unix seconds, injected clock. */
  readonly now: number;
  readonly tolerance?: Tolerance;
}

export type UnmatchedReason =
  'unknown-invoice' | 'currency-mismatch' | 'bad-amount' | 'ambiguous' | 'no-candidate' | 'duplicate';

export interface InvoiceResult {
  readonly invoiceId: string;
  readonly status: InvoiceStatus;
  readonly dueMinor: string;
  /** Sum of counted (pre-expiry) payments. */
  readonly paidMinor: string;
  /** paid - due, signed decimal string. */
  readonly deltaMinor: string;
  readonly paymentIds: readonly string[];
  /** Payments observed at/after expiry (not counted). */
  readonly latePaymentIds: readonly string[];
}

export interface UnmatchedPayment {
  readonly paymentId: string;
  readonly reason: UnmatchedReason;
}

export interface ReconcileReport {
  readonly invoices: readonly InvoiceResult[];
  readonly unmatchedPayments: readonly UnmatchedPayment[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function tolFor(amount: bigint, t: Tolerance | undefined): bigint {
  const abs = t?.absoluteMinor ?? 0n;
  const bps = BigInt(t?.bps ?? 0);
  const rel = (amount * bps) / 10_000n;
  return abs > rel ? abs : rel;
}

interface Inv {
  readonly raw: LedgerInvoice;
  readonly due: bigint;
  counted: bigint;
  readonly ids: string[];
  readonly late: string[];
}

/**
 * Match observed payments to invoices and compute per-invoice status.
 *
 * @param invoices Invoices (order irrelevant; duplicate ids throw).
 * @param payments Observed payments (order irrelevant).
 * @param options Injected clock and tolerance.
 * @throws {LedgerError} On duplicate invoice ids or a malformed invoice amount.
 * @returns Deterministic report; malformed rows are reported, never thrown.
 * @security Inputs are untrusted observations; amounts are strict integer strings, ids are only compared, never interpreted.
 */
export function reconcile(
  invoices: readonly LedgerInvoice[],
  payments: readonly ObservedPayment[],
  options: ReconcileOptions,
): ReconcileReport {
  const map = new Map<string, Inv>();
  for (const raw of [...invoices].sort((a, b) => cmp(a.id, b.id))) {
    if (map.has(raw.id)) throw new LedgerError('duplicate-invoice');
    map.set(raw.id, { raw, due: parseMinor(raw.amountMinor), counted: 0n, ids: [], late: [] });
  }
  const unmatched: UnmatchedPayment[] = [];
  const seen = new Set<string>();
  const ordered = [...payments].sort((a, b) => a.observedAt - b.observedAt || cmp(a.id, b.id));
  for (const p of ordered) {
    if (seen.has(p.id)) {
      unmatched.push({ paymentId: p.id, reason: 'duplicate' });
      continue;
    }
    seen.add(p.id);
    let amt: bigint;
    try {
      amt = parseMinor(p.amountMinor);
    } catch {
      unmatched.push({ paymentId: p.id, reason: 'bad-amount' });
      continue;
    }
    if (amt === 0n) {
      unmatched.push({ paymentId: p.id, reason: 'bad-amount' });
      continue;
    }
    let target: Inv | undefined;
    if (p.invoiceId !== undefined) {
      target = map.get(p.invoiceId);
      if (target === undefined) {
        unmatched.push({ paymentId: p.id, reason: 'unknown-invoice' });
        continue;
      }
      if (target.raw.currency !== p.currency) {
        unmatched.push({ paymentId: p.id, reason: 'currency-mismatch' });
        continue;
      }
    } else {
      const cands = [...map.values()].filter(
        (i) =>
          i.raw.currency === p.currency &&
          i.ids.length === 0 &&
          i.late.length === 0 &&
          p.observedAt < i.raw.expiresAt &&
          (amt >= i.due ? amt - i.due : i.due - amt) <= tolFor(i.due, options.tolerance),
      );
      if (cands.length > 1) {
        unmatched.push({ paymentId: p.id, reason: 'ambiguous' });
        continue;
      }
      target = cands[0];
      if (target === undefined) {
        unmatched.push({ paymentId: p.id, reason: 'no-candidate' });
        continue;
      }
    }
    if (p.observedAt >= target.raw.expiresAt) target.late.push(p.id);
    else {
      target.counted += amt;
      target.ids.push(p.id);
    }
  }
  const results: InvoiceResult[] = [...map.values()].map((i) => {
    const tol = tolFor(i.due, options.tolerance);
    let status: InvoiceStatus;
    if (i.counted > i.due + tol) status = 'over';
    else if (i.counted + tol >= i.due) status = 'paid';
    else if (options.now >= i.raw.expiresAt) status = 'expired';
    else status = i.counted === 0n ? 'unmatched' : 'partial';
    return {
      invoiceId: i.raw.id,
      status,
      dueMinor: i.due.toString(),
      paidMinor: i.counted.toString(),
      deltaMinor: (i.counted - i.due).toString(),
      paymentIds: i.ids,
      latePaymentIds: i.late,
    };
  });
  return { invoices: results, unmatchedPayments: unmatched };
}
