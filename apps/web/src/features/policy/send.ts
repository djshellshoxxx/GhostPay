import { decodeFunctionData } from 'viem/utils';
import { erc20Abi } from '@ghostpay/chain-adapters';
import { decodePolicyPaymentCalldata, ghostPayPolicyRouterAbi } from '@ghostpay/policy-scheme';
import { UserFacingError } from '../../lib/errors';
import { assertApproveTx, readAllowance } from '../../lib/pay';
import { PostBroadcastError, submitTx, type BroadcastFn, type Runtime, type StatusFn, type SubmitResult } from '../../lib/payExec';
import type { TxRequest, WalletSession } from '../../lib/wallet';
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
  // Same boundary as Pay's sendPayment guard: refused from the deadline second on (`now >= deadline`).
  if (BigInt(nowSeconds) >= deadlineOf(prepared)) throw new UserFacingError('The prepared payment has expired. Review again.');
  if (prepared.token === 'native') {
    if (prepared.approval !== undefined) throw new UserFacingError(REVIEW_MISMATCH);
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
  check();
  const router = prepared.built.tx.to;
  const gross = prepared.built.tx.value === 0n ? grossOf(prepared) : prepared.built.tx.value;
  if (prepared.token !== 'native') {
    const token = prepared.token;
    const approval = prepared.approval;
    if (rt.rpc === undefined) throw new UserFacingError('A token payment needs an RPC for this network to check the approval. Configure one in Settings.');
    if (approval === undefined) throw new UserFacingError('The prepared token payment has no approval. Nothing was sent.');
    const have = await readAllowance(rt.rpc, token, session.account, router);
    if (have < gross) {
      status('Approve the router for exactly this amount.');
      const res = await submitTx(session, approval, rt, status, check, onBroadcast, { kind: 'approval' });
      try {
        if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
        // Same rule as Pay's grantApproval (B2-R2): an uncompared mined approve may be another one.
        if (res.verification !== 'verified') throw new UserFacingError('Your RPC reports a receipt for the approval but did not return the transaction itself, so it could not be compared with the preview. Nothing was paid.');
        const after = await readAllowance(rt.rpc, token, session.account, router);
        if (after < gross) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
      } catch (e) {
        throw new PostBroadcastError(res.hash, e instanceof UserFacingError ? e.message : 'the allowance check failed.', e);
      }
    }
  }
  return submitTx(session, prepared.built.tx, rt, status, check, onBroadcast, { kind: 'payment' });
}

/** Router deadline read from the exact calldata that will be sent (`payNative` arg 3, the ERC-20 methods arg 5). */
function deadlineOf(p: PreparedPolicyPayment): bigint {
  const d = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: p.built.tx.data });
  const deadline = (d.args as readonly unknown[])[d.functionName === 'payNative' ? 3 : 5];
  if (typeof deadline !== 'bigint') throw new UserFacingError('Blocked: the payment deadline could not be read. Nothing was sent.');
  return deadline;
}

/** Gross amount of an ERC-20 payment, taken from the reviewed approval (amount == gross by construction). */
function grossOf(p: PreparedPolicyPayment): bigint {
  if (p.approval === undefined) throw new UserFacingError('The prepared token payment has no approval. Nothing was sent.');
  const d = decodeFunctionData({ abi: erc20Abi, data: p.approval.data });
  const amount = (d.args as readonly unknown[])[1];
  if (d.functionName !== 'approve' || typeof amount !== 'bigint' || amount !== p.built.net + p.built.fee) throw new UserFacingError('The prepared approval does not match the payment. Nothing was sent.');
  return amount;
}
