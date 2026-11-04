import { decodeFunctionData, keccak256, toBytes } from 'viem/utils';
import { erc20Abi } from '@ghostpay/chain-adapters';
import { decodePolicyPaymentCalldata, ghostPayPolicyRouterAbi, type Hex } from '@ghostpay/policy-scheme';
import { UserFacingError } from '../../lib/errors';
import { assertApproveTx, readAllowance } from '../../lib/pay';
import { PostBroadcastError, submitTx, type BroadcastFn, type Runtime, type StatusFn, type SubmitResult } from '../../lib/payExec';
import { browserAttemptStorage, readAttempts, type WalletAttempt } from '../../lib/duplicateAttemptJournal';
import { walletAttemptKey, type TxRequest, type WalletSession } from '../../lib/wallet';
import type { PolicyChainDeployment } from './chain';
import type { PreparedPolicyPayment } from './pay';

/** Exact transaction fields the review screen showed (a copy, so later changes to the prepared object are seen). */
export interface ReviewedPolicyPayment {
  readonly chainId: number;
  readonly payment: TxRequest;
  /** ERC-20 only: the reviewed `approve(router, gross)`. */
  readonly approval?: TxRequest;
}

/**
 * What a send must still match. `assertCurrent` is the session guard captured at review time
 * (`captureSessionVersionGuard`, as Pay uses); it is re-run immediately before every wallet request.
 */
export interface PolicySendGuard {
  readonly assertCurrent: () => void;
  readonly reviewed: ReviewedPolicyPayment;
  readonly deployment: PolicyChainDeployment;
}

const copyTx = (tx: TxRequest): TxRequest => Object.freeze({ to: tx.to, data: tx.data, value: tx.value });

/** Snapshot of the transactions shown on the review screen; pass it with the session guard to {@link sendPolicyPayment}. */
export function reviewPolicyPayment(prepared: PreparedPolicyPayment, deployment: PolicyChainDeployment): ReviewedPolicyPayment {
  return Object.freeze({ chainId: deployment.chainId, payment: copyTx(prepared.built.tx), ...(prepared.approval === undefined ? {} : { approval: copyTx(prepared.approval) }) });
}

const REVIEW_MISMATCH = 'Blocked: the transaction differs from what you reviewed. Review it again. Nothing was sent.';
const sameTx = (a: TxRequest, b: TxRequest): boolean => a.to.toLowerCase() === b.to.toLowerCase() && a.data.toLowerCase() === b.data.toLowerCase() && a.value === b.value;

/**
 * Synchronous final gate, run before every wallet request (inside `sendViaWallet`'s last authority check, after all
 * awaits): the session must be unchanged, the wallet on the reviewed chain, and both transactions byte-equal to the
 * review. The payment calldata is decoded again against the deployment and the approval is checked like Pay's.
 */
function assertStillReviewed(session: WalletSession, prepared: PreparedPolicyPayment, guard: PolicySendGuard, nowSeconds: number): void {
  guard.assertCurrent();
  const { reviewed, deployment } = guard;
  if (session.chainId !== reviewed.chainId || reviewed.chainId !== deployment.chainId) throw new UserFacingError(REVIEW_MISMATCH);
  if (!sameTx(prepared.built.tx, reviewed.payment)) throw new UserFacingError(REVIEW_MISMATCH);
  if ((prepared.approval === undefined) !== (reviewed.approval === undefined)) throw new UserFacingError(REVIEW_MISMATCH);
  if (prepared.approval !== undefined && reviewed.approval !== undefined && !sameTx(prepared.approval, reviewed.approval)) throw new UserFacingError(REVIEW_MISMATCH);
  if (prepared.built.tx.to.toLowerCase() !== deployment.router.toLowerCase()) throw new UserFacingError('Blocked: the payment is not addressed to the verified policy router. Nothing was sent.');
  let decoded: ReturnType<typeof decodePolicyPaymentCalldata>;
  try {
    decoded = decodePolicyPaymentCalldata(prepared.built.tx.data, deployment);
  } catch {
    throw new UserFacingError('Blocked: the payment calldata does not match the verified policy deployment. Nothing was sent.');
  }
  if (decoded.method !== prepared.built.method || decoded.stealth !== prepared.payment.accountAddress || decoded.owner !== prepared.payment.ownerAddress || decoded.policyHash !== prepared.payment.policyHash) {
    throw new UserFacingError('Blocked: the payment calldata does not match the derived policy account. Nothing was sent.');
  }
  const args = routerArgs(prepared);
  const gross = prepared.built.net + prepared.built.fee;
  const amountOk = prepared.token === 'native'
    ? prepared.built.tx.value === gross
    : prepared.built.tx.value === 0n && typeof args[0] === 'string' && args[0].toLowerCase() === prepared.token.toLowerCase() && args[3] === gross;
  if (!amountOk) throw new UserFacingError('Blocked: the payment calldata token or amount does not match the prepared payment. Nothing was sent.');
  // Same boundary as Pay's sendPayment guard: refused from the deadline second on (`now >= deadline`).
  const deadline = args[prepared.built.method === 'payNative' ? 3 : 5];
  if (typeof deadline !== 'bigint') throw new UserFacingError('Blocked: the payment deadline could not be read. Nothing was sent.');
  if (BigInt(nowSeconds) >= deadline) throw new UserFacingError('The prepared payment has expired. Review again.');
  if (prepared.token === 'native') {
    if (prepared.approval !== undefined) throw new UserFacingError('Blocked: a native payment must not carry a token approval. Nothing was sent.');
  } else {
    if (prepared.approval === undefined) throw new UserFacingError('The prepared token payment has no approval. Nothing was sent.');
    assertApproveTx(prepared.approval, prepared.token, deployment.router, prepared.built.net + prepared.built.fee);
  }
}

