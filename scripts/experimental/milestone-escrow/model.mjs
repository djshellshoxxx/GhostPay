/**
 * UNACCEPTED DESIGN AID. No contract, custody implementation, or production API.
 * Adapts GhostPay's policy-recovery model's pure transitions and authorization
 * oracle pattern. SHA-256 below is a model snapshot identifier, NOT EIP-712.
 * Identities, canonical inclusion and successful exact-value token transfers
 * are explicit assumptions. Only states produced here are valid model inputs.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const MAX = (1n << 256n) - 1n;
const TERMINAL = new Set(['Released', 'Refunded', 'Resolved']);
function requireState(condition, code) {
  if (!condition) throw new Error(code);
}
function uint(value) {
  requireState(typeof value === 'bigint' && value >= 0n && value <= MAX, 'INVALID_UINT256');
  return value;
}
function identity(value) {
  requireState(typeof value === 'string' && value.length > 0 && value.length <= 128
    && value !== 'zero', 'INVALID_IDENTITY');
  return value;
}
const encode = (value) => JSON.stringify(value, (_, item) =>
  typeof item === 'bigint' ? { uint256: item.toString() } : item);

/** Every authority-affecting option is explicit; no default selects a policy. */
export function createStage(config) {
  const terms = {
    chainId: uint(config.chainId), escrow: identity(config.escrow), token: identity(config.token),
    termsCommitment: identity(config.termsCommitment), buyer: identity(config.buyer),
    seller: identity(config.seller), buyerDestination: identity(config.buyerDestination),
    sellerDestination: identity(config.sellerDestination), amount: uint(config.amount),
    disputeWindow: uint(config.disputeWindow), releaseMode: config.releaseMode,
    disputeMode: config.disputeMode, arbiter: config.arbiter,
  };
  requireState(terms.chainId > 0n && terms.amount > 0n && terms.disputeWindow > 0n, 'ZERO_TERM');
  requireState(terms.buyer !== terms.seller && terms.buyer !== terms.escrow
    && terms.seller !== terms.escrow && terms.buyerDestination !== terms.escrow
    && terms.sellerDestination !== terms.escrow, 'INVALID_PARTIES');
  requireState(['mutual', 'timeout'].includes(terms.releaseMode), 'EXPLICIT_RELEASE_MODE_REQUIRED');
  requireState(['mutual', 'fixed-arbiter'].includes(terms.disputeMode), 'EXPLICIT_DISPUTE_MODE_REQUIRED');
  if (terms.disputeMode === 'fixed-arbiter') {
    identity(terms.arbiter);
    requireState(![terms.buyer, terms.seller, terms.escrow].includes(terms.arbiter), 'INVALID_ARBITER');
  } else {
    requireState(terms.arbiter === null, 'ARBITER_NOT_ALLOWED');
  }
  return { terms, status: 'Created', now: 0n, stageNonce: 0n, funded: 0n,
    balance: 0n, released: 0n, refunded: 0n, submittedAt: null, releaseAt: null,
    evidenceCommitment: null, outcome: null, transfers: [] };
}

export function snapshotHash(state) {
  return createHash('sha256').update(encode(state)).digest('hex');
}

function payload(state, command) {
  const { amount, buyerDestination, sellerDestination } = state.terms;
  switch (command.kind) {
    case 'fund': return { amount: command.amount, destination: state.terms.escrow };
    case 'submit': return { evidenceCommitment: command.evidenceCommitment };
    case 'dispute': return { initiator: command.initiator };
    case 'release': return { amount, destination: sellerDestination };
    case 'refund': return { amount, destination: buyerDestination };
    case 'resolve': return { route: command.route, outcome: command.outcome, amount,
      destination: command.outcome === 'release' ? sellerDestination : buyerDestination };
    default: throw new Error('UNKNOWN_COMMAND');
  }
}

/** Abstract statement, not a proposed signing API or an EIP-712 type vector. */
export function statement(state, command) {
  return { domain: { name: 'GhostPayMilestoneModel', version: 'UNACCEPTED-1',
    terms: structuredClone(state.terms) }, stageNonce: uint(command.stageNonce),
    action: command.kind, args: payload(state, command), deadline: uint(command.deadline),
    stateHash: snapshotHash(state) };
}

function authorize(state, command, signers, verify) {
  requireState(command.now <= uint(command.deadline), 'SIGNATURE_EXPIRED');
  requireState(Array.isArray(command.authorizations)
    && command.authorizations.length === signers.length, 'WRONG_AUTHORIZATION_COUNT');
  const expected = statement(state, command);
  for (const signer of signers) {
    const matches = command.authorizations.filter((item) => item?.signer === signer);
    requireState(matches.length === 1, 'MISSING_OR_DUPLICATE_SIGNER');
    requireState(isDeepStrictEqual(matches[0].statement, expected), 'WRONG_STATEMENT');
    let result;
    try { result = verify(signer, structuredClone(expected), structuredClone(matches[0])); }
    catch { result = 'REVERT'; }
    requireState(result === 'VALID', 'INVALID_SIGNATURE');
  }
}

