import { zeroize, type SecretScalar } from '@ghostpay/core-crypto';
import {
  PolicySchemeError,
  UNLIMITED,
  ZERO_ADDRESS,
  buildCancelDestinationTypedData,
  buildCancelWithdrawTypedData,
  buildWithdrawTypedData,
  encodeCancelDestination,
  encodeCancelWithdraw,
  encodeDeployAccount,
  encodeExecuteWithdraw,
  encodeRequestWithdraw,
  getLimitProof,
  noLimitsProof,
  signPolicyTypedData,
  windowHeadroom,
  type Address,
  type CallRequest,
  type Hex,
  type PolicyRecord,
  type TokenLimitProof,
  type WindowState,
} from '@ghostpay/policy-scheme';
import { UserFacingError } from '../../lib/errors';
import type { AccountView, PolicyChainDeployment } from './chain';

export interface WithdrawPlanInput {
  readonly record: PolicyRecord;
  readonly view: AccountView;
  readonly token: Address;
  readonly balance: bigint;
  /** `windowState(token)`; ignored for accounts without limits. */
  readonly window: WindowState;
  /** Sum of other pending requests of this token (they may execute first). */
  readonly pendingSameToken: bigint;
  readonly nowSec: bigint;
}

export interface WithdrawPlan {
  /** Largest amount that can be requested now and still execute when the delay ends. 0 when blocked. */
  readonly max: bigint;
  readonly proof: TokenLimitProof | null;
  readonly limit: bigint | null;
  readonly executeAfter: bigint;
  /** Blocking problems (fixed sentences). */
  readonly problems: readonly string[];
}

const minOf = (...v: bigint[]): bigint => v.reduce((a, b) => (b < a ? b : a));

/**
 * Plans a withdrawal within the account's limits. Conservative: headroom is evaluated at the
 * earliest execution time (`now + delay`), and other pending requests of the token are subtracted
 * from both the balance and the window.
 */
export function planWithdraw(p: WithdrawPlanInput): WithdrawPlan {
  const problems: string[] = [];
  const delay = p.record.policy.delaySeconds;
  const executeAfter = p.nowSec + delay;
  if (!p.view.deployed) problems.push('The account is not deployed yet. Deploy it first (anyone may send the deployment).');
  else {
    if (p.view.policyHash !== p.record.policyHash) problems.push('The account on-chain uses a different policy than this record.');
    if (p.view.destination !== p.record.policy.destination) problems.push('The account destination differs from your record (it was changed on-chain). Review the alerts before withdrawing.');
    if (p.view.pendingDestination !== ZERO_ADDRESS) problems.push('A destination change is pending. Cancel or let it settle first: a request accepted now fails if the destination changes before execution.');
  }
  const free = p.balance > p.pendingSameToken ? p.balance - p.pendingSameToken : 0n;
  if (p.record.tree === null) {
    return { max: problems.length > 0 ? 0n : free, proof: null, limit: null, executeAfter, problems };
  }
  let proof: TokenLimitProof;
  try {
    proof = getLimitProof(p.record.tree, p.token);
  } catch (e) {
    if (e instanceof PolicySchemeError && e.code === 'UNKNOWN_TOKEN') {
      return { max: 0n, proof: null, limit: null, executeAfter, problems: [...problems, 'This token has no limit leaf in the policy, so it can never be withdrawn from this account.'] };
    }
    throw e;
  }
  let headroom: bigint;
  try {
    headroom = windowHeadroom(p.window, proof, executeAfter);
  } catch (e) {
    if (e instanceof PolicySchemeError && e.code === 'INVALID_LIMIT') {
      return { max: 0n, proof, limit: proof.limit, executeAfter, problems: [...problems, 'The account already tracks this token with another window length; executions would revert.'] };
    }
    throw e;
  }
  const windowFree = proof.limit === UNLIMITED ? UNLIMITED : headroom > p.pendingSameToken ? headroom - p.pendingSameToken : 0n;
  const max = problems.length > 0 ? 0n : minOf(free, windowFree, proof.limit);
  return { max, proof, limit: proof.limit, executeAfter, problems };
}

/** A uniformly random uint256 nonce (unordered bitmap nonces on-chain). */
export function randomNonce(rng: Pick<Crypto, 'getRandomValues'> = crypto): bigint {
  const b = new Uint8Array(32);
  rng.getRandomValues(b);
  return BigInt(`0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`);
}

export interface SignedWithdraw {
  /** Request id (struct hash); remembered so the guard does not flag our own request. */
  readonly id: Hex;
  readonly request: CallRequest;
  readonly execute: CallRequest;
}

/**
 * Signs a `Withdraw` order with the owner key and builds the relayable `requestWithdraw` call and the
 * later `executeWithdraw` call. The amount is re-checked against the plan here.
 */
export async function signWithdraw(p: {
  readonly chainId: number;
  readonly account: Address;
  readonly owner: Address;
  readonly record: PolicyRecord;
  readonly plan: WithdrawPlan;
  readonly token: Address;
  readonly amount: bigint;
  readonly deadline: bigint;
  readonly nonce: bigint;
  readonly ownerSecret: SecretScalar;
}): Promise<SignedWithdraw> {
  if (p.amount <= 0n || p.amount > p.plan.max) throw new UserFacingError('The amount is above what the policy allows right now.');
  const limit = p.record.tree === null || p.plan.proof === null ? null : { limitsRoot: p.record.policy.limitsRoot, proof: p.plan.proof };
  const td = buildWithdrawTypedData({ chainId: p.chainId, account: p.account, token: p.token, amount: p.amount, deadline: p.deadline, nonce: p.nonce, limit });
  const sig = await signPolicyTypedData(td, p.ownerSecret, p.owner);
  const request = encodeRequestWithdraw(td, limit === null ? noLimitsProof() : limit.proof, sig);
  return { id: td.structHash, request, execute: encodeExecuteWithdraw(p.account, td.structHash) };
}

/** Owner-signed cancel of a pending withdrawal or destination proposal (anyone may relay it). */
export async function signCancel(p: { readonly chainId: number; readonly account: Address; readonly owner: Address; readonly kind: 'withdraw' | 'destination'; readonly id: Hex; readonly ownerSecret: SecretScalar }): Promise<CallRequest> {
  if (p.kind === 'withdraw') {
    const td = buildCancelWithdrawTypedData(p.chainId, p.account, p.id);
    return encodeCancelWithdraw(p.account, p.id, await signPolicyTypedData(td, p.ownerSecret, p.owner));
  }
  const td = buildCancelDestinationTypedData(p.chainId, p.account, p.id);
  return encodeCancelDestination(p.account, p.id, await signPolicyTypedData(td, p.ownerSecret, p.owner));
}

/** Factory deployment call; refuses a factory fee (needs an approval this view does not build). */
export function deployCall(deployment: PolicyChainDeployment, owner: Address, record: PolicyRecord): CallRequest & { readonly account: Address } {
  if (deployment.flatFee !== 0n) throw new UserFacingError('This factory charges a deployment fee; the experimental view does not support fee approvals.');
  const d = encodeDeployAccount(deployment, owner, record.policy);
  return { to: d.to, data: d.data, value: d.value, account: d.account };
}

/** Best-effort wipe of an owner key copy. */
export function wipe(secret: SecretScalar | undefined): void {
  if (secret !== undefined) zeroize(secret);
}
