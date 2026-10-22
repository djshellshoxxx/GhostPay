import type { Address, BuiltPayment, Hex, RpcClient } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';
import { formatUnits } from './format';
import { guardApprove, guardRouterPayment, simulateCall } from './txGuard';
import {
  assertApproveTx,
  assertPermitSigner,
  assertReadyToSend,
  buildApproveTx,
  buildFinal,
  buildPermit,
  readAllowance,
  typedDataJson,
  type BufferQuote,
  type PayContext,
} from './pay';
import {
  pollReceipt,
  sendViaWallet,
  signTypedDataViaWallet,
  verifySubmission,
  type ReceiptInfo,
  type SubmissionCheck,
  type TxRequest,
  type WalletSession,
} from './wallet';

export interface Runtime {
  /** Verified RPC for the invoice chain, if the user configured one. */
  readonly rpc: RpcClient | undefined;
  readonly nowSeconds: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface SubmitResult {
  readonly hash: Hex;
  readonly verification: SubmissionCheck | 'no-rpc';
  readonly receipt: ReceiptInfo | undefined;
}

/**
 * Thrown when the wallet already broadcast the transaction (a hash exists) but the follow-up checks failed. The UI must
 * never offer to send again: the payment may be on its way.
 */
export class PostBroadcastError extends UserFacingError {
  public constructor(
    public readonly hash: Hex,
    detail: string,
    cause?: unknown,
  ) {
    super(`Your wallet already sent this transaction (hash ${hash}), but it could not be verified: ${detail} It may still go through. Check your wallet and a block explorer before doing anything else; do not send again.`);
    this.name = 'PostBroadcastError';
    this.cause = cause;
  }
}

export type StatusFn = (message: string) => void;
export type BroadcastFn = (hash: Hex) => void;

/** Sends one transaction, cross-checks it on the user's own RPC and waits for a receipt when an RPC exists. */
export async function submitTx(session: WalletSession, tx: TxRequest, rt: Runtime, status: StatusFn): Promise<SubmitResult> {
  status('Waiting for wallet confirmation…');
  const hash = await sendViaWallet(session, tx);
  if (rt.rpc === undefined) {
    status('Submitted. No RPC is configured, so this app could not independently verify the transaction.');
    return { hash, verification: 'no-rpc', receipt: undefined };
  }
  try {
    status('Submitted. Verifying the transaction on your RPC…');
    const verification = await verifySubmission(
      rt.rpc,
      hash,
      { from: session.account, to: tx.to, data: tx.data, value: tx.value, chainId: session.chainId },
      rt.sleep,
    );
    status('Waiting for inclusion…');
    const receipt = await pollReceipt(rt.rpc, hash, tx.to, rt.sleep);
    return { hash, verification, receipt };
  } catch (e) {
    // The broadcast already happened: keep the hash, never let the caller treat this as "nothing was sent".
    throw new PostBroadcastError(hash, e instanceof UserFacingError ? e.message : 'the RPC check failed.', e);
  }
}

export interface ApprovalPlan {
  readonly token: Address;
  readonly spender: Address;
  readonly need: bigint;
  readonly have: bigint;
  readonly required: boolean;
}

/** Reads the current allowance and produces the exact approval preview; sends nothing. */
export async function planApproval(ctx: PayContext, session: WalletSession, token: Address, rt: Runtime): Promise<ApprovalPlan> {
  if (rt.rpc === undefined) throw new UserFacingError('Approving a token needs an RPC for this chain. Configure one in Settings.');
  const spender = ctx.manifest.router;
  const need = ctx.request.grossAmount;
  const have = await readAllowance(rt.rpc, token, session.account, spender);
  return { token, spender, need, have, required: have < need };
}

/** Sends only the exact allowance shown in the final preview and reads back what the wallet actually granted. */
export async function grantApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn): Promise<bigint> {
  if (rt.rpc === undefined) throw new UserFacingError('Approving a token needs an RPC for this chain. Configure one in Settings.');
  if (!plan.required) return plan.have;
  const tx = buildApproveTx(plan.token, plan.spender, plan.need);
  assertApproveTx(tx, plan.token, plan.spender, plan.need);
  guardApprove(tx, ctx.chain.chainId, { token: plan.token, spender: plan.spender, amount: plan.need }, ctx.manifest, rt.nowSeconds());
  status(`Approve exactly ${formatUnits(plan.need, ctx.review.token?.decimals ?? 18)} ${ctx.review.token?.symbol ?? ''} for the router.`);
  assertCurrent?.();
  const res = await submitTx(session, tx, rt, status);
  onBroadcast?.(res.hash);
  if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
  const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
  if (after < plan.need) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
  return after;
}

