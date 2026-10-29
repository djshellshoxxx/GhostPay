import { ChainAdapterError, FEE_SCHEDULE, tokensForChain, type Address, type DeploymentManifest, type Hex, type RpcClient } from '@ghostpay/chain-adapters';
import {
  ReviewRefusedError,
  TxReviewError,
  assertReviewed,
  decodeTx,
  decodeTypedData,
  type Intent,
  type ReviewContext,
  type ReviewPolicy,
  type TxInput,
  type TypedDataInput,
} from '@ghostpay/tx-review';
import { UserFacingError } from './errors';

/** Absolute ceiling for a self-paid sweep's `maxFeePerGas` (1000 gwei). A lying RPC cannot push the signed value above it (S3-09). */
export const MAX_DIRECT_FEE_PER_GAS_WEI = 1_000n * 10n ** 9n;
/** Ceiling for the gas limit of a self-paid sweep (a plain transfer needs about 21 000 to 65 000). */
export const MAX_DIRECT_GAS_LIMIT = 300_000n;
/** A self-paid native sweep is refused when its worst-case fee exceeds this share of the amount moved (10 %). */
export const DIRECT_MAX_FEE_SHARE_BPS = 1000;
/** Longest signature deadline the app ever creates (seconds). */
export const MAX_REVIEW_DEADLINE_SECONDS = 30 * 60;

/** Options that differ between flows. */
export interface PolicyOptions {
  /** Relayed sweeps: the relayer's quoted `feeTo`; default the manifest fee recipient. */
  readonly feeRecipient?: Address;
  readonly maxFeeShareBps?: number;
}

/**
 * Review policy built only from the authenticated manifest and the compiled token allowlist.
 *
 * @param manifest Loaded deployment manifest of the chain.
 * @param chainId Chain being used.
 * @param o Flow-specific options.
 */
export function reviewPolicy(manifest: DeploymentManifest, chainId: number, o: PolicyOptions = {}): ReviewPolicy {
  return {
    tokens: new Map([[chainId, new Set(tokensForChain(chainId).map((t) => t.address))]]),
    contracts: { router: manifest.router, sweepRelayer: manifest.sweepRelayer, announcer: manifest.announcer },
    feeCaps: {
      maxFeePerGasWei: MAX_DIRECT_FEE_PER_GAS_WEI,
      maxGasLimit: MAX_DIRECT_GAS_LIMIT,
      maxFeeShareBps: o.maxFeeShareBps ?? Number(FEE_SCHEDULE.SPONSOR_CAP_BPS),
    },
    feeRecipient: o.feeRecipient ?? manifest.feeRecipient,
    maxDeadlineSeconds: MAX_REVIEW_DEADLINE_SECONDS,
  };
}

function refuse(e: unknown): never {
  if (e instanceof ReviewRefusedError) throw new UserFacingError(`Blocked before signing: the request did not pass the safety review (${e.reasons.join(', ')}).`);
  if (e instanceof TxReviewError) throw new UserFacingError(`Blocked before signing: the safety review could not run (${e.code}).`);
  throw e;
}

/**
 * Decodes the exact transaction fields about to be signed and compares them with what the user reviewed.
 *
 * @param tx Unsigned transaction fields (parsed from the serialized bytes, not from UI state).
 * @param expected Intent built from the user's inputs.
 * @param policy See {@link reviewPolicy}.
 * @param now Unix seconds.
 * @param ctx Optional flow facts (payment gross for approvals, S3-19).
 * @throws {UserFacingError} listing every refusal code.
 */
export function guardTx(tx: TxInput, expected: Intent, policy: ReviewPolicy, now: number, ctx?: ReviewContext): void {
  try {
    assertReviewed(decodeTx(tx), expected, policy, now, ctx);
  } catch (e) {
    refuse(e);
  }
}

/** Same as {@link guardTx} for EIP-712 payloads (sweep order, permit). */
export function guardTypedData(td: TypedDataInput, expected: Intent, policy: ReviewPolicy, now: number, ctx?: ReviewContext): void {
  try {
    assertReviewed(decodeTypedData(td), expected, policy, now, ctx);
  } catch (e) {
    refuse(e);
  }
}

/** Outcome of {@link simulateCall}. `unavailable` is not a refusal: callers show it as a warning. */
export type Simulation = 'ok' | 'unavailable';

/** Only for errors that carry the node's text (EIP-1193 wallet providers, test doubles). */
const REVERT_TEXT = /revert|execution failed|invalid opcode|out of gas/i;

/**
 * Whether an RPC failure says the call reverted (or ran out of gas, or hit an invalid opcode). The verified client
 * (`createClient`) drops the node's text and reports that only as `ChainAdapterError.reverted`, so its fixed-form
 * message is never matched.
 */
export function reportsRevert(e: unknown): boolean {
  if (e instanceof ChainAdapterError) return e.reverted;
  return e instanceof Error && REVERT_TEXT.test(e.message);
}

