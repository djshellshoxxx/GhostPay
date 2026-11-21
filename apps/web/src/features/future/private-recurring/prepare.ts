import { reference, refuse, validateRecurringSnapshot, type RecurringSnapshotV1 } from './model';
import {
  RecurringReviewController, type RecurringReview, type RecurringReviewContext,
} from './review';

/**
 * In-memory reviewed selection -> immutable *staged* prepared invoice reference.
 *
 * A valid review is single-use and cannot be serialized or replayed to prepare
 * another period through this controller. No network, keys, signatures, invoices,
 * storage writes, or user-visible exports occur here.
 *
 * IMPORTANT: Neither this return value nor its revision comparison is an
 * encrypted durable reservation or a proof of merchant authorization. P05 must
 * compare-and-swap the persisted snapshot before P04 is allowed to sign/export.
 */
export class RecurringPreparationController {
  readonly #reviews = new RecurringReviewController();

  /** Compute due periods and register a short-lived live user-review view. */
  public preview(value: unknown, planId: string, context: RecurringReviewContext): RecurringReview {
    return this.#reviews.preview(value, planId, context);
  }

  /**
   * Consume approval for the earliest due period and stage one prepared outbox
   * reference. A caller must atomically persist the result under the reviewed
   * source revision; on failure it must reconcile durable state before retrying.
   *
   * `artifactRef` is an opaque *local reservation reference*, not authenticated
   * invoice bytes. `prepared` never establishes issuance or payment evidence.
   */
  public prepareNext(
    view: RecurringReview,
    input: unknown,
    context: RecurringReviewContext,
    artifactRef: string,
    nextSnapshotRevision: string,
  ): RecurringSnapshotV1 {
    // Consumes the pending review on success AND refusal. This must happen
    // before any caller-supplied artifact or revision is considered.
    const approved = this.#reviews.approveNext(view, input, context);
    const snapshot = validateRecurringSnapshot(input);
    if (approved.profileRef !== snapshot.profileRef || approved.snapshotRevision !== snapshot.revision)
      return refuse('STALE_REVIEW');
    const nextRevision = reference(nextSnapshotRevision);
    if (nextRevision === snapshot.revision) return refuse('STALE_MUTATION');
    const localRef = reference(artifactRef);
    const state = snapshot.plans.find(item => item.plan.planId === approved.plan.planId);
    if (state === undefined || state.plan.revision !== approved.plan.revision ||
        state.plan.status !== 'active' || approved.period.index !== state.nextPeriodIndex)
      return refuse('STALE_REVIEW');

    const plans = snapshot.plans.map(item => item === state ? {
      plan: item.plan,
      nextPeriodIndex: item.nextPeriodIndex + 1,
    } : item);
    const outbox = [...snapshot.outbox, {
      eventId: approved.period.eventId,
      planId: approved.plan.planId,
      planRevision: approved.plan.revision,
      periodIndex: approved.period.index,
      kind: 'invoice' as const,
      artifactRef: localRef,
      status: 'prepared' as const,
    }];
    // Strict validation enforces both per-period and per-artifact uniqueness,
    // bounded outbox size, cursor monotonicity and immutable detached records.
    return validateRecurringSnapshot({ ...snapshot, revision: nextRevision, plans, outbox });
  }

  /** Revoke the live review on lock, identity change, cancellation or disposal. */
  public cancel(): void {
    this.#reviews.cancel();
  }
}
