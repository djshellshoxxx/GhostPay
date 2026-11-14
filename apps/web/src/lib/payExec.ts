import { invoiceDigest } from '@ghostpay/invoice-schema';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ChainAdapterError, classifyPermit, type Address, type BuiltPayment, type Hex, type PermitState, type RpcClient } from '@ghostpay/chain-adapters';
import { UserFacingError, type MessageDescriptor } from './errors';
import { TransactionOutcomeError, reportTransactionStatus, type TransactionStatusFn } from './transactionOutcome';
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
  permitStateDescriptor,
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
  /**
   * `verified`: the user's RPC returned exactly the previewed transaction. `not-visible-yet`: it returned none and no
   * receipt appeared in time. `unverified`: a receipt exists, but the RPC never returned the transaction to compare.
   */
  readonly verification: SubmissionCheck | 'unverified' | 'no-rpc';
  readonly receipt: ReceiptInfo | undefined;
}

// i18n-use: transaction.code
/**
 * Thrown when the wallet already broadcast the transaction (a hash exists) but the follow-up checks failed. The UI must
 * never offer to send again: the payment may be on its way.
 */
export class PostBroadcastError extends TransactionOutcomeError {
  public constructor(
    public readonly hash: Hex,
    detail: string | MessageDescriptor,
    cause?: unknown,
  ) {
    // Only typed, public diagnostics cross the boundary; arbitrary RPC error properties may contain private data.
    const code = cause instanceof TransactionOutcomeError ? cause.outcome.code
      : cause instanceof ChainAdapterError ? cause.code : undefined;
    super({
      phase: 'verification-incomplete', hash,
      ...(code === undefined ? {} : { code }),
      message: { key: 'transaction.postBroadcast', values: {
        hash, detail,
        diagnostic: code === undefined ? '' : { key: 'transaction.code', values: { code: String(code) } },
      } },
    });
    this.name = 'PostBroadcastError';
    this.cause = cause;
  }
}

/** A signed permit the post-sign pre-flight (spec 04) refused. Nothing was sent; the UI must not retry it silently. */
export class PermitRejectedError extends UserFacingError {
  public constructor(public readonly state: Exclude<PermitState, 'ok_to_permit' | 'already_allowed'>) {
    super(permitStateDescriptor(state));
    this.name = 'PermitRejectedError';
  }
}

export type StatusFn = TransactionStatusFn;
export type BroadcastFn = (hash: Hex) => void;

/** Only known post-submission diagnostics can be nested here; pre-sign refusals may claim that nothing was sent. */
function postBroadcastDetail(error: unknown, fallback: 'rpc' | 'allowance'): MessageDescriptor {
  if (error instanceof UserFacingError && error.translation !== undefined) {
    switch (error.translation.key) {
      case 'transaction.submissionMismatch':
      case 'error.wallet.yourRPCReturnedAnUnexpectedTransactionShape':
      case 'error.wallet.yourRPCReturnedAnUnexpectedReceiptShape':
      case 'error.payExec.theApprovalWasNotConfirmedNothingWasPaid':
      case 'error.payExec.yourRPCReportsAReceiptForTheApprovalButDid':
      case 'error.payExec.theApprovalDidNotTakeEffectNothingWasPaid':
      case 'error.payExec.theRevokeWasNotConfirmedCheckYourAllowancesInYour':
      case 'error.payExec.yourRPCReportsAReceiptForTheRevokeButDid':
      case 'error.payExec.theAllowanceIsStillNotZeroCheckYourAllowancesIn':
        return error.translation;
      default: break;
    }
  }
  return { key: fallback === 'rpc' ? 'transaction.detail.rpcFailed' : 'transaction.detail.allowanceFailed' };
}

