import type { Address, BuiltPayment, Hex, RpcClient } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';
import { formatUnits } from './format';
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

export type StatusFn = (message: string) => void;

/** Sends one transaction, cross-checks it on the user's own RPC and waits for a receipt when an RPC exists. */
export async function submitTx(session: WalletSession, tx: TxRequest, rt: Runtime, status: StatusFn): Promise<SubmitResult> {
  status('Waiting for wallet confirmation…');
  const hash = await sendViaWallet(session, tx);
  if (rt.rpc === undefined) {
    status('Submitted. No RPC is configured, so this app could not independently verify the transaction.');
    return { hash, verification: 'no-rpc', receipt: undefined };
  }
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
}

/** ERC-20 approval step for non-permit payments (and buffer payments). Requires an RPC to read the allowance. */
export async function ensureAllowance(
  session: WalletSession,
  ctx: PayContext,
  token: Address,
  rt: Runtime,
  status: StatusFn,
): Promise<'already-approved' | 'approved'> {
  if (rt.rpc === undefined) throw new UserFacingError('Approving a token needs an RPC for this chain. Configure one in Settings.');
  const spender = ctx.verified.router;
  const need = ctx.request.grossAmount;
  const have = await readAllowance(rt.rpc, token, session.account, spender);
  if (have >= need) return 'already-approved';
  const tx = buildApproveTx(token, spender, need);
  assertApproveTx(tx, token, spender, need);
  status(`Approve exactly ${formatUnits(need, ctx.review.token?.decimals ?? 18)} ${ctx.review.token?.symbol ?? ''} for the router.`);
  const res = await submitTx(session, tx, rt, status);
  if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
  const after = await readAllowance(rt.rpc, token, session.account, spender);
  if (after < need) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
  return 'approved';
}

/** What the ERC-20 approval step will do, decided and shown BEFORE anything is sent (S3-19). */
export interface ApprovalPlan {
  readonly token: Address;
  readonly spender: Address;
  /** Exact amount that would be approved: the gross payment. Never unlimited. */
  readonly need: bigint;
  /** Allowance the router already has from this account. */
  readonly have: bigint;
  readonly required: boolean;
}

/** Reads the current allowance; sends nothing. */
export async function planApproval(session: WalletSession, ctx: PayContext, token: Address, rt: Runtime): Promise<ApprovalPlan> {
  if (rt.rpc === undefined) throw new UserFacingError('Approving a token needs an RPC for this chain. Configure one in Settings.');
  const spender = ctx.verified.router;
  const need = ctx.request.grossAmount;
  const have = await readAllowance(rt.rpc, token, session.account, spender);
  return { token, spender, need, have, required: have < need };
}

/**
 * Sends the exact-amount approval and reads the allowance back. Returns the allowance that really exists afterwards, which
 * can exceed `need` if the wallet let the user edit the spending cap: the caller must show that and offer to revoke.
 */
export async function grantApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn): Promise<bigint> {
  if (rt.rpc === undefined) throw new UserFacingError('Approving a token needs an RPC for this chain. Configure one in Settings.');
  const tx = buildApproveTx(plan.token, plan.spender, plan.need);
  assertApproveTx(tx, plan.token, plan.spender, plan.need);
  status(`Approve exactly ${formatUnits(plan.need, ctx.review.token?.decimals ?? 18)} ${ctx.review.token?.symbol ?? ''} for the router ${plan.spender}.`);
  const res = await submitTx(session, tx, rt, status);
  if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
  const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
  if (after < plan.need) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
  return after;
}

/** `approve(router, 0)`: removes the allowance. Exact calldata is asserted like any approval. */
export async function revokeApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn): Promise<void> {
  if (rt.rpc === undefined) throw new UserFacingError('Revoking needs an RPC for this chain. Configure one in Settings.');
  const tx = buildApproveTx(plan.token, plan.spender, 0n);
  assertApproveTx(tx, plan.token, plan.spender, 0n);
  status(`Revoke the router’s allowance (approve 0) for ${plan.spender}.`);
  const res = await submitTx(session, tx, rt, status);
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
export async function preparePayment(session: WalletSession, ctx: PayContext, opts: PrepareOptions, rt: Runtime, status: StatusFn): Promise<BuiltPayment> {
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
    spender: ctx.verified.router,
    value: ctx.request.grossAmount,
    deadline: BigInt(deadline),
  });
  status(`Sign a permit allowing the router to pull exactly ${formatUnits(ctx.request.grossAmount, token.decimals)} ${token.symbol} (no gas).`);
  const sig = await signTypedDataViaWallet(session, typedDataJson(td));
  await assertPermitSigner(td, sig, session.account);
  return buildFinal(ctx, { nowSeconds: now, deadlineSeconds: deadline, permitSignature: sig });
}

/** Final gate and send. The assertion runs on exactly the object that is passed to the wallet. */
export async function sendPayment(session: WalletSession, ctx: PayContext, built: BuiltPayment, rt: Runtime, status: StatusFn): Promise<SubmitResult> {
  assertReadyToSend(built, ctx);
  if (BigInt(rt.nowSeconds()) >= built.preview.deadline) throw new UserFacingError('The prepared payment has expired. Review again.');
  return submitTx(session, { to: built.tx.to, data: built.tx.data, value: built.tx.value }, rt, status);
}

export interface LocalReceipt {
  readonly kind: 'ghostpay-local-receipt';
  readonly version: 1;
  readonly chainId: number;
  readonly txHash: Hex;
  readonly router: Address;
  /** As read from the router contract on-chain. */
  readonly feeRecipient: Address;
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
    feeRecipient: ctx.verified.feeRecipient,
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
