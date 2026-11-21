import { canonicalize } from '@ghostpay/invoice-schema';
import { MAX_PERIOD_INDEX, logicalId, periodAt, periodStart, type Period, type ScheduleSpec } from '@ghostpay/merchant-billing';
import {
  MAX_RECURRING_TIMESTAMP, integer, reference, refuse, timestamp, validateRecurringSnapshot,
  type RecurringPlanV1, type RecurringSnapshotV1,
} from './model';

export const MAX_DUE_PREVIEW_PERIODS = 24;
export const RECURRING_REVIEW_SECONDS = 300;

export interface DuePeriod extends Period { readonly eventId: string; }
export interface DuePreview {
  readonly profileRef: string;
  readonly snapshotRevision: string;
  readonly plan: RecurringPlanV1;
  readonly nextPeriodIndex: number;
  readonly nowSeconds: number;
  readonly periods: readonly DuePeriod[];
  readonly hasMore: boolean;
}

function due(snapshot: RecurringSnapshotV1, planId: string, nowSeconds: number, limit: number): DuePreview {
  const state = snapshot.plans.find(state => state.plan.planId === planId);
  if (state === undefined) return refuse('PLAN_MISSING');
  const periods: DuePeriod[] = [];
  const schedule: ScheduleSpec = { anchor: state.plan.anchorSeconds, cadence: state.plan.cadence };
  let next = state.nextPeriodIndex;
  let hasMore = false;
  if (state.plan.status === 'active') {
    try {
      while (next < MAX_PERIOD_INDEX && periods.length < limit) {
        if (periodStart(schedule, next) > nowSeconds) break;
        const period = periodAt(schedule, next);
        timestamp(period.start); timestamp(period.end);
        if (period.end <= period.start) return refuse('SCHEDULE');
        periods.push(Object.freeze({ ...period, eventId: logicalId(planId, next) }));
        next++;
      }
      hasMore = next < MAX_PERIOD_INDEX && periodStart(schedule, next) <= nowSeconds;
    } catch { return refuse('SCHEDULE'); }
  }
  return Object.freeze({ profileRef: snapshot.profileRef, snapshotRevision: snapshot.revision,
    plan: state.plan, nextPeriodIndex: state.nextPeriodIndex, nowSeconds,
    periods: Object.freeze(periods), hasMore });
}

/** Pure UTC preview. Never calls advance(), creates an invoice, or consumes randomness. */
export function previewDue(value: unknown, planId: string, nowSeconds: number, limit = MAX_DUE_PREVIEW_PERIODS): DuePreview {
  const count = integer(limit, MAX_DUE_PREVIEW_PERIODS, 'LIMIT');
  if (count === 0) return refuse('LIMIT');
  return due(validateRecurringSnapshot(value), reference(planId), timestamp(nowSeconds), count);
}

/** Live values supplied by the application; none is restored from a saved snapshot. */
export interface RecurringReviewContext {
  readonly operationId: string;
  readonly sessionEpoch: number;
  readonly signal: AbortSignal;
  readonly nowSeconds: number;
}

export interface RecurringReview extends DuePreview { readonly expiresAt: number; }

/** Local reviewed selection only. This is not a signer capability or a committed invoice. */
export interface ApprovedRecurringPeriod {
  readonly schema: 'ghostpay.recurring-period-selection/1';
  readonly profileRef: string;
  readonly snapshotRevision: string;
  readonly plan: RecurringPlanV1;
  readonly period: DuePeriod;
  readonly approvedAt: number;
}

interface Pending {
  readonly view: RecurringReview;
  readonly snapshot: string;
  readonly operationId: string;
  readonly sessionEpoch: number;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

function context(ctx: RecurringReviewContext): void {
  reference(ctx.operationId);
  integer(ctx.sessionEpoch, Number.MAX_SAFE_INTEGER, 'REVIEW_REVOKED');
  timestamp(ctx.nowSeconds);
  if (ctx.signal.aborted) return refuse('REVIEW_REVOKED');
}

/**
 * At most one live review. P04/P05 must revalidate and reserve a period atomically
 * before any future signing/issuance; this controller has no effects or durable lock.
 */
export class RecurringReviewController {
  #pending: Pending | undefined;

  public preview(value: unknown, planId: string, ctx: RecurringReviewContext): RecurringReview {
    this.cancel();
    context(ctx);
    const snapshot = validateRecurringSnapshot(value);
    const preview = due(snapshot, reference(planId), ctx.nowSeconds, MAX_DUE_PREVIEW_PERIODS);
    const view = Object.freeze({ ...preview, expiresAt: Math.min(MAX_RECURRING_TIMESTAMP, ctx.nowSeconds + RECURRING_REVIEW_SECONDS) });
    const onAbort = () => { if (this.#pending?.view === view) this.cancel(); };
    this.#pending = { view, snapshot: canonicalize(snapshot), operationId: ctx.operationId,
      sessionEpoch: ctx.sessionEpoch, signal: ctx.signal, onAbort };
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    return view;
  }

  /** Consume one review for its earliest due period. Even a refused attempt needs fresh review. */
  public approveNext(view: RecurringReview, value: unknown, ctx: RecurringReviewContext): ApprovedRecurringPeriod {
    const pending = this.#pending;
    this.cancel();
    if (pending === undefined || pending.view !== view || pending.signal.aborted) return refuse('REVIEW_REVOKED');
    context(ctx);
    if (pending.operationId !== ctx.operationId || pending.sessionEpoch !== ctx.sessionEpoch || pending.signal !== ctx.signal)
      return refuse('REVIEW_REVOKED');
    if (ctx.nowSeconds < view.nowSeconds) return refuse('CLOCK');
    if (ctx.nowSeconds >= view.expiresAt) return refuse('REVIEW_EXPIRED');
    if (canonicalize(validateRecurringSnapshot(value)) !== pending.snapshot) return refuse('STALE_REVIEW');
    const period = view.periods[0];
    if (period === undefined || view.plan.status !== 'active') return refuse('NOT_DUE');
    return Object.freeze({ schema: 'ghostpay.recurring-period-selection/1', profileRef: view.profileRef,
      snapshotRevision: view.snapshotRevision, plan: view.plan, period, approvedAt: ctx.nowSeconds });
  }

  /**
   * Call on lock, cancellation, profile change, or component disposal. Aborting
   * the operation also clears this private context; the caller clears its UI copy.
   */
  public cancel(): void {
    const pending = this.#pending;
    this.#pending = undefined;
    pending?.signal.removeEventListener('abort', pending.onAbort);
  }
}
