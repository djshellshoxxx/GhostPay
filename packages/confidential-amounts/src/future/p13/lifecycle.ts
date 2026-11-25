/**
 * P13 operation lifecycle, settlement-evidence interpretation and stale-completion guards (spec "Lifecycle, error and
 * recovery"; COMMON section 5). A transaction hash, SDK success or ciphertext handle is never positive evidence.
 */
import { classifyPayment } from '../../payment.js';
import { check, fail } from './errors.js';
import type { SecretAmount } from './secret.js';

/** Persisted states. `unavailable`/`research-qualified` are capability states, not record states. */
export type P13State = 'prepared' | 'reviewed' | 'authorized' | 'submitted' | 'unknown' | 'verified' | 'reverted' | 'cancelled';

/** All record states. */
export const P13_STATES: readonly P13State[] = [
  'prepared', 'reviewed', 'authorized', 'submitted', 'unknown', 'verified', 'reverted', 'cancelled',
];

const TRANSITIONS: Readonly<Record<P13State, readonly P13State[]>> = {
  prepared: ['reviewed', 'cancelled'],
  // Account, chain or policy change invalidates the review: back to prepared.
  reviewed: ['authorized', 'prepared', 'cancelled'],
  // Unsent work can still be cancelled locally.
  authorized: ['submitted', 'cancelled'],
  // Once submitted, actual chain state wins: no cancel, no resend.
  submitted: ['unknown', 'verified', 'reverted'],
  unknown: ['unknown', 'verified', 'reverted', 'submitted'],
  // A reorg rolls observations back to pending.
  verified: ['submitted'],
  reverted: ['submitted'],
  cancelled: [],
};

/** True if `s` is a known state. */
export function isP13State(s: unknown): s is P13State {
  return typeof s === 'string' && (P13_STATES as readonly string[]).includes(s);
}

/** @throws {P13Error} `P13_TRANSITION` for a transition the lifecycle does not allow. */
export function assertTransition(from: P13State, to: P13State): void {
  check(isP13State(from) && isP13State(to) && TRANSITIONS[from].includes(to), 'P13_TRANSITION', 'transition not allowed');
}

/** True if the record may have had an external effect (signing or later): never delete, never resend blindly. */
export function mayHaveEffect(s: P13State): boolean {
  return s !== 'prepared' && s !== 'reviewed' && s !== 'cancelled';
}

/** Observed settlement facts for one payment. */
export interface EvidenceInput {
  readonly receipt: 'none' | 'success' | 'reverted';
  readonly confirmations: number;
  readonly minConfirmations: number;
  readonly expectedNet: SecretAmount;
  /** Decrypted delivered net, if the seller has decrypted it. */
  readonly delivered?: SecretAmount;
}

/** Interpretation of {@link EvidenceInput}. */
export interface EvidenceVerdict {
  readonly state: 'verified' | 'unknown' | 'reverted';
  readonly reason: 'no-receipt' | 'confirmations' | 'not-decrypted' | 'zero-delivery' | 'underpaid' | 'delivered' | 'reverted';
}

/**
 * Interprets evidence (P13-A06, A09). `verified` needs a confirmed successful receipt AND a decrypted delivery of at
 * least the expected net; a silent zero transfer or underpayment stays `unknown`, never `verified`.
 */
export function interpretEvidence(e: EvidenceInput): EvidenceVerdict {
  check(
    Number.isSafeInteger(e.confirmations) && e.confirmations >= 0 && Number.isSafeInteger(e.minConfirmations) && e.minConfirmations >= 1,
    'P13_RECORD_INVALID',
    'invalid confirmation counts',
  );
  if (e.receipt === 'none') return { state: 'unknown', reason: 'no-receipt' };
  if (e.confirmations < e.minConfirmations) return { state: 'unknown', reason: 'confirmations' };
  if (e.receipt === 'reverted') return { state: 'reverted', reason: 'reverted' };
  check(e.receipt === 'success', 'P13_RECORD_INVALID', 'invalid receipt status');
  if (e.delivered === undefined) return { state: 'unknown', reason: 'not-decrypted' };
  const delivered = e.delivered;
  const status = e.expectedNet.reveal((expected) => delivered.reveal((got) => classifyPayment(expected, got)));
  if (status === 'confirmed') return { state: 'verified', reason: 'delivered' };
  return { state: 'unknown', reason: status === 'failed_insufficient_balance' ? 'zero-delivery' : 'underpaid' };
}

/** COMMON `OperationContext`. */
export interface OperationContext {
  readonly operationId: string;
  readonly sessionEpoch: number;
  readonly signal: AbortSignal;
  /** Absolute deadline, milliseconds on the injected clock. */
  readonly deadlineMs: number;
}

/** Current identity/session epoch; changes on lock, account, chain or key change. */
export interface EpochSource {
  current(): number;
}

/** @throws {P13Error} `P13_CANCELLED` if aborted; `P13_STALE` on epoch change or past the deadline. */
export function assertLive(ctx: OperationContext, epoch: EpochSource, nowMs: number): void {
  if (ctx.signal.aborted) fail('P13_CANCELLED', 'operation cancelled');
  check(ctx.sessionEpoch === epoch.current(), 'P13_STALE', 'session changed');
  check(nowMs <= ctx.deadlineMs, 'P13_STALE', 'operation deadline passed');
}

/**
 * Runs `fn` and re-checks liveness after it settles, so a late result cannot enter a newer session (P13-A11).
 * The result of a stale run is dropped; the caller must not persist or display it.
 */
export async function guarded<T>(
  ctx: OperationContext,
  epoch: EpochSource,
  clock: () => number,
  fn: () => Promise<T>,
): Promise<T> {
  assertLive(ctx, epoch, clock());
  const value = await fn();
  assertLive(ctx, epoch, clock());
  return value;
}