/**
 * Sends a prepared policy payment. For ERC-20: reads the router allowance; if short, sends the exact
 * approval, waits for its receipt and reads the allowance back. The payment is sent only after a
 * successful receipt and a sufficient readback. Every broadcast hash goes to `onBroadcast` before any
 * follow-up check, and a failure after broadcast is a {@link PostBroadcastError} (never "send again").
 *
 * @param guard Session guard and review snapshot; checked before any RPC read and again immediately before each
 *   wallet request, so a lock, key change or edited transaction refuses without contacting the wallet.
 */
export async function sendPolicyPayment(
  session: WalletSession,
  prepared: PreparedPolicyPayment,
  rt: Runtime,
  status: StatusFn,
  onBroadcast: BroadcastFn | undefined,
  guard: PolicySendGuard,
): Promise<SubmitResult> {
  const check = (): void => { assertStillReviewed(session, prepared, guard, rt.nowSeconds()); };
  // Single use: once a review has reached the wallet it is never sent again, whatever the outcome (M1).
  if (sentReviews.has(guard.reviewed) || sentReviews.has(prepared.built.tx)) throw new UserFacingError(ALREADY_SENT);
  check();
  const scope = policyPaymentScope(session, prepared, guard.deployment);
  refuseIfAlreadyPaid(walletAttemptKey(session, prepared.built.tx, { kind: 'payment', scope }));
  const router = prepared.built.tx.to;
  let approvalHash: Hex | undefined;
  const gross = prepared.built.tx.value === 0n ? grossOf(prepared) : prepared.built.tx.value;
  if (prepared.token !== 'native') {
    const token = prepared.token;
    const approval = prepared.approval;
    if (rt.rpc === undefined) throw new UserFacingError('A token payment needs an RPC for this network to check the approval. Configure one in Settings.');
    if (approval === undefined) throw new UserFacingError('The prepared token payment has no approval. Nothing was sent.');
    const have = await readAllowance(rt.rpc, token, session.account, router);
    if (have < gross) {
      status('Approve the router for exactly this amount.');
      markSent(guard, prepared);
      const res = await submitTx(session, approval, rt, status, check, onBroadcast, { kind: 'approval', scope });
      try {
        if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
        // Same rule as Pay's grantApproval (B2-R2): an uncompared mined approve may be another one.
        if (res.verification !== 'verified') throw new UserFacingError('Your RPC reports a receipt for the approval but did not return the transaction itself, so it could not be compared with the preview. Nothing was paid.');
        const after = await readAllowance(rt.rpc, token, session.account, router);
        if (after < gross) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
      } catch (e) {
        throw new PostBroadcastError(res.hash, e instanceof UserFacingError ? e.message : 'the allowance check failed.', e);
      }
      approvalHash = res.hash;
    }
  }
  const mined = approvalHash;
  // A refusal after a mined approval must not read as "nothing happened": the allowance stays on-chain.
  const paymentCheck = mined === undefined ? check : (): void => {
    try { check(); } catch (e) {
      if (!(e instanceof UserFacingError)) throw e;
      throw new UserFacingError(`${e.message.replaceAll(' Nothing was sent.', '')} The approval (${mined}) was already mined and the router allowance remains; no payment was sent. Revoke the allowance in your wallet if you will not pay.`);
    }
  };
  paymentCheck();
  markSent(guard, prepared);
  return submitTx(session, prepared.built.tx, rt, status, paymentCheck, onBroadcast, { kind: 'payment', scope });
}

