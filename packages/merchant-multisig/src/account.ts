import { evaluateApprovals, type Approval } from './approvals.js';
import { U64_MAX } from './encoding.js';
import { MultisigError } from './errors.js';
import { MAX_POLICY_VERSION, validatePolicy, type MultisigPolicy } from './policy.js';
import { MAX_TIMESTAMP, validateProposal, type Proposal } from './proposal.js';

/** Maximum queued (approved, timelocked) proposals per account. */
export const MAX_QUEUED = 64;
/** Tolerated future skew of `createdAt` relative to the executor clock, in seconds. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

/** A proposal that reached threshold and is waiting for its timelock. */
export interface QueuedProposal {
  readonly digest: string;
  readonly proposal: Proposal;
  readonly approvals: readonly Approval[];
  /** Unix seconds when threshold was observed by the executor. */
  readonly queuedAt: number;
  /** `queuedAt + timelock(kind)`. */
  readonly executableAt: number;
}

/** Executor-side account state. Immutable: every transition returns a new object. */
export interface AccountState {
  readonly policy: MultisigPolicy;
  /** Canonical decimal u64: the only nonce the next proposal may use. */
  readonly nextNonce: string;
  readonly queued: readonly QueuedProposal[];
}

/** Result of {@link queueProposal}. */
export interface QueueResult {
  readonly state: AccountState;
  /** The queued entry, or `undefined` for a cancel (which applies immediately). */
  readonly queued: QueuedProposal | undefined;
  /** Digests removed by a cancel. */
  readonly cancelled: readonly string[];
}

/** Result of {@link executeProposal}. */
export interface ExecuteResult {
  readonly state: AccountState;
  /** The proposal the host must now carry out (payout/refund) or that was applied (config). */
  readonly executed: Proposal;
  /** Queued digests invalidated because a config change rotated the policy. */
  readonly invalidated: readonly string[];
}

function checkNow(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || now > MAX_TIMESTAMP) throw new MultisigError('STATE', 'now');
}

function freezeState(
  policy: MultisigPolicy,
  nextNonce: string,
  queued: readonly QueuedProposal[],
): AccountState {
  return Object.freeze({ policy, nextNonce, queued: Object.freeze([...queued]) });
}

/**
 * Creates the initial state for an account.
 *
 * @param policy Policy (validated).
 * @returns State with nonce 0 and an empty queue.
 * @throws {MultisigError} `POLICY` if invalid.
 */
export function createAccountState(policy: MultisigPolicy): AccountState {
  return freezeState(validatePolicy(policy), '0', []);
}

function timelockFor(policy: MultisigPolicy, p: Proposal): number {
  return p.kind === 'cancel' ? 0 : policy.timelocks[p.kind];
}

/**
 * Admits a proposal that has reached threshold.
 *
 * @remarks Checks, in order: validity, binding (account/chain/policy hash), nonce
 * equals `nextNonce` (strictly sequential; consumed here so it can never be
 * reused), validity window (`createdAt <= now + skew`, `now < expiresAt`),
 * threshold, and that the timelock can elapse before expiry. Payout/refund/config
 * are queued with `executableAt = now + timelock(kind)`. A `cancel` removes its
 * target from the queue immediately.
 *
 * @param state Current state.
 * @param proposal Untrusted proposal.
 * @param approvals Untrusted approvals.
 * @param now Injected clock (unix seconds).
 * @returns New state and the queued entry.
 * @throws {MultisigError} `BINDING`, `REPLAY`, `EXPIRED`, `THRESHOLD`, `TIMELOCK`, `STATE`, `LIMIT`.
 * @security Trust boundary. `now` must come from the executor's own clock, never
 * from the proposal or a remote party.
 */
