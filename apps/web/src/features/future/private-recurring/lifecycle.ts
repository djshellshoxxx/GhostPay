import { MAX_PERIOD_INDEX, periodIndexAt, periodStart, type Cadence, type ScheduleSpec } from '@ghostpay/merchant-billing';
import {
  MAX_RECURRING_PLANS, reference, refuse, timestamp, validateRecurringPlan, validateRecurringSnapshot,
  type RecurringPlanStateV1, type RecurringPlanV1, type RecurringSnapshotV1,
} from './model';

/**
 * Optimistic preconditions for a pure local state transition. The caller must bind
 * these values to the unlocked profile and compare-and-swap the encrypted state
 * through P05. Returning a snapshot does NOT reserve an invoice or persist it.
 */
export interface RecurringMutationContext {
  readonly profileRef: string;
  readonly expectedSnapshotRevision: string;
  readonly nextSnapshotRevision: string;
  readonly nowSeconds: number;
}

export type RecurringPlanTransition = 'pause' | 'resume' | 'cancel';

const CONTEXT_KEYS = ['profileRef', 'expectedSnapshotRevision', 'nextSnapshotRevision', 'nowSeconds'] as const;

/** Reject untrusted own keys, inherited properties, sparse values and accessors. */
function contextFields(value: unknown): Record<(typeof CONTEXT_KEYS)[number], unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refuse('SCHEMA');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return refuse('SCHEMA');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== CONTEXT_KEYS.length ||
      keys.some(key => typeof key !== 'string' || !CONTEXT_KEYS.includes(key as (typeof CONTEXT_KEYS)[number])))
    return refuse('SCHEMA');
  const fields: Record<string, unknown> = {};
  for (const key of CONTEXT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) return refuse('SCHEMA');
    Object.defineProperty(fields, key, { value: descriptor.value, enumerable: true, configurable: false });
  }
  return fields;
}

function verifiedContext(snapshot: RecurringSnapshotV1, value: RecurringMutationContext): {
  readonly revision: string;
  readonly nowSeconds: number;
} {
  const fields = contextFields(value);
  const profileRef = reference(fields.profileRef);
  const expected = reference(fields.expectedSnapshotRevision);
  const revision = reference(fields.nextSnapshotRevision);
  const nowSeconds = timestamp(fields.nowSeconds);
  if (profileRef !== snapshot.profileRef || expected !== snapshot.revision || revision === expected)
    return refuse('STALE_MUTATION');
  return { revision, nowSeconds };
}

function changeSnapshot(
  snapshot: RecurringSnapshotV1, revision: string, plans: readonly RecurringPlanStateV1[],
): RecurringSnapshotV1 {
  // Run the full strict snapshot validator again: no output before all invariants pass.
  return validateRecurringSnapshot({ ...snapshot, revision, plans });
}

function stateFor(snapshot: RecurringSnapshotV1, planId: string, expectedPlanRevision: string): RecurringPlanStateV1 {
  const id = reference(planId);
  const expected = reference(expectedPlanRevision);
  const state = snapshot.plans.find(candidate => candidate.plan.planId === id);
  if (state === undefined) return refuse('PLAN_MISSING');
  if (state.plan.revision !== expected) return refuse('STALE_MUTATION');
  return state;
}

/**
 * Safe first write for a new local plan. A new plan starts paused. Explicitly
 * resuming is a separate action; neither step writes storage or issues invoices.
 */
export function createRecurringPlan(
  input: unknown, planInput: unknown, context: RecurringMutationContext,
): RecurringSnapshotV1 {
  const snapshot = validateRecurringSnapshot(input);
  const { revision } = verifiedContext(snapshot, context);
  const plan = validateRecurringPlan(planInput);
  if (plan.status !== 'paused') return refuse('INVALID_TRANSITION');
  if (snapshot.plans.some(state => state.plan.planId === plan.planId)) return refuse('DUPLICATE');
  if (snapshot.plans.length >= MAX_RECURRING_PLANS) return refuse('LIMIT');
  return changeSnapshot(snapshot, revision, [
    ...snapshot.plans, { plan, nextPeriodIndex: 0 },
  ]);
}

