/**
 * ADR-0028 candidate model, NOT deployed code or a cryptographic implementation.
 * Identities and the CREATE2 prediction are abstract inputs. `verify` is an oracle
 * for successful ECDSA / ERC-1271 verification; only the exact VALID result passes.
 * There is deliberately no import from, or export to, the application/contracts.
 */
import { isDeepStrictEqual } from 'node:util';

function requireState(condition, code) {
  if (!condition) throw new Error(code);
}

function integer(value) {
  requireState(Number.isSafeInteger(value) && value >= 0, 'INVALID_INTEGER');
  return value;
}

function add(left, right) {
  return integer(integer(left) + integer(right));
}

function identity(value) {
  requireState(typeof value === 'string' && value.length > 0 && value !== 'zero', 'INVALID_IDENTITY');
  return value;
}

export function counterfactualPlan(config) {
  const domain = {
    name: 'GhostPayPolicyRecoveryCandidate', version: 'UNACCEPTED-1',
    chain: identity(config.chain), account: identity(config.account),
    factory: identity(config.factory), implementation: identity(config.implementation),
    policyHash: identity(config.policyHash),
  };
  requireState(domain.account !== domain.implementation, 'IMPLEMENTATION_LOCKED');
  const initialOwner = identity(config.owner);
  const initialDestination = identity(config.destination);
  requireState(initialDestination !== domain.account, 'INVALID_DESTINATION');
  const delay = integer(config.delay);
  const challenge = integer(config.challenge);
  const objectionGrace = integer(config.objectionGrace);
  requireState(delay > 0 && challenge > 0, 'INVALID_PERIOD');
  return {
    domain, initialOwner, initialDestination, delay, challenge, objectionGrace,
    initialized: false, owner: null, destination: null, ownerEpoch: 0,
    destinationEpoch: 0, recoveryEpoch: 0, withdrawalEpoch: 0,
    usedNonces: [], withdrawals: [], transfers: [], pendingDestination: null,
    recovery: null, now: 0, lastOwnerActionAt: 0,
  };
}

/** Model an authenticated factory/CREATE2 initialization, not address derivation. */
export function initialize(plan, { caller, predictedAddress, owner, destination, policyHash }) {
  requireState(!plan.initialized, 'ALREADY_INITIALIZED');
  requireState(caller === plan.domain.factory && predictedAddress === plan.domain.account,
    'UNAUTHENTICATED_INITIALIZATION');
  requireState(owner === plan.initialOwner && destination === plan.initialDestination
    && policyHash === plan.domain.policyHash, 'COUNTERFACTUAL_COMMITMENT_CHANGED');
  return { ...structuredClone(plan), initialized: true, owner, destination };
}

/** An explicit authorization schema; an actual revision needs EIP-712 vectors. */
export function statement(state, action, args, nonce, deadline) {
  return {
    domain: structuredClone(state.domain), action, args: structuredClone(args),
    ownerEpoch: state.ownerEpoch, destinationEpoch: state.destinationEpoch,
    recoveryEpoch: state.recoveryEpoch, nonce, deadline,
  };
}

function authorize(next, command, role, args, verify) {
  integer(command.nonce);
  integer(command.deadline);
  requireState(next.now <= command.deadline, 'SIGNATURE_EXPIRED');
  const nonceKey = `${role}:${command.nonce}`;
  requireState(!next.usedNonces.includes(nonceKey), 'NONCE_USED');
  const expected = statement(next, command.kind, args, command.nonce, command.deadline);
  requireState(isDeepStrictEqual(command.authorization?.statement, expected), 'WRONG_STATEMENT');
  const signer = role === 'destination' ? next.destination : next.owner;
  let result;
  try {
    result = verify(signer, structuredClone(expected), command.authorization);
  } catch {
    result = 'REVERT';
  }
  requireState(result === 'VALID', 'INVALID_SIGNATURE');
  next.usedNonces.push(nonceKey);
}

function idle(next) {
  requireState(next.recovery === null, 'RECOVERY_PENDING');
}

/**
 * Atomic pure transition: invalid commands throw without mutating `state`.
 * A successful result can be serialized/replayed from canonical chain history.
 * The model does not establish completeness/finality of an RPC history.
 */
