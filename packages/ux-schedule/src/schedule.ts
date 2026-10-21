import type { PaymentTemplate } from './template.js';
import { readClock, type Clock, err, ok, type Result } from './result.js';
import {
  evaluateRecurrence,
  type Evaluation,
  type MissedPolicy,
  type RecurrenceRule,
} from './recurrence.js';
import { DEFAULT_SCHEDULED_MAX_AGE_MS, tick, type ScheduledPayment } from './scheduled.js';
import type { TzOffset } from './time.js';

/** A recurring schedule bound to a template. Holds no secrets. */
export interface RecurringSchedule {
  readonly id: string;
  readonly templateId: string;
  readonly rule: RecurrenceRule;
  readonly paused: boolean;
  readonly policy: MissedPolicy;
  /** Newest occurrence handled (confirmed or dismissed) by the user. */
  readonly lastHandledMs: number | null;
}

/** Evaluate a schedule; a paused schedule yields nothing due. */
export function evaluateSchedule(
  s: RecurringSchedule,
  tz: TzOffset,
  clock: Clock,
  maxAgeMs?: number,
): Evaluation {
  if (s.paused) return { due: [], skipped: [], skippedCount: 0, nextMs: null };
  return evaluateRecurrence({
    rule: s.rule,
    tz,
    clock,
    lastHandledMs: s.lastHandledMs,
    policy: s.policy,
    ...(maxAgeMs === undefined ? {} : { maxAgeMs }),
  });
}

/** Record that the user handled (confirmed or dismissed) everything up to `occurrenceMs`. */
export function markHandled(s: RecurringSchedule, occurrenceMs: number): RecurringSchedule {
  if (!Number.isSafeInteger(occurrenceMs)) throw new RangeError('invalid occurrence');
  const last = s.lastHandledMs === null ? occurrenceMs : Math.max(s.lastHandledMs, occurrenceMs);
  return { ...s, lastHandledMs: last };
}

/**
 * Turn due occurrences into `due` ScheduledPayments using the template snapshot.
 * Ids are deterministic (`<scheduleId>@<dueAtMs>`) so re-evaluation cannot create duplicates.
 * @security Output is still unconfirmed; the amount/recipient come from the template at
 * this moment and are frozen in the snapshot, so later template edits cannot alter them.
 */
export function materializeDue(
  s: RecurringSchedule,
  template: PaymentTemplate,
  evaluation: Evaluation,
  clock: Clock,
  existing: readonly ScheduledPayment[] = [],
): Result<readonly ScheduledPayment[]> {
  if (template.id !== s.templateId) return err('template_mismatch', 'template does not match schedule');
  const now = readClock(clock);
  const have = new Set(existing.map((p) => p.id));
  const out: ScheduledPayment[] = [];
  for (const d of evaluation.due) {
    const id = `${s.id}@${d.dueAtMs}`;
    if (have.has(id)) continue;
    out.push(
      tick(
        {
          id,
          payment: {
            chain: template.chain,
            asset: template.asset,
            recipient: template.recipient,
            amount: template.amount,
            ...(template.memo === undefined ? {} : { memo: template.memo }),
          },
          dueAtMs: d.dueAtMs,
          createdAtMs: now,
          maxAgeMs: DEFAULT_SCHEDULED_MAX_AGE_MS,
          state: 'pending',
          stateChangedAtMs: now,
        },
        () => now,
      ),
    );
  }
  return ok(out);
}
