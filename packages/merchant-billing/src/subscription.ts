import {
  createInvoice,
  type AmountPolicy,
  type Invoice,
  type RandomSource,
} from '@ghostpay/invoice-schema';
import { BillingError } from './errors.js';
import { bpsOf, mulDivRound, parseAmount } from './money.js';
import {
  periodAt,
  periodIndexAt,
  periodStart,
  validateSchedule,
  type Period,
  type ScheduleSpec,
} from './schedule.js';

/**
 * Non-custodial model: GhostPay cannot pull funds. A subscription is a schedule of
 * merchant-issued invoices plus reminders. The payer pays each invoice voluntarily.
 */
export interface Plan {
  readonly id: string;
  /** Plain printable ASCII, 1..100 chars; used in invoice line item text. */
  readonly name: string;
  readonly currency: string;
  /** Fiat minor units per period (decimal string), excluding tax. */
  readonly amountMinor: string;
  readonly taxBps: number;
  readonly schedule: ScheduleSpec;
}

/** Invoice fields that stay constant across a subscription. */
export interface InvoiceTemplate {
  readonly chainId: number;
  /** Merchant receive meta-address (never a plain address). */
  readonly metaAddress: string;
  readonly token: string;
  readonly amountPolicy: AmountPolicy;
  readonly feePolicy: 'payer_pays' | 'seller_pays';
  readonly signer: string;
  readonly quoteSource: string;
  readonly quoteTtlSeconds: number;
  readonly maxSlippageBps: number;
}

/** Timing policy, all in seconds. */
export interface DunningPolicy {
  /** Issue the invoice this long before the period starts. */
  readonly leadSeconds: number;
  /** After due date, invoice still acceptable until due + grace; then subscription is past_due. */
  readonly graceSeconds: number;
  /** Past grace by this much without payment: subscription lapses. */
  readonly lapseAfterSeconds: number;
  /** Reminder times relative to due date; ascending; may be negative. */
  readonly reminderOffsets: readonly number[];
  /** Upper bound on invoices issued per `advance` call (catch-up limiter). */
  readonly maxIssuePerAdvance: number;
}

export type SubscriptionStatus = 'active' | 'paused' | 'past_due' | 'lapsed' | 'canceled';

export interface PeriodRecord {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly amountMinor: string;
  readonly taxMinor: string;
  readonly status: 'issued' | 'paid' | 'void';
  readonly invoice: Invoice;
  readonly issuedAt: number;
  readonly dueAt: number;
  readonly remindersSent: number;
  readonly paidAt?: number;
}

export interface Subscription {
  readonly id: string;
  readonly plan: Plan;
  readonly status: SubscriptionStatus;
  readonly createdAt: number;
  /** Next period index to invoice. Never decreases: an index is invoiced at most once. */
  readonly nextIndex: number;
  readonly periods: readonly PeriodRecord[];
  readonly pausedAt?: number;
  readonly cancelAtPeriodEnd?: number;
  readonly canceledAt?: number;
}

export interface Reminder {
  readonly subscriptionId: string;
  readonly periodIndex: number;
  readonly offsetIndex: number;
  readonly dueAt: number;
}

export interface AdvanceResult {
  readonly subscription: Subscription;
  readonly issued: readonly Invoice[];
  readonly reminders: readonly Reminder[];
}

/** Sensible defaults: issue 3d early, 3d grace, lapse 14d later, remind at -3d/0/+3d. */
export const DEFAULT_DUNNING: DunningPolicy = {
  leadSeconds: 3 * 86_400,
  graceSeconds: 3 * 86_400,
  lapseAfterSeconds: 14 * 86_400,
  reminderOffsets: [-86_400, 0, 3 * 86_400],
  maxIssuePerAdvance: 1,
};

const NAME_RE = /^[\x20-\x7e]{1,100}$/;
const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;

function validatePlan(p: Plan): void {
  if (!ID_RE.test(p.id) || !NAME_RE.test(p.name) || !/^[A-Z]{3}$/.test(p.currency))
    throw new BillingError('PLAN', 'invalid plan');
  if (parseAmount(p.amountMinor) === 0n) throw new BillingError('PLAN', 'zero price');
  if (!Number.isSafeInteger(p.taxBps) || p.taxBps < 0 || p.taxBps > 10_000)
    throw new BillingError('PLAN', 'invalid tax');
  validateSchedule(p.schedule);
}

function validatePolicy(d: DunningPolicy): void {
  const ok = (v: number, max: number): boolean => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const year = 366 * 86_400;
  if (!ok(d.leadSeconds, year) || !ok(d.graceSeconds, year) || !ok(d.lapseAfterSeconds, year))
    throw new BillingError('PLAN', 'invalid policy');
  if (!Number.isSafeInteger(d.maxIssuePerAdvance) || d.maxIssuePerAdvance < 1 || d.maxIssuePerAdvance > 24)
    throw new BillingError('PLAN', 'invalid policy');
  if (d.reminderOffsets.length > 12) throw new BillingError('PLAN', 'invalid policy');
  d.reminderOffsets.forEach((o, i) => {
    if (!Number.isSafeInteger(o) || Math.abs(o) > year || (i > 0 && o <= (d.reminderOffsets[i - 1] as number)))
      throw new BillingError('PLAN', 'invalid policy');
  });
}