export function transition(state, command, verify = () => 'INVALID') {
  requireState(state.initialized, 'NOT_INITIALIZED');
  integer(command.now);
  requireState(command.now >= state.now, 'TIME_WENT_BACKWARDS');
  const next = structuredClone(state);
  next.now = command.now;
  switch (command.kind) {
    case 'heartbeat':
      authorize(next, command, 'owner', {}, verify);
      next.lastOwnerActionAt = next.now;
      break;
    case 'proposeDestination':
      idle(next);
      requireState(next.pendingDestination === null, 'DESTINATION_PENDING');
      identity(command.destination);
      requireState(command.destination !== next.domain.account, 'INVALID_DESTINATION');
      authorize(next, command, 'owner', { destination: command.destination }, verify);
      next.pendingDestination = {
        destination: command.destination, executeAt: add(next.now, add(next.delay, next.delay)),
      };
      next.lastOwnerActionAt = next.now;
      break;
    case 'executeDestination':
      idle(next);
      requireState(next.pendingDestination !== null, 'NO_DESTINATION');
      requireState(next.now >= next.pendingDestination.executeAt, 'TOO_EARLY');
      next.destination = next.pendingDestination.destination;
      next.pendingDestination = null;
      next.destinationEpoch = add(next.destinationEpoch, 1);
      // Invalidates requests even if an address rotates away and then back.
      next.withdrawalEpoch = add(next.withdrawalEpoch, 1);
      break;
    case 'requestWithdrawal':
      idle(next);
      identity(command.id);
      requireState(!next.withdrawals.some((request) => request.id === command.id), 'DUPLICATE_REQUEST');
      authorize(next, command, 'owner', { id: command.id }, verify);
      next.withdrawals.push({ id: command.id, epoch: next.withdrawalEpoch,
        destination: next.destination, executeAt: add(next.now, next.delay), status: 'pending' });
      next.lastOwnerActionAt = next.now;
      break;
    case 'executeWithdrawal': {
      idle(next);
      const request = next.withdrawals.find((candidate) => candidate.id === command.id);
      requireState(request?.status === 'pending', 'NO_PENDING_REQUEST');
      requireState(request.epoch === next.withdrawalEpoch
        && request.destination === next.destination, 'WITHDRAWAL_INVALIDATED');
      requireState(next.now >= request.executeAt, 'TOO_EARLY');
      request.status = 'executed';
      next.transfers.push({ id: request.id, recipient: next.destination });
      break;
    }
    case 'beginRecovery':
      idle(next);
      identity(command.newOwner);
      requireState(command.newOwner !== next.owner, 'SAME_OWNER');
      authorize(next, command, 'destination', { newOwner: command.newOwner }, verify);
      next.recoveryEpoch = add(next.recoveryEpoch, 1);
      next.recovery = {
        epoch: next.recoveryEpoch, oldOwner: next.owner, newOwner: command.newOwner,
        destination: next.destination, destinationEpoch: next.destinationEpoch,
        startedAt: next.now, executeAt: add(next.now, next.challenge),
        latestExecuteAt: add(add(next.now, next.challenge), next.objectionGrace), objected: false,
      };
      // O(1) invalidation, avoiding an attacker-grown array traversal on chain.
      next.withdrawalEpoch = add(next.withdrawalEpoch, 1);
      next.pendingDestination = null;
      break;
    case 'objectRecovery':
      requireState(next.recovery !== null, 'NO_RECOVERY');
      requireState(command.recoveryEpoch === next.recovery.epoch, 'WRONG_RECOVERY');
      requireState(!next.recovery.objected, 'OBJECTION_ALREADY_USED');
      requireState(next.now < next.recovery.executeAt, 'OBJECTION_CLOSED');
      authorize(next, command, 'owner', { recoveryEpoch: next.recovery.epoch }, verify);
      next.recovery.objected = true;
      // Computed from the original admission, never from objection/owner activity.
      next.recovery.executeAt = next.recovery.latestExecuteAt;
      next.lastOwnerActionAt = next.now;
      break;
    case 'cancelRecovery':
      throw new Error('CANCELLATION_NOT_AVAILABLE');
    case 'executeRecovery':
      requireState(next.recovery !== null, 'NO_RECOVERY');
      requireState(next.now >= next.recovery.executeAt, 'TOO_EARLY');
      requireState(next.destination === next.recovery.destination
        && next.destinationEpoch === next.recovery.destinationEpoch, 'AUTHORITY_CHANGED');
      next.owner = next.recovery.newOwner;
      next.ownerEpoch = add(next.ownerEpoch, 1);
      next.withdrawalEpoch = add(next.withdrawalEpoch, 1);
      next.recovery = null;
      // No revalidation of a mutable ERC-1271 wallet, signature or deadline here:
      // its authorization was consumed at admission. Execution is permissionless.
      break;
    default:
      throw new Error('UNKNOWN_COMMAND');
  }
  return next;
}

/** ADR-0023's old eligibility rule, kept solely to exhibit its counterexample. */
export function inactivityEligible(now, lastOwnerActionAt, inactivityPeriod) {
  return now >= lastOwnerActionAt + inactivityPeriod;
}