/** Sends one transaction, cross-checks it on the user's own RPC and waits for a receipt when an RPC exists. */
export async function submitTx(session: WalletSession, tx: TxRequest, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn, attempt?: WalletAttemptOptions): Promise<SubmitResult> {
  assertCurrent?.();
  reportTransactionStatus(status, { phase: 'awaiting-authorization', message: { key: 'transaction.phase.authorization' } });
  let hash: Hex;
  try {
    hash = await sendViaWallet(session, tx, assertCurrent, attempt);
  } catch (e) {
    if (!(e instanceof WalletBroadcastError)) throw e;
    // A notification failure cannot erase a hash already returned by the wallet.
    try { onBroadcast?.(e.hash); } catch { /* The typed error below still carries the exact hash. */ }
    throw new PostBroadcastError(e.hash, { key: 'transaction.detail.saveHash' }, e);
  }
  try {
    // Preserve the hash before any RPC request or application-session check can fail.
    onBroadcast?.(hash);
    if (rt.rpc === undefined) {
      reportTransactionStatus(status, { phase: 'verification-incomplete', hash, message: { key: 'transaction.status.noRpc' } });
      return { hash, verification: 'no-rpc', receipt: undefined };
    }
    reportTransactionStatus(status, { phase: 'broadcast-attempted', hash, message: { key: 'transaction.status.verifying' } });
    const expected = { from: session.account, to: tx.to, data: tx.data, value: tx.value, chainId: session.chainId };
    const seen = await verifySubmission(rt.rpc, hash, expected, rt.sleep);
    reportTransactionStatus(status, { phase: 'pending-confirmation', hash, message: { key: 'transaction.phase.pending' } });
    const receipt = await pollReceipt(rt.rpc, hash, tx.to, rt.sleep);
    if (seen === 'verified' || receipt === undefined) return { hash, verification: seen, receipt };
    // L2-F3: the wallet decides when to broadcast and can outwait the first check. A mined transaction is fetched and
    // compared again (a mismatch still throws), so a receipt is never reported without that comparison.
    reportTransactionStatus(status, { phase: 'verification-incomplete', hash, message: { key: 'transaction.status.lateReceipt' } });
    const late = await verifySubmission(rt.rpc, hash, expected, rt.sleep);
    return { hash, verification: late === 'verified' ? 'verified' : 'unverified', receipt };
  } catch (e) {
    throw new PostBroadcastError(hash, postBroadcastDetail(e, 'rpc'), e);
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
  if (rt.rpc === undefined) throw new UserFacingError({ key: 'error.payExec.aPermitPaymentNeedsAnRPCToReadTheToken' });
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
  if (rt.rpc === undefined) throw new UserFacingError({ key: 'error.payExec.approvingATokenNeedsAnRPCForThisChainConfigure' });
  const spender = ctx.manifest.router;
  const need = ctx.request.grossAmount;
  const have = await readAllowance(rt.rpc, token, session.account, spender);
  return { token, spender, need, have, required: have < need };
}

/** Sends only the exact allowance shown in the final preview and reads back what the wallet actually granted. */
export async function grantApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn): Promise<bigint> {
  if (rt.rpc === undefined) throw new UserFacingError({ key: 'error.payExec.approvingATokenNeedsAnRPCForThisChainConfigure' });
  if (!plan.required) return plan.have;
  const tx = buildApproveTx(plan.token, plan.spender, plan.need);
  assertApproveTx(tx, plan.token, plan.spender, plan.need);
  guardApprove(tx, ctx.chain.chainId, { token: plan.token, spender: plan.spender, amount: plan.need }, ctx.manifest, rt.nowSeconds());
  reportTransactionStatus(status, { phase: 'awaiting-authorization', message: { key: 'transaction.status.approve', values: { amount: formatUnits(plan.need, ctx.review.token?.decimals ?? 18), symbol: ctx.review.token?.symbol ?? '' } } });
  assertCurrent?.();
  // L2-I3: scoped to this invoice, so the identical approval for a later invoice is not refused as a duplicate.
  const res = await submitTx(session, tx, rt, status, assertCurrent, onBroadcast, { kind: 'approval', scope: bytesToHex(invoiceDigest(ctx.review.invoice)) });
  try {
    if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError({ key: 'error.payExec.theApprovalWasNotConfirmedNothingWasPaid' });
    // B2-R2: uncompared, the mined approve may be another one (a larger one to this spender passes the readback below).
    if (res.verification !== 'verified') throw new UserFacingError({ key: 'error.payExec.yourRPCReportsAReceiptForTheApprovalButDid' });
    const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
    if (after < plan.need) throw new UserFacingError({ key: 'error.payExec.theApprovalDidNotTakeEffectNothingWasPaid' });
    return after;
  } catch (e) {
    throw new PostBroadcastError(res.hash, postBroadcastDetail(e, 'allowance'), e);
  }
}

/** Revokes a router allowance with approve(spender, 0), then verifies it on-chain. */
export async function revokeApproval(session: WalletSession, ctx: PayContext, plan: ApprovalPlan, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onBroadcast?: BroadcastFn): Promise<void> {
  if (rt.rpc === undefined) throw new UserFacingError({ key: 'error.payExec.revokingNeedsAnRPCForThisChainConfigureOneIn' });
  const tx = buildApproveTx(plan.token, plan.spender, 0n);
  assertApproveTx(tx, plan.token, plan.spender, 0n);
  guardApprove(tx, ctx.chain.chainId, { token: plan.token, spender: plan.spender, amount: 0n }, ctx.manifest, rt.nowSeconds());
  reportTransactionStatus(status, { phase: 'awaiting-authorization', message: { key: 'transaction.status.revoke', values: { spender: plan.spender } } });
  assertCurrent?.();
  const res = await submitTx(session, tx, rt, status, assertCurrent, onBroadcast, { kind: 'approval', scope: bytesToHex(invoiceDigest(ctx.review.invoice)) });
  try {
    if (res.receipt === undefined || res.receipt.status !== 'success') throw new UserFacingError({ key: 'error.payExec.theRevokeWasNotConfirmedCheckYourAllowancesInYour' });
    if (res.verification !== 'verified') throw new UserFacingError({ key: 'error.payExec.yourRPCReportsAReceiptForTheRevokeButDid' });
    const after = await readAllowance(rt.rpc, plan.token, session.account, plan.spender);
    if (after !== 0n) throw new UserFacingError({ key: 'error.payExec.theAllowanceIsStillNotZeroCheckYourAllowancesIn' });
  } catch (e) {
    throw new PostBroadcastError(res.hash, postBroadcastDetail(e, 'allowance'), e);
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
  if (opts.usePermit && opts.buffer !== undefined) throw new UserFacingError({ key: 'error.payExec.aGasBufferCannotBeCombinedWithAPermitPayment' });
  if (!opts.usePermit || token === undefined || token.address === 'native') {
    return buildFinal(ctx, { nowSeconds: now, ...(opts.buffer === undefined ? {} : { buffer: opts.buffer }) });
  }
  if (rt.rpc === undefined) throw new UserFacingError({ key: 'error.payExec.aPermitPaymentNeedsAnRPCToReadTheToken' });
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
  reportTransactionStatus(status, { phase: 'awaiting-authorization', message: { key: 'transaction.status.permit', values: { amount: formatUnits(ctx.request.grossAmount, token.decimals), symbol: token.symbol } } });
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
    reportTransactionStatus(status, { phase: 'signed', message: permitStateDescriptor('already_allowed') });
    return buildFinal(ctx, { nowSeconds: now });
  }
  if (state !== 'ok_to_permit') throw new PermitRejectedError(state);
  return buildFinal(ctx, { nowSeconds: now, deadlineSeconds: deadline, permitSignature: sig });
}

