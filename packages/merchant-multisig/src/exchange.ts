import { validateAccountState, type AccountState } from './account.js';
import { evaluateApprovals, MAX_APPROVALS, validateApproval, type Approval } from './approvals.js';
import { MultisigError } from './errors.js';
import type { MultisigPolicy } from './policy.js';
import { validateProposal, type Proposal } from './proposal.js';
import { readArray, readExact } from './validate.js';

/** Covers 64 queued proposals with 20 signatures each, with bounded parse work. */
export const MAX_STATE_EXCHANGE_BYTES = 1024 * 1024;
export const MAX_PROPOSAL_EXCHANGE_BYTES = 32 * 1024;

function parseBounded(text: string, max: number): unknown {
  if (typeof text !== 'string' || text.length > max || new TextEncoder().encode(text).length > max) {
    throw new MultisigError('LIMIT', 'exchange');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MultisigError('STATE', 'exchange');
  }
}

function envelope(raw: unknown, format: string, keys: readonly string[]): Record<string, unknown> {
  const r = readExact(raw, ['format', 'version', ...keys], 'STATE', 'exchange');
  if (r.format !== format || r.version !== 1) throw new MultisigError('STATE', 'exchange');
  return r;
}

/** Canonical bounded snapshot, without secrets. This is not authenticated storage. */
export function serializeAccountState(value: AccountState): string {
  return JSON.stringify({ format: 'ghostpay-merchant-account', version: 1, state: validateAccountState(value) });
}

/**
 * Imports only canonical output from serializeAccountState. Rejects duplicate JSON keys,
 * reordered keys, whitespace and other ambiguous representations by exact reserialization.
 * Trust policy/history independently; a valid old snapshot remains a rollback risk.
 */
export function parseAccountState(text: string): AccountState {
  const r = envelope(parseBounded(text, MAX_STATE_EXCHANGE_BYTES), 'ghostpay-merchant-account', ['state']);
  const state = validateAccountState(r.state);
  if (serializeAccountState(state) !== text) throw new MultisigError('STATE', 'exchange');
  return state;
}

export interface ProposalExchange {
  readonly proposal: Proposal;
  readonly approvals: readonly Approval[];
}

function validateExchange(policy: MultisigPolicy, proposal: unknown, approvals: unknown): ProposalExchange {
  const p = validateProposal(proposal);
  const a = readArray(approvals, MAX_APPROVALS, 'PROPOSAL', 'approvals').map(validateApproval);
  const evaluated = evaluateApprovals(policy, p, a);
  if (evaluated.rejected.length !== 0) throw new MultisigError('THRESHOLD');
  a.sort((left, right) => left.signer < right.signer ? -1 : 1);
  return Object.freeze({ proposal: p, approvals: Object.freeze(a) });
}

/** Shares canonical proposals and verified partial or full approval sets; does not queue them. */
export function serializeProposalExchange(policy: MultisigPolicy, value: ProposalExchange): string {
  const exchange = validateExchange(policy, value.proposal, value.approvals);
  return JSON.stringify({ format: 'ghostpay-merchant-proposal', version: 1, ...exchange });
}

/** Uses the caller's current trusted policy, not a policy supplied by the exchange. */
export function parseProposalExchange(text: string, policy: MultisigPolicy): ProposalExchange {
  const r = envelope(parseBounded(text, MAX_PROPOSAL_EXCHANGE_BYTES), 'ghostpay-merchant-proposal', ['proposal', 'approvals']);
  const exchange = validateExchange(policy, r.proposal, r.approvals);
  if (serializeProposalExchange(policy, exchange) !== text) throw new MultisigError('STATE', 'exchange');
  return exchange;
}
