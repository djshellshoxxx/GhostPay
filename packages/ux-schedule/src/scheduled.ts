import { err, ok, readClock, type Clock, type Result } from './result.js';
import { MS_DAY, MS_MIN } from './time.js';
import {
  checkKeys,
  isPlainObject,
  validAmount,
  validId,
  validInt,
  validRecipient,
  validText,
  validToken,
} from './validate.js';

export type ScheduledState = 'pending' | 'due' | 'confirmed' | 'cancelled' | 'expired';

export const MIN_MAX_AGE_MS = MS_MIN;
export const MAX_MAX_AGE_MS = 90 * MS_DAY;
export const DEFAULT_SCHEDULED_MAX_AGE_MS = 7 * MS_DAY;
/** Furthest-future due date accepted (5 years). */
export const MAX_HORIZON_MS = 5 * 365 * MS_DAY;
export const MAX_SCHEDULED = 500;

/** Immutable payment details captured at scheduling time. */
export interface PaymentSnapshot {
  readonly chain: string;
  readonly asset: string;
  readonly recipient: string;
  readonly amount: string;
  readonly memo?: string;
}

/**
 * A delayed payment. It can only ever become "due"; moving to "confirmed" requires an
 * explicit user acknowledgement echoing the recipient and amount. Nothing is sent here.
 */
export interface ScheduledPayment {
  readonly id: string;
  readonly payment: PaymentSnapshot;
  readonly dueAtMs: number;
  readonly createdAtMs: number;
  readonly maxAgeMs: number;
  readonly state: ScheduledState;
  readonly stateChangedAtMs: number;
}

const TERMINAL: readonly ScheduledState[] = ['confirmed', 'cancelled', 'expired'];

export function isTerminal(s: ScheduledState): boolean {
  return TERMINAL.includes(s);
}

const INPUT_KEYS = ['id', 'payment', 'dueAtMs', 'maxAgeMs'];
const PAY_KEYS = ['chain', 'asset', 'recipient', 'amount', 'memo'];

/** Validate an untrusted payment snapshot. */
export function validateSnapshot(raw: unknown): Result<PaymentSnapshot> {
  if (!isPlainObject(raw)) return err('bad_payment', 'payment must be an object');
  const k = checkKeys(raw, PAY_KEYS, 'payment');
  if (!k.ok) return k;
  const chain = validToken(raw['chain'], 'chain');
  if (!chain.ok) return chain;
  const asset = validToken(raw['asset'], 'asset');
  if (!asset.ok) return asset;
  const recipient = validRecipient(raw['recipient']);
  if (!recipient.ok) return recipient;
  const amount = validAmount(raw['amount']);
  if (!amount.ok) return amount;
  const base = {
    chain: chain.value,
    asset: asset.value,
    recipient: recipient.value,
    amount: amount.value,
  };
  if (raw['memo'] === undefined) return ok(base);
  const memo = validText(raw['memo'], 'memo', 0, 140);
  if (!memo.ok) return memo;
  return ok({ ...base, memo: memo.value });
}

/**
 * Schedule a payment. State starts as `pending` (or `due` if the date is already reached).
 * @security Requires a bounded due date and max age; never triggers a send.
 */
export function schedulePayment(input: unknown, clock: Clock): Result<ScheduledPayment> {
  if (!isPlainObject(input)) return err('bad_scheduled', 'input must be an object');
  const k = checkKeys(input, INPUT_KEYS, 'scheduled');
  if (!k.ok) return k;
  const id = validId(input['id'], 'id');
  if (!id.ok) return id;
  const pay = validateSnapshot(input['payment']);
  if (!pay.ok) return pay;
  const now = readClock(clock);
  const due = validInt(input['dueAtMs'], 'dueAtMs', 0, Number.MAX_SAFE_INTEGER);
  if (!due.ok) return due;
  if (due.value < now) return err('in_past', 'due date is in the past');
  if (due.value > now + MAX_HORIZON_MS) return err('too_far', 'due date is too far in the future');
  let maxAge = DEFAULT_SCHEDULED_MAX_AGE_MS;
  if (input['maxAgeMs'] !== undefined) {
    const m = validInt(input['maxAgeMs'], 'maxAgeMs', MIN_MAX_AGE_MS, MAX_MAX_AGE_MS);
    if (!m.ok) return m;
    maxAge = m.value;
  }
  return ok(
    tick(
      {
        id: id.value,
        payment: pay.value,
        dueAtMs: due.value,
        createdAtMs: now,
        maxAgeMs: maxAge,
        state: 'pending',
        stateChangedAtMs: now,
      },
      clock,
    ),
  );
}