/** Final gate and send. The assertion runs on exactly the object that is passed to the wallet. */
export async function sendPayment(session: WalletSession, ctx: PayContext, built: BuiltPayment, rt: Runtime, status: StatusFn, assertCurrent?: () => void, onWalletRequest?: () => void): Promise<SubmitResult> {
  const guard = (): void => {
    assertCurrent?.();
    assertReadyToSend(built, ctx);
    assertInvoiceStillPayable(ctx.review.invoice, rt.nowSeconds());
    assertPreparedBufferFresh(built, rt.nowSeconds());
    if (BigInt(rt.nowSeconds()) >= built.preview.deadline) throw new UserFacingError({ key: 'error.payExec.thePreparedPaymentHasExpiredReviewAgain' });
  };
  guard();
  // Independent decode of the exact calldata + allowlist/fee/deadline policy before the wallet is asked.
  guardRouterPayment(built.tx, built.preview, ctx.manifest, rt.nowSeconds());
  await assertBufferStillSufficient(built, rt.rpc);
  guard();
  const dryRun = rt.rpc === undefined ? undefined : await simulateCall(rt.rpc, { from: session.account, to: built.tx.to, data: built.tx.data, value: built.tx.value });
  guard();
  // A node that cannot run the dry run is no refusal (a revert is), but the user sees it while the wallet asks.
  const report: StatusFn = dryRun === 'unavailable' ? (message, outcome) => {
    reportTransactionStatus(status, {
      ...(outcome ?? { phase: 'verification-incomplete' }),
      message: { key: 'transaction.status.unsimulated', values: { status: outcome?.message ?? message } },
    });
  } : status;
  // After this boundary a wallet error can mean an unknown broadcast outcome, even without a returned hash.
  onWalletRequest?.();
  return submitTx(session, { to: built.tx.to, data: built.tx.data, value: built.tx.value }, rt, report, guard, undefined, { kind: 'payment', scope: bytesToHex(invoiceDigest(ctx.review.invoice)) });
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
    // L2-F3: `included` only for a receipt whose transaction was compared with the preview on the user's RPC.
    status: result.receipt === undefined ? 'unconfirmed' : result.receipt.status !== 'success' ? 'reverted' : result.verification === 'verified' ? 'included' : 'unconfirmed',
    createdAt: now.toISOString(),
  };
}

// i18n-use: error.payExec.aGasBufferCannotBeCombinedWithAPermitPayment error.payExec.aPermitPaymentNeedsAnRPCToReadTheToken error.payExec.approvingATokenNeedsAnRPCForThisChainConfigure error.payExec.revokingNeedsAnRPCForThisChainConfigureOneIn error.payExec.theAllowanceIsStillNotZeroCheckYourAllowancesIn error.payExec.theApprovalDidNotTakeEffectNothingWasPaid error.payExec.theApprovalWasNotConfirmedNothingWasPaid error.payExec.thePreparedPaymentHasExpiredReviewAgain error.payExec.theRevokeWasNotConfirmedCheckYourAllowancesInYour error.payExec.yourRPCReportsAReceiptForTheApprovalButDid error.payExec.yourRPCReportsAReceiptForTheRevokeButDid error.wallet.yourRPCReturnedAnUnexpectedReceiptShape error.wallet.yourRPCReturnedAnUnexpectedTransactionShape transaction.detail.allowanceFailed transaction.detail.rpcFailed transaction.detail.saveHash transaction.phase.authorization transaction.phase.pending transaction.postBroadcast transaction.status.approve transaction.status.lateReceipt transaction.status.noRpc transaction.status.permit transaction.status.revoke transaction.status.unsimulated transaction.status.verifying transaction.submissionMismatch