const ALREADY_SENT = 'This review was already used for a wallet request, so it is never sent again (the payment may already have gone to your wallet). Check your wallet and a block explorer, then review a new payment only if nothing was sent.';
/** Reviews and prepared calls that have reached the wallet (identity, per tab). */
const sentReviews = new WeakSet<object>();
function markSent(guard: PolicySendGuard, prepared: PreparedPolicyPayment): void {
  sentReviews.add(guard.reviewed);
  sentReviews.add(prepared.built.tx);
}

/** A payment with this scope already returned a hash in this tab; `hash` is that transaction. */
export class PolicyAlreadyPaidError extends UserFacingError {
  public constructor(public readonly hash: string) {
    super(`You already sent this exact payment (same payee, token and amount) from this tab: transaction ${hash}. Check it in your wallet or a block explorer. To pay again on purpose, clear it under Wallet attempts first.`);
    this.name = 'PolicyAlreadyPaidError';
  }
}

/**
 * Names the earlier transaction instead of the journal's generic duplicate refusal, before any wallet request (the
 * approval included). Fails closed: a journal that cannot be read refuses. Without tab storage the wallet layer keeps
 * no journal either, so there is nothing to look up.
 */
function refuseIfAlreadyPaid(key: string): void {
  let earlier: WalletAttempt | undefined;
  try {
    const storage = browserAttemptStorage();
    if (storage === undefined) return;
    earlier = readAttempts(storage).find((a) => a.key === key);
  } catch (e) {
    throw e instanceof UserFacingError ? e : new UserFacingError('The wallet attempt journal is unavailable or invalid. No new wallet request was started.');
  }
  if (earlier?.status === 'submitted' && earlier.hash !== undefined) throw new PolicyAlreadyPaidError(earlier.hash);
}

/**
 * Duplicate-attempt scope of a policy payment (M2), stable across re-review: chain, payer, router, payee
 * meta-address, token and gross (each review derives a fresh stealth account and deadline, so the calldata differs).
 * Any earlier attempt with this scope blocks the wallet request: one with an unknown outcome, one that returned a hash,
 * and one that was verified and confirmed. Records do not expire; only the user clears them under Wallet attempts.
 * Policy payments have no invoice identity and the router has no replay guard, so this record is the only thing that
 * stops a silent second payment; a deliberate repeat needs that explicit clear (or a new tab). Matches Pay, whose
 * scope is the invoice digest.
 */
export function policyPaymentScope(session: WalletSession, prepared: PreparedPolicyPayment, deployment: PolicyChainDeployment): Hex {
  return keccak256(toBytes(JSON.stringify([
    'ghostpay-policy-payment-v1', session.chainId, session.account.toLowerCase(), deployment.router.toLowerCase(),
    prepared.metaAddress.trim().toLowerCase(), prepared.token === 'native' ? 'native' : prepared.token.toLowerCase(),
    (prepared.built.net + prepared.built.fee).toString(),
  ])));
}

/** Arguments of the exact router calldata that will be sent. */
function routerArgs(p: PreparedPolicyPayment): readonly unknown[] {
  return decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: p.built.tx.data }).args as readonly unknown[];
}

/** Gross amount of an ERC-20 payment, taken from the reviewed approval (amount == gross by construction). */
function grossOf(p: PreparedPolicyPayment): bigint {
  if (p.approval === undefined) throw new UserFacingError('The prepared token payment has no approval. Nothing was sent.');
  const d = decodeFunctionData({ abi: erc20Abi, data: p.approval.data });
  const amount = (d.args as readonly unknown[])[1];
  if (d.functionName !== 'approve' || typeof amount !== 'bigint' || amount !== p.built.net + p.built.fee) throw new UserFacingError('The prepared approval does not match the payment. Nothing was sent.');
  return amount;
}