/**
 * Advance time-driven transitions: pending -> due -> expired. Pure and idempotent.
 * Expiry is evaluated first so a long-offline app goes straight to `expired`.
 * @security The max-age guard: a payment more than maxAgeMs overdue can never be confirmed.
 */
export function tick(p: ScheduledPayment, clock: Clock): ScheduledPayment {
  if (isTerminal(p.state)) return p;
  const now = readClock(clock);
  if (now > p.dueAtMs + p.maxAgeMs) return { ...p, state: 'expired', stateChangedAtMs: now };
  if (p.state === 'pending' && now >= p.dueAtMs) {
    return { ...p, state: 'due', stateChangedAtMs: now };
  }
  return p;
}

/** User acknowledgement: must echo exactly what the confirmation screen displayed. */
export interface Acknowledgement {
  readonly userConfirmed: true;
  readonly recipient: string;
  readonly amount: string;
}

/**
 * Confirm a due payment. Does not send; the caller proceeds to the normal signing flow.
 * @security Only from `due`; stale (expired) payments are refused; recipient+amount must
 * match the stored snapshot, defeating UI/state substitution between display and confirm.
 */
export function confirm(p: ScheduledPayment, ack: Acknowledgement, clock: Clock): Result<ScheduledPayment> {
  const t = tick(p, clock);
  if (t.state === 'expired') return err('expired', 'payment is past its max age');
  if (t.state !== 'due') return err('bad_state', `cannot confirm from state ${t.state}`);
  if ((ack as { userConfirmed: unknown }).userConfirmed !== true) {
    return err('not_confirmed', 'explicit user confirmation required');
  }
  if (ack.recipient !== t.payment.recipient || ack.amount !== t.payment.amount) {
    return err('mismatch', 'acknowledged details do not match the scheduled payment');
  }
  return ok({ ...t, state: 'confirmed', stateChangedAtMs: readClock(clock) });
}

/** Cancel a non-terminal payment. */
export function cancel(p: ScheduledPayment, clock: Clock): Result<ScheduledPayment> {
  const t = tick(p, clock);
  if (isTerminal(t.state)) return err('bad_state', `cannot cancel from state ${t.state}`);
  return ok({ ...t, state: 'cancelled', stateChangedAtMs: readClock(clock) });
}

/** The "due, needs user confirm" item surfaced to the UI. */
export interface DueItem {
  readonly id: string;
  readonly payment: PaymentSnapshot;
  readonly dueAtMs: number;
  readonly overdueMs: number;
  /** Time left to confirm before the max-age guard expires it. */
  readonly expiresInMs: number;
  readonly needsUserConfirm: true;
}

export interface SweepResult {
  readonly payments: readonly ScheduledPayment[];
  readonly dueItems: readonly DueItem[];
}

/** Tick every payment and list those awaiting confirmation, oldest first. */
export function sweep(list: readonly ScheduledPayment[], clock: Clock): SweepResult {
  const now = readClock(clock);
  const payments = list.map((p) => tick(p, () => now));
  const dueItems = payments
    .filter((p) => p.state === 'due')
    .sort((a, b) => a.dueAtMs - b.dueAtMs || (a.id < b.id ? -1 : 1))
    .map((p) => ({
      id: p.id,
      payment: p.payment,
      dueAtMs: p.dueAtMs,
      overdueMs: now - p.dueAtMs,
      expiresInMs: p.dueAtMs + p.maxAgeMs - now,
      needsUserConfirm: true as const,
    }));
  return { payments, dueItems };
}

/** Add to a list with id uniqueness and size cap (idempotent scheduling is the caller's choice). */
export function addScheduled(
  list: readonly ScheduledPayment[],
  p: ScheduledPayment,
): Result<readonly ScheduledPayment[]> {
  if (list.length >= MAX_SCHEDULED) return err('too_many', 'scheduled payment limit reached');
  if (list.some((x) => x.id === p.id)) return err('duplicate_id', 'scheduled id already exists');
  return ok([...list, p]);
}