export function queueProposal(
  state: AccountState,
  proposal: Proposal,
  approvals: readonly Approval[],
  now: number,
): QueueResult {
  checkNow(now);
  const policy = validatePolicy(state.policy);
  const p = validateProposal(proposal);
  const evaluation = evaluateApprovals(policy, p, approvals); // includes binding check
  if (p.nonce !== state.nextNonce) throw new MultisigError('REPLAY', 'nonce');
  if (p.createdAt > now + MAX_CLOCK_SKEW_SECONDS || now >= p.expiresAt) throw new MultisigError('EXPIRED');
  if (!evaluation.thresholdMet) throw new MultisigError('THRESHOLD');
  const nonce = BigInt(p.nonce);
  if (nonce === U64_MAX) throw new MultisigError('LIMIT', 'nonce');
  const nextNonce = (nonce + 1n).toString();
  const kept = state.queued.filter((q) => now < q.proposal.expiresAt);

  if (p.kind === 'cancel') {
    const target = kept.find((q) => q.digest === p.targetDigest);
    if (target === undefined) throw new MultisigError('STATE', 'targetDigest');
    return Object.freeze({
      state: freezeState(
        policy,
        nextNonce,
        kept.filter((q) => q !== target),
      ),
      queued: undefined,
      cancelled: Object.freeze([target.digest]),
    });
  }

  const executableAt = now + timelockFor(policy, p);
  if (executableAt >= p.expiresAt) throw new MultisigError('TIMELOCK');
  if (kept.length >= MAX_QUEUED) throw new MultisigError('LIMIT', 'queued');
  // Keep only the approvals that counted (copied, so later mutation of the input cannot alter them).
  const rejectedIdx = new Set(evaluation.rejected.map((r) => r.index));
  const counted = approvals
    .filter((_, i) => !rejectedIdx.has(i))
    .map((a) => Object.freeze({ signer: a.signer, signature: a.signature }));
  const entry: QueuedProposal = Object.freeze({
    digest: evaluation.digest,
    proposal: p,
    approvals: Object.freeze(counted),
    queuedAt: now,
    executableAt,
  });
  return Object.freeze({
    state: freezeState(policy, nextNonce, [...kept, entry]),
    queued: entry,
    cancelled: Object.freeze([]),
  });
}

/**
 * Executes a queued proposal whose timelock has elapsed.
 *
 * @remarks Re-verifies the stored approvals against the current policy (defence
 * in depth against a tampered persisted state). A config change installs the new
 * signer set with `version + 1` and drops every other queued proposal, because
 * they commit to the old policy hash. For payout/refund the caller must perform
 * the transfer; for on-chain enforcement see the wiring document.
 *
 * @param state Current state.
 * @param digest Digest of the queued proposal (lowercase hex).
 * @param now Injected clock (unix seconds).
 * @returns New state and the executed proposal.
 * @throws {MultisigError} `STATE` (not queued), `TIMELOCK`, `EXPIRED`, `THRESHOLD`, `BINDING`, `LIMIT`.
 * @security Trust boundary. Off-chain policy only: it cannot stop a key holder
 * from moving funds directly unless the on-chain account enforces the same policy.
 */
export function executeProposal(state: AccountState, digest: string, now: number): ExecuteResult {
  checkNow(now);
  const policy = validatePolicy(state.policy);
  const entry = state.queued.find((q) => q.digest === digest);
  if (entry === undefined) throw new MultisigError('STATE', 'digest');
  if (now >= entry.proposal.expiresAt) throw new MultisigError('EXPIRED');
  // Recompute rather than trusting stored `executableAt`.
  if (now < entry.queuedAt + timelockFor(policy, entry.proposal) || now < entry.executableAt) {
    throw new MultisigError('TIMELOCK');
  }
  const evaluation = evaluateApprovals(policy, entry.proposal, entry.approvals);
  if (!evaluation.thresholdMet || evaluation.digest !== digest) throw new MultisigError('THRESHOLD');
  const rest = state.queued.filter((q) => q !== entry);

  if (entry.proposal.kind === 'config') {
    if (policy.version >= MAX_POLICY_VERSION) throw new MultisigError('LIMIT', 'version');
    const next = validatePolicy({
      accountId: policy.accountId,
      chainId: policy.chainId,
      version: policy.version + 1,
      ...entry.proposal.newPolicy,
    });
    return Object.freeze({
      state: freezeState(next, state.nextNonce, []),
      executed: entry.proposal,
      invalidated: Object.freeze(rest.map((q) => q.digest)),
    });
  }
  return Object.freeze({
    state: freezeState(policy, state.nextNonce, rest),
    executed: entry.proposal,
    invalidated: Object.freeze([]),
  });
}

/**
 * Drops queued proposals that expired at or before `now`.
 *
 * @param state Current state.
 * @param now Injected clock (unix seconds).
 * @returns New state and the dropped digests.
 */
export function pruneExpired(
  state: AccountState,
  now: number,
): { readonly state: AccountState; readonly dropped: readonly string[] } {
  checkNow(now);
  const kept = state.queued.filter((q) => now < q.proposal.expiresAt);
  const dropped = state.queued.filter((q) => now >= q.proposal.expiresAt).map((q) => q.digest);
  return Object.freeze({
    state: freezeState(state.policy, state.nextNonce, kept),
    dropped: Object.freeze(dropped),
  });
}