function skippedCursor(state: RecurringPlanStateV1, nowSeconds: number): number {
  const schedule: ScheduleSpec = { anchor: state.plan.anchorSeconds, cadence: state.plan.cadence };
  if (nowSeconds < schedule.anchor) return state.nextPeriodIndex;
  let firstFuture: number;
  try {
    // The terminal index is a sentinel, never a billable period. No unbounded
    // loop is needed after months or years offline.
    if (periodStart(schedule, MAX_PERIOD_INDEX) <= nowSeconds) firstFuture = MAX_PERIOD_INDEX;
    else firstFuture = periodIndexAt(schedule, nowSeconds) + 1;
  } catch {
    return refuse('SCHEDULE');
  }
  return Math.max(state.nextPeriodIndex, firstFuture);
}

/**
 * Mutate only the selected future-plan status; preserve the entire historical
 * artifact outbox unchanged. Resume skips every previously unreserved period
 * whose UTC start is <= now, including the period beginning exactly now.
 *
 * This deliberately prevents billing missed/paused periods on resume. Once
 * cancelled, a plan is terminal. Existing signed invoices stay untouched.
 */
export function transitionRecurringPlan(
  input: unknown,
  planId: string,
  action: RecurringPlanTransition,
  expectedPlanRevision: string,
  nextPlanRevision: string,
  context: RecurringMutationContext,
): RecurringSnapshotV1 {
  const snapshot = validateRecurringSnapshot(input);
  const { revision, nowSeconds } = verifiedContext(snapshot, context);
  const state = stateFor(snapshot, planId, expectedPlanRevision);
  const nextRevision = reference(nextPlanRevision);
  if (nextRevision === state.plan.revision) return refuse('STALE_MUTATION');

  let status: RecurringPlanV1['status'];
  let nextPeriodIndex = state.nextPeriodIndex;
  switch (action) {
    case 'pause':
      if (state.plan.status !== 'active') return refuse('INVALID_TRANSITION');
      status = 'paused';
      break;
    case 'resume':
      if (state.plan.status !== 'paused') return refuse('INVALID_TRANSITION');
      status = 'active';
      nextPeriodIndex = skippedCursor(state, nowSeconds);
      break;
    case 'cancel':
      if (state.plan.status === 'cancelled') return refuse('INVALID_TRANSITION');
      status = 'cancelled';
      break;
    default:
      return refuse('INVALID_TRANSITION');
  }
  const updated: RecurringPlanStateV1 = {
    plan: { ...state.plan, revision: nextRevision, status }, nextPeriodIndex,
  };
  return changeSnapshot(snapshot, revision, snapshot.plans.map(item => item === state ? updated : item));
}

function sameCadence(a: Cadence, b: Cadence): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'custom') return b.kind === 'custom' && a.seconds === b.seconds;
  return b.kind !== 'custom' && a.every === b.every;
}

/**
 * Change future invoice terms while paused. Keep the plan identity, UTC anchor,
 * cadence and issued-period cursor immutable: a new billing schedule needs a
 * new plan identity and a separately reviewed migration, not silent remapping.
 */
export function reviseRecurringPlan(
  input: unknown,
  planId: string,
  nextPlanInput: unknown,
  expectedPlanRevision: string,
  context: RecurringMutationContext,
): RecurringSnapshotV1 {
  const snapshot = validateRecurringSnapshot(input);
  const { revision } = verifiedContext(snapshot, context);
  const state = stateFor(snapshot, planId, expectedPlanRevision);
  if (state.plan.status !== 'paused') return refuse('INVALID_TRANSITION');
  const plan = validateRecurringPlan(nextPlanInput);
  if (plan.status !== 'paused' || plan.planId !== state.plan.planId || plan.revision === state.plan.revision ||
      plan.anchorSeconds !== state.plan.anchorSeconds || !sameCadence(plan.cadence, state.plan.cadence))
    return refuse('INVALID_TRANSITION');
  const updated: RecurringPlanStateV1 = { plan, nextPeriodIndex: state.nextPeriodIndex };
  return changeSnapshot(snapshot, revision, snapshot.plans.map(item => item === state ? updated : item));
}