/** Revokes a router allowance with approve(spender, 0), then verifies it on-chain. */
export async function revokeApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn): Promise<void> {
  if (rt.rpc === undefined) throw new UserFacingError('Revoking needs an RPC for this chain. Configure one in Settings.');
  const tx = buildApproveTx(plan.token, plan.spender, 0n);
  assertApproveTx(tx, plan.token, plan.spender, 0n);
  guardApprove(tx, ctx.chain.chainId, { token: plan.token, spender: plan.spender, amount: 0n }, ctx.manifest, rt.nowSeconds());
  status(`Revoke the router allowance for ${plan.spender}.`);
  assertCurrent?.();
  const res = await submitTx(session, tx, rt, status);
  onBroadcast?.(res.hash);
  if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The revoke was not confirmed. Check your allowances in your wallet.');
  const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
  if (after !== 0n) throw new UserFacingError('The allowance is still not zero. Check your allowances in your wallet.');
}

export interface PrepareOptions {
  readonly usePermit: boolean;
  readonly buffer?: BufferQuote;
}

/**
 * Prepares the final payment: optional permit signature (verified to recover to the payer), then the transaction and
 * its preview from one build call. Nothing is sent here.
 */
export async function preparePayment(session: WalletSession, ctx: PayContext, opts: PrepareOptions, rt: Runtime, status: StatusFn, assertCurrent?: () => void): Promise<BuiltPayment> {
  const now = rt.nowSeconds();
  const token = ctx.review.token;
  if (opts.usePermit && opts.buffer !== undefined) throw new UserFacingError('A gas buffer cannot be combined with a permit payment.');
  if (!opts.usePermit || token === undefined || token.address === 'native') {
    return buildFinal(ctx, { nowSeconds: now, ...(opts.buffer === undefined ? {} : { buffer: opts.buffer }) });
  }
  if (rt.rpc === undefined) throw new UserFacingError('A permit payment needs an RPC to read the token. Configure one in Settings or use approval.');
  const deadline = now + 20 * 60;
  const td = await buildPermit(rt.rpc, {
    chainId: ctx.chain.chainId,
    token: token.address,
    owner: session.account,
    spender: ctx.manifest.router,
    value: ctx.request.grossAmount,
    deadline: BigInt(deadline),
  });
  status(`Sign a permit allowing the router to pull exactly ${formatUnits(ctx.request.grossAmount, token.decimals)} ${token.symbol} (no gas).`);
  assertCurrent?.();
  const sig = await signTypedDataViaWallet(session, typedDataJson(td));
  assertCurrent?.();
  await assertPermitSigner(td, sig, session.account);
  return buildFinal(ctx, { nowSeconds: now, deadlineSeconds: deadline, permitSignature: sig });
}

/** Final gate and send. The assertion runs on exactly the object that is passed to the wallet. */
export async function sendPayment(session: WalletSession, ctx: PayContext, built: BuiltPayment, rt: Runtime, status: StatusFn, assertCurrent?: () => void): Promise<SubmitResult> {
  assertCurrent?.();
  assertReadyToSend(built, ctx);
  if (BigInt(rt.nowSeconds()) >= built.preview.deadline) throw new UserFacingError('The prepared payment has expired. Review again.');
  // Independent decode of the exact calldata + allowlist/fee/deadline policy before the wallet is asked (S3-09, S3-19).
  guardRouterPayment(built.tx, built.preview, ctx.manifest, rt.nowSeconds());
  // Dry run where the user's node supports it: a payment that would revert is never sent to the wallet.
  if (rt.rpc !== undefined) await simulateCall(rt.rpc, { from: session.account, to: built.tx.to, data: built.tx.data, value: built.tx.value });
  assertCurrent?.();
  return submitTx(session, { to: built.tx.to, data: built.tx.data, value: built.tx.value }, rt, status);
}

export interface LocalReceipt {
  readonly kind: 'ghostpay-local-receipt';
  readonly version: 1;
  readonly chainId: number;
  readonly txHash: Hex;
  readonly router: Address;
  readonly token: string;
  readonly gross: string;
  readonly fee: string;
  readonly net: string;
  readonly invoiceNonce: string;
  readonly fiat: string;
  readonly quote: { readonly source: string; readonly timestamp: number; readonly expiresAt: number };
  readonly status: 'included' | 'reverted' | 'unconfirmed';
  readonly createdAt: string;
}

/** Local-only receipt for export. It contains amounts and times; the UI warns before sharing. */
export function buildReceipt(ctx: PayContext, built: BuiltPayment, result: SubmitResult, now: Date): LocalReceipt {
  const inv = ctx.review.invoice;
  return {
    kind: 'ghostpay-local-receipt',
    version: 1,
    chainId: ctx.chain.chainId,
    txHash: result.hash,
    router: built.preview.router,
    token: built.preview.token,
    gross: built.preview.gross.toString(),
    fee: built.preview.fee.toString(),
    net: built.preview.net.toString(),
    invoiceNonce: inv.nonce,
    fiat: `${inv.fiat.currency} ${inv.fiat.minorUnits}`,
    quote: { source: inv.quote.source, timestamp: inv.quote.timestamp, expiresAt: inv.quote.expiresAt },
    status: result.receipt === undefined ? 'unconfirmed' : result.receipt.status === 'success' ? 'included' : 'reverted',
    createdAt: now.toISOString(),
  };
}