function transfer(next, outcome, terminal) {
  const amount = next.balance;
  requireState(amount === next.terms.amount && amount > 0n, 'WRONG_BALANCE');
  next.balance = 0n;
  next[outcome === 'release' ? 'released' : 'refunded'] += amount;
  next.transfers.push({ amount, destination: outcome === 'release'
    ? next.terms.sellerDestination : next.terms.buyerDestination, outcome });
  next.status = terminal;
  next.outcome = outcome;
}

/** Atomic pure transition. A rejected command never changes the caller's state. */
export function transition(state, command, verify = () => 'INVALID') {
  requireState(!TERMINAL.has(state.status), 'TERMINAL_STATE');
  requireState(uint(command.now) >= state.now, 'TIME_WENT_BACKWARDS');
  requireState(uint(command.stageNonce) === state.stageNonce, 'STALE_STAGE_NONCE');
  const next = structuredClone(state);
  const { buyer, seller } = state.terms;
  const both = [buyer, seller];
  switch (command.kind) {
    case 'fund':
      requireState(state.status === 'Created', 'WRONG_STATE');
      requireState(uint(command.amount) === state.terms.amount, 'WRONG_AMOUNT');
      authorize(state, command, [buyer], verify);
      next.funded = command.amount;
      next.balance = command.amount;
      next.status = 'Funded';
      break;
    case 'submit':
      requireState(state.status === 'Funded', 'WRONG_STATE');
      identity(command.evidenceCommitment);
      authorize(state, command, [seller], verify);
      next.submittedAt = command.now;
      next.releaseAt = uint(command.now + state.terms.disputeWindow);
      next.evidenceCommitment = command.evidenceCommitment;
      next.status = 'WorkSubmitted';
      break;
    case 'dispute':
      requireState(state.status === 'WorkSubmitted', 'WRONG_STATE');
      requireState(command.now < state.releaseAt, 'DISPUTE_WINDOW_CLOSED');
      requireState(both.includes(command.initiator), 'INVALID_INITIATOR');
      authorize(state, command, [command.initiator], verify);
      next.status = 'Disputed';
      break;
    case 'release':
      requireState(state.status === 'WorkSubmitted', 'WRONG_STATE');
      requireState(command.now >= state.releaseAt, 'TOO_EARLY');
      if (state.terms.releaseMode === 'mutual') authorize(state, command, both, verify);
      transfer(next, 'release', 'Released');
      break;
    case 'refund':
      requireState(['Funded', 'WorkSubmitted'].includes(state.status), 'WRONG_STATE');
      authorize(state, command, both, verify);
      transfer(next, 'refund', 'Refunded');
      break;
    case 'resolve':
      requireState(state.status === 'Disputed', 'WRONG_STATE');
      requireState(['release', 'refund'].includes(command.outcome), 'INVALID_OUTCOME');
      requireState(command.route === 'mutual' || (command.route === 'arbiter'
        && state.terms.disputeMode === 'fixed-arbiter'), 'INVALID_RESOLUTION_ROUTE');
      // The brief's release lock also applies to a favorable dispute decision.
      if (command.outcome === 'release') requireState(command.now >= state.releaseAt, 'TOO_EARLY');
      authorize(state, command, command.route === 'mutual' ? both : [state.terms.arbiter], verify);
      transfer(next, command.outcome, 'Resolved');
      break;
    default: throw new Error('UNKNOWN_COMMAND');
  }
  next.now = command.now;
  next.stageNonce = uint(state.stageNonce + 1n);
  assertConservation(next);
  return next;
}

/** Shared ledger property; assumes model-generated state, not arbitrary import. */
export function assertConservation(state) {
  for (const field of ['funded', 'balance', 'released', 'refunded']) uint(state[field]);
  requireState(state.funded === state.balance + state.released + state.refunded, 'CONSERVATION_FAILED');
  requireState(state.funded === (state.status === 'Created' ? 0n : state.terms.amount), 'FUNDING_FAILED');
  requireState(state.transfers.length === (TERMINAL.has(state.status) ? 1 : 0), 'TRANSFER_COUNT_FAILED');
  requireState(!TERMINAL.has(state.status) || state.balance === 0n, 'TERMINAL_BALANCE_FAILED');
  let paid = 0n;
  for (const item of state.transfers) {
    requireState(item.amount === state.terms.amount && item.destination ===
      (item.outcome === 'release' ? state.terms.sellerDestination : state.terms.buyerDestination),
    'DESTINATION_FAILED');
    paid += item.amount;
  }
  requireState(paid === state.released + state.refunded, 'PAYOUT_FAILED');
}

/** Caller supplies the selected complete canonical history; no RPC/finality proof. */
export function replay(config, commands, verify) {
  return commands.reduce((state, command) => transition(state, command, verify), createStage(config));
}