/** Only for errors that carry the node's text: a halt (out of gas, bad opcode) rather than a revert. */
const HALT_TEXT = /execution failed|invalid opcode|invalid instruction|out of gas|EVM error/i;

/**
 * Whether an RPC failure is a plain revert, which can mean the called function does not exist. A call that ran out of
 * gas or hit an invalid opcode ({@link reportsRevert} counts those too) says nothing about the contract.
 */
export function reportsPlainRevert(e: unknown): boolean {
  if (e instanceof ChainAdapterError) return e.reverted && !e.halted;
  return e instanceof Error && /revert/i.test(e.message) && !HALT_TEXT.test(e.message);
}

/**
 * Dry-runs a call with `eth_call` before it is signed (S3-09, S3-19).
 *
 * @param rpc User's RPC.
 * @param call Sender, target, calldata, value and, when known, the gas limit that will be signed.
 * @returns `ok`, or `unavailable` when the node cannot run it (not a revert). A revert, or an ERC-20 style
 *   `false` return, throws.
 * @throws {UserFacingError} when the simulation shows the call would fail.
 */
export async function simulateCall(
  rpc: Pick<RpcClient, 'request'>,
  call: { readonly from: Address; readonly to: Address; readonly data: Hex; readonly value: bigint; readonly gas?: bigint },
  expectBool = false,
): Promise<Simulation> {
  let r: unknown;
  const gas = call.gas === undefined ? {} : { gas: `0x${call.gas.toString(16)}` };
  try {
    r = await rpc.request('eth_call', [{ from: call.from, to: call.to, data: call.data, value: `0x${call.value.toString(16)}`, ...gas }, 'latest']);
  } catch (e) {
    if (reportsRevert(e)) throw new UserFacingError('Blocked: a dry run of this transaction fails (it would revert). Nothing was sent.');
    return 'unavailable';
  }
  if (typeof r !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r)) return 'unavailable';
  if (expectBool && r.length === 66 && BigInt(r) === 0n) {
    throw new UserFacingError('Blocked: a dry run says the token refuses this transfer (it returned false). Nothing was sent.');
  }
  return 'ok';
}

/**
 * Reviews an ERC-20 approval before the wallet prompt: spender must be the manifest router, token allowlisted, and the
 * amount no more than this payment's gross (S3-19).
 */
export function guardApprove(
  tx: { readonly to: Address; readonly data: Hex; readonly value: bigint },
  chainId: number,
  expected: { readonly token: Address; readonly spender: Address; readonly amount: bigint },
  manifest: DeploymentManifest,
  now: number,
): void {
  guardTx(
    { chainId, to: tx.to, data: tx.data, value: tx.value },
    { kind: 'erc20_approve', chainId, ...expected },
    reviewPolicy(manifest, chainId),
    now,
    { paymentGross: expected.amount },
  );
}

/** The subset of a built payment the reviewer needs (matches chain-adapters' `PaymentPreview`). */
export interface ReviewablePayment {
  readonly method: string;
  readonly chainId: number;
  readonly router: Address;
  readonly token: Address | 'native';
  readonly stealth: Address;
  readonly gross: bigint;
  readonly fee: bigint;
  readonly minNet: bigint;
  readonly deadline: bigint;
  readonly ephemeralPublicKey: Hex;
  readonly metadata: Hex;
}

/**
 * Reviews the router payment about to be sent: the calldata bytes are decoded and compared with the preview the user
 * saw, then checked against the manifest router, the token allowlist, the fee cap and the deadline window.
 *
 * @remarks `payERC20WithBuffer` is not decodable by tx-review (deliberately, haiku L-04), so buffer payments keep only
 * the existing preview/calldata comparison of `assertReadyToSend`.
 *
 * @returns `'reviewed'`, or `'skipped-buffer'` for a buffer payment.
 */
export function guardRouterPayment(
  tx: { readonly to: Address; readonly data: Hex; readonly value: bigint },
  preview: ReviewablePayment,
  manifest: DeploymentManifest,
  now: number,
): 'reviewed' | 'skipped-buffer' {
  if (preview.method === 'payERC20WithBuffer') return 'skipped-buffer';
  guardTx(
    { chainId: preview.chainId, to: tx.to, data: tx.data, value: tx.value },
    {
      kind: 'router_payment',
      method: preview.method as 'payERC20' | 'payERC20WithPermit' | 'payNative',
      chainId: preview.chainId,
      router: preview.router,
      token: preview.token,
      stealth: preview.stealth,
      gross: preview.gross,
      minNet: preview.minNet,
      fee: preview.fee,
      deadline: preview.deadline,
      metadata: preview.metadata,
      ephemeralKey: preview.ephemeralPublicKey,
    },
    reviewPolicy(manifest, preview.chainId),
    now,
  );
  return 'reviewed';
}
