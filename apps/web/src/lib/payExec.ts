import { invoiceDigest } from '@ghostpay/invoice-schema';
import { bytesToHex } from '@noble/hashes/utils.js';
import { classifyPermit, type Address, type BuiltPayment, type Hex, type PermitState, type RpcClient } from '@ghostpay/chain-adapters';
import { UserFacingError } from './errors';
import { formatUnits } from './format';
import { guardApprove, guardRouterPayment, simulateCall } from './txGuard';
import {
  assertApproveTx,
  assertInvoiceStillPayable,
  assertPermitSigner,
  assertPreparedBufferFresh,
  assertBufferStillSufficient,
  assertReadyToSend,
  buildApproveTx,
  buildFinal,
  boundedDeadline,
  buildPermit,
  permitPreflightReader,
  permitStateMessage,
  readAllowance,
  typedDataJson,
  type BufferQuote,
  type PayContext,
} from './pay';
import {
  WalletBroadcastError,
  pollReceipt,
  sendViaWallet,
  signTypedDataViaWallet,
  verifySubmission,
  type ReceiptInfo,
  type SubmissionCheck,
  type TxRequest,
  type WalletSession,
  type WalletAttemptOptions,
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

/** A signed permit the post-sign pre-flight (spec 04) refused. Nothing was sent; the UI must not retry it silently. */
export class PermitRejectedError extends UserFacingError {
  public constructor(public readonly state: Exclude<PermitState, 'ok_to_permit' | 'already_allowed'>) {
    super(permitStateMessage(state));
    this.name = 'PermitRejectedError';
  }
}

export type StatusFn = (message: string) => void;
export type BroadcastFn = (hash: Hex) => void;

/** Sends one transaction, cross-checks it on the user's own RPC and waits for a receipt when an RPC exists. */
export async function submitTx(session: WalletSession, tx: TxRequest, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn, attempt?: WalletAttemptOptions): Promise<SubmitResult> {
  assertCurrent?.();
  status('Waiting for wallet confirmation…');
  let hash: Hex;
  try {
    hash = await sendViaWallet(session, tx, assertCurrent, attempt);
  } catch (e) {
    if (!(e instanceof WalletBroadcastError)) throw e;
    onBroadcast?.(e.hash);
    throw new PostBroadcastError(e.hash, 'the tab could not save the returned transaction hash.', e);
  }
  try {
    // Preserve the hash before any RPC request or application-session check can fail.
    onBroadcast?.(hash);
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
  } catch (e) {
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

/** Spec 04 payer-side subset of `PermitState`; nonce/signature states are caught by the send-time `eth_call` simulation. */
export type PayerPermitState = 'ok_to_permit' | 'already_allowed' | 'unsupported_token';

/**
 * Pre-flight before any permit signing prompt (spec 04). `already_allowed`: the router may already pull the gross
 * amount, so no signature is requested. `unsupported_token`: the on-chain permit domain could not be read or did not
 * match (DAI-style or non-standard token); the caller falls back to the exact-approval path the user reviews. Never
 * sends anything and never falls back silently: the caller shows which path is used.
 */
export async function classifyPayerPermit(ctx: PayContext, session: WalletSession, rt: Runtime): Promise<PayerPermitState> {
  const token = ctx.review.token;
  if (rt.rpc === undefined) throw new UserFacingError('A permit payment needs an RPC to read the token. Configure one in Settings or use approval.');
  if (token === undefined || token.address === 'native') return 'unsupported_token';
  const have = await readAllowance(rt.rpc, token.address, session.account, ctx.manifest.router);
  if (have >= ctx.request.grossAmount) return 'already_allowed';
  try {
    await buildPermit(rt.rpc, {
      chainId: ctx.chain.chainId, token: token.address, owner: session.account, spender: ctx.manifest.router,
      value: ctx.request.grossAmount, deadline: BigInt(rt.nowSeconds() + 20 * 60),
    });
    return 'ok_to_permit';
  } catch {
    return 'unsupported_token';
  }
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
  const res = await submitTx(session, tx, rt, status, assertCurrent, onBroadcast, { kind: 'approval' });
  try {
    if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The approval was not confirmed. Nothing was paid.');
    const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
    if (after < plan.need) throw new UserFacingError('The approval did not take effect. Nothing was paid.');
    return after;
  } catch (e) {
    throw new PostBroadcastError(res.hash, e instanceof UserFacingError ? e.message : 'the allowance check failed.', e);
  }
}

/** Revokes a router allowance with approve(spender, 0), then verifies it on-chain. */
export async function revokeApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn): Promise<void> {
  if (rt.rpc === undefined) throw new UserFacingError('Revoking needs an RPC for this chain. Configure one in Settings.');
  const tx = buildApproveTx(plan.token, plan.spender, 0n);
  assertApproveTx(tx, plan.token, plan.spender, 0n);
  guardApprove(tx, ctx.chain.chainId, { token: plan.token, spender: plan.spender, amount: 0n }, ctx.manifest, rt.nowSeconds());
  status(`Revoke the router allowance for ${plan.spender}.`);
  assertCurrent?.();
  const res = await submitTx(session, tx, rt, status, assertCurrent, onBroadcast, { kind: 'approval' });
  try {
    if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError('The revoke was not confirmed. Check your allowances in your wallet.');
    const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
    if (after !== 0n) throw new UserFacingError('The allowance is still not zero. Check your allowances in your wallet.');
  } catch (e) {
    throw new PostBroadcastError(res.hash, e instanceof UserFacingError ? e.message : 'the allowance check failed.', e);
  }
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
  // One deadline for the signed permit and the router calldata, bounded by invoice/fiat validity (never clamped later).
  const deadline = boundedDeadline(ctx.review.invoice, now);
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
  const sig = await signTypedDataViaWallet(session, typedDataJson(td), assertCurrent);
  assertCurrent?.();
  // The wallet may have held the request open: re-read the clock before using the signature.
  assertInvoiceStillPayable(ctx.review.invoice, rt.nowSeconds());
  await assertPermitSigner(td, sig, session.account);
  assertCurrent?.();
  // Spec 04 post-sign pre-flight: nonce, recovery and a static permit call. A front-run permit (allowance now set)
  // takes the allowance path; any other refusal stops here with its own message and nothing is sent.
  const state = await classifyPermit(
    {
      token: token.address,
      permitCapable: token.config?.permit === true,
      owner: session.account,
      spender: ctx.manifest.router,
      value: ctx.request.grossAmount,
      domain: td.domain,
      signed: { nonce: td.message.nonce, deadline: BigInt(deadline), signature: sig },
      now: BigInt(rt.nowSeconds()),
    },
    permitPreflightReader(rt.rpc),
  );
  assertCurrent?.();
  if (state === 'already_allowed') {
    status(permitStateMessage('already_allowed'));
    return buildFinal(ctx, { nowSeconds: now });
  }
  if (state !== 'ok_to_permit') throw new PermitRejectedError(state);
  return buildFinal(ctx, { nowSeconds: now, deadlineSeconds: deadline, permitSignature: sig });
}

/** Final gate and send. The assertion runs on exactly the object that is passed to the wallet. */
export async function sendPayment(session: WalletSession, ctx: PayContext, built: BuiltPayment, rt: Runtime, status: StatusFn, assertCurrent?: () => void): Promise<SubmitResult> {
  const guard = (): void => {
    assertCurrent?.();
    assertReadyToSend(built, ctx);
    assertInvoiceStillPayable(ctx.review.invoice, rt.nowSeconds());
    assertPreparedBufferFresh(built, rt.nowSeconds());
    if (BigInt(rt.nowSeconds()) >= built.preview.deadline) throw new UserFacingError('The prepared payment has expired. Review again.');
  };
  guard();
  // Independent decode of the exact calldata + allowlist/fee/deadline policy before the wallet is asked.
  guardRouterPayment(built.tx, built.preview, ctx.manifest, rt.nowSeconds());
  await assertBufferStillSufficient(built, rt.rpc);
  guard();
  if (rt.rpc !== undefined) await simulateCall(rt.rpc, { from: session.account, to: built.tx.to, data: built.tx.data, value: built.tx.value });
  guard();
  return submitTx(session, { to: built.tx.to, data: built.tx.data, value: built.tx.value }, rt, status, guard, undefined, { kind: 'payment', scope: bytesToHex(invoiceDigest(ctx.review.invoice)) });
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