function isoDate(t: number): string {
  return new Date(t * 1000).toISOString().slice(0, 10);
}

/**
 * Creates a subscription. The first invoiced period is the one containing `now`
 * (or period 0 when the plan starts in the future); history is never back-billed.
 *
 * @throws {BillingError} `PLAN` or `SCHEDULE`.
 */
export function createSubscription(id: string, plan: Plan, now: number): Subscription {
  if (!ID_RE.test(id)) throw new BillingError('PLAN', 'invalid id');
  validatePlan(plan);
  const idx = periodIndexAt(plan.schedule, now);
  return { id, plan, status: 'active', createdAt: now, nextIndex: Math.max(0, idx), periods: [] };
}

function replace(sub: Subscription, rec: PeriodRecord): Subscription {
  return { ...sub, periods: sub.periods.map((p) => (p.index === rec.index ? rec : p)) };
}

function unpaid(sub: Subscription): readonly PeriodRecord[] {
  return sub.periods.filter((p) => p.status === 'issued');
}

function buildInvoice(
  sub: Subscription,
  per: Period,
  tpl: InvoiceTemplate,
  policy: DunningPolicy,
  now: number,
  rng: RandomSource | undefined,
): PeriodRecord {
  const amount = parseAmount(sub.plan.amountMinor);
  const tax = bpsOf(amount, sub.plan.taxBps);
  const dueAt = Math.max(per.start, now);
  const invoice = createInvoice(
    {
      chainId: tpl.chainId,
      metaAddress: tpl.metaAddress,
      fiat: { currency: sub.plan.currency, minorUnits: (amount + tax).toString() },
      token: tpl.token,
      amountPolicy: tpl.amountPolicy,
      quote: {
        source: tpl.quoteSource,
        timestamp: now,
        expiresAt: now + tpl.quoteTtlSeconds,
        maxSlippageBps: tpl.maxSlippageBps,
      },
      expiresAt: dueAt + policy.graceSeconds + policy.lapseAfterSeconds,
      lineItems: [
        {
          description: `${sub.plan.name} ${isoDate(per.start)} to ${isoDate(per.end)}`,
          quantity: '1',
          unitMinorUnits: amount.toString(),
        },
      ],
      tax: { rateBps: sub.plan.taxBps, minorUnits: tax.toString() },
      feePolicy: tpl.feePolicy,
      signer: tpl.signer,
    },
    rng,
  );
  return {
    index: per.index,
    start: per.start,
    end: per.end,
    amountMinor: amount.toString(),
    taxMinor: tax.toString(),
    status: 'issued',
    invoice,
    issuedAt: now,
    dueAt,
    remindersSent: 0,
  };
}

/**
 * Runs the dunning and issuance state machine at time `now`. Pure and idempotent:
 * calling twice with the same `now` issues nothing new.
 *
 * @remarks Order: (1) apply scheduled cancellation, (2) paused stops everything,
 * (3) overdue evaluation (`past_due`, `lapsed`), (4) reminders (at most one per
 * invoice per call, earlier offsets are skipped, not replayed), (5) issuance only
 * while `active`. A subscription never accumulates more than one unpaid invoice
 * beyond grace because issuance stops at `past_due`.
 *
 * @param rng Injected CSPRNG for invoice nonces; production callers omit it.
 * @throws {BillingError} `PLAN`; schema errors from invoice-schema propagate.
 * @security Invoices are merchant-issued; nothing here can move payer funds.
 */
export function advance(
  subscription: Subscription,
  now: number,
  template: InvoiceTemplate,
  policy: DunningPolicy = DEFAULT_DUNNING,
  rng?: RandomSource,
): AdvanceResult {
  validatePolicy(policy);
  if (!Number.isSafeInteger(template.quoteTtlSeconds) || template.quoteTtlSeconds < 0)
    throw new BillingError('PLAN', 'invalid template');
  let sub = subscription;
  const issued: Invoice[] = [];
  const reminders: Reminder[] = [];
  if (sub.status === 'canceled' || sub.status === 'lapsed') return { subscription: sub, issued, reminders };

  if (sub.cancelAtPeriodEnd !== undefined && now >= sub.cancelAtPeriodEnd) {
    sub = voidUnpaid({ ...sub, status: 'canceled', canceledAt: sub.cancelAtPeriodEnd });
    return { subscription: sub, issued, reminders };
  }
  if (sub.status === 'paused') return { subscription: sub, issued, reminders };

  let status: SubscriptionStatus = 'active';
  for (const p of unpaid(sub)) {
    if (now >= p.dueAt + policy.graceSeconds + policy.lapseAfterSeconds) status = 'lapsed';
    else if (now >= p.dueAt + policy.graceSeconds && status !== 'lapsed') status = 'past_due';
  }
  sub = { ...sub, status };
  if (status === 'lapsed') return { subscription: sub, issued, reminders };

  for (const p of unpaid(sub)) {
    let k = 0;
    policy.reminderOffsets.forEach((o) => {
      if (p.dueAt + o <= now) k++;
    });
    if (k > p.remindersSent) {
      reminders.push({ subscriptionId: sub.id, periodIndex: p.index, offsetIndex: k - 1, dueAt: p.dueAt });
      sub = replace(sub, { ...p, remindersSent: k });
    }
  }

  let next = sub.nextIndex;
  let periods = sub.periods;
  while (sub.status === 'active' && issued.length < policy.maxIssuePerAdvance) {
    const per = periodAt(sub.plan.schedule, next);
    if (sub.cancelAtPeriodEnd !== undefined && per.start >= sub.cancelAtPeriodEnd) break;
    if (per.start - policy.leadSeconds > now) break;
    const rec = buildInvoice(sub, per, template, policy, now, rng);
    periods = [...periods, rec];
    issued.push(rec.invoice);
    next++;
    sub = { ...sub, periods, nextIndex: next };
  }
  return { subscription: sub, issued, reminders };
}

