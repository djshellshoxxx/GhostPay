import { decodeFunctionData } from 'viem/utils';
import { erc20Abi } from '@ghostpay/chain-adapters';
import { UserFacingError } from '../../lib/errors';
import { readAllowance } from '../../lib/pay';
import { PostBroadcastError, submitTx, type BroadcastFn, type Runtime, type StatusFn, type SubmitResult } from '../../lib/payExec';
import type { WalletSession } from '../../lib/wallet';
import type { PreparedPolicyPayment } from './pay';

/**
 * Sends a prepared policy payment. For ERC-20: reads the router allowance; if short, sends the exact
 * approval, waits for its receipt and reads the allowance back. The payment is sent only after a
 * successful receipt and a sufficient readback. Every broadcast hash goes to `onBroadcast` before any
 * follow-up check, and a failure after broadcast is a {@link PostBroadcastError} (never "send again").
 */
export async function sendPolicyPayment(
  session: WalletSession,
  prepared: PreparedPolicyPayment,
  rt: Runtime,
  status: StatusFn,
  onBroadcast?: BroadcastFn,
): Promise<SubmitResult> {
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
      const res = await submitTx(session, approval, rt, status, undefined, onBroadcast, { kind: 'approval' });
      try {
        if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
        const after = await readAllowance(rt.rpc, token, session.account, router);
        if (after < gross) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
      } catch (e) {
        throw new PostBroadcastError(res.hash, e instanceof UserFacingError ? e.message : 'the allowance check failed.', e);
      }
    }
  }
  return submitTx(session, prepared.built.tx, rt, status, undefined, onBroadcast, { kind: 'payment' });
}

/** Gross amount of an ERC-20 payment, taken from the reviewed approval (amount == gross by construction). */
function grossOf(p: PreparedPolicyPayment): bigint {
  if (p.approval === undefined) throw new UserFacingError('The prepared token payment has no approval. Nothing was sent.');
  const d = decodeFunctionData({ abi: erc20Abi, data: p.approval.data });
  const amount = (d.args as readonly unknown[])[1];
  if (d.functionName !== 'approve' || typeof amount !== 'bigint' || amount !== p.built.net + p.built.fee) throw new UserFacingError('The prepared approval does not match the payment. Nothing was sent.');
  return amount;
}