function voidUnpaid(sub: Subscription): Subscription {
  return {
    ...sub,
    periods: sub.periods.map((p) => (p.status === 'issued' ? { ...p, status: 'void' as const } : p)),
  };
}

/**
 * Records payment of one period's invoice. Idempotent for an already-paid period.
 *
 * @remarks The caller must have verified the on-chain payment against the invoice
 * before calling; this function only updates billing state.
 * @throws {BillingError} `STATE` for unknown or voided periods.
 */
export function markPaid(sub: Subscription, periodIndex: number, paidAt: number): Subscription {
  const p = sub.periods.find((x) => x.index === periodIndex);
  if (p === undefined || p.status === 'void') throw new BillingError('STATE', 'cannot mark paid');
  if (p.status === 'paid') return sub;
  let out = replace(sub, { ...p, status: 'paid', paidAt });
  // advance() recomputes lateness from scratch; only clear past_due when nothing is open.
  if (out.status === 'past_due' && unpaid(out).length === 0) out = { ...out, status: 'active' };
  return out;
}

/** Pauses billing: no new invoices and no reminders. Unpaid invoices stay open. */
export function pause(sub: Subscription, now: number): Subscription {
  if (sub.status !== 'active' && sub.status !== 'past_due') throw new BillingError('STATE', 'cannot pause');
  return { ...sub, status: 'paused', pausedAt: now };
}

/**
 * Resumes a paused subscription. Periods that began during the pause are skipped,
 * never back-billed; billing continues from the first period starting at or after `now`.
 */
export function resume(sub: Subscription, now: number): Subscription {
  if (sub.status !== 'paused') throw new BillingError('STATE', 'not paused');
  const idx = periodIndexAt(sub.plan.schedule, now);
  const first = idx < 0 ? 0 : periodStart(sub.plan.schedule, idx) === now ? idx : idx + 1;
  const { pausedAt: _p, ...rest } = sub;
  void _p;
  return { ...rest, status: 'active', nextIndex: Math.max(sub.nextIndex, first) };
}

/**
 * Cancels. `atPeriodEnd` keeps the paid period running and stops invoicing from the
 * next one; otherwise cancellation is immediate and unpaid invoices are voided.
 */
export function cancel(sub: Subscription, now: number, opts: { atPeriodEnd: boolean }): Subscription {
  if (sub.status === 'canceled') return sub;
  if (!opts.atPeriodEnd) return voidUnpaid({ ...sub, status: 'canceled', canceledAt: now });
  const idx = periodIndexAt(sub.plan.schedule, now);
  const end = idx < 0 ? periodStart(sub.plan.schedule, 0) : periodAt(sub.plan.schedule, idx).end;
  return { ...sub, cancelAtPeriodEnd: end };
}

/** Part of `amountMinor` covering `[at, period.end)`, rounded half up. */
export function prorate(amountMinor: bigint, period: Period, at: number): bigint {
  if (at < period.start || at > period.end || period.end <= period.start)
    throw new BillingError('PLAN', 'time outside period');
  return mulDivRound(amountMinor, BigInt(period.end - at), BigInt(period.end - period.start));
}

export interface PlanChange {
  readonly direction: 'charge' | 'credit' | 'none';
  readonly amountMinor: bigint;
  readonly creditUnusedOld: bigint;
  readonly chargeRemainingNew: bigint;
}

/**
 * Mid-period plan change: credit the unused part of the old price, charge the
 * remaining part of the new price. A credit is applied to the next invoice or
 * refunded via the refund flow; it is never netted silently.
 */
export function prorateChange(oldMinor: bigint, newMinor: bigint, period: Period, at: number): PlanChange {
  const creditUnusedOld = prorate(oldMinor, period, at);
  const chargeRemainingNew = prorate(newMinor, period, at);
  const d = chargeRemainingNew - creditUnusedOld;
  return {
    direction: d > 0n ? 'charge' : d < 0n ? 'credit' : 'none',
    amountMinor: d < 0n ? -d : d,
    creditUnusedOld,
    chargeRemainingNew,
  };
}
