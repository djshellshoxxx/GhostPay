import {
  addressOfSecret,
  assertSponsorFeeAcceptable,
  buildSweepTypedData,
  ChainAdapterError,
  erc20Abi,
  ghostPaySweepRelayerAbi,
  parseQuantity,
  signDigest,
  signPermit,
  signSweep,
  tokensForChain,
  type Address,
  type DeploymentManifest,
  type Hex,
  type PermitState,
  type RpcClient,
  type SweepOrder,
} from '@ghostpay/chain-adapters';
import { findLookalikes, parseStrictAddress, isReason, classifyDestination, type DestinationClass } from '@ghostpay/address-safety';
import { deriveStealthSecret, zeroize, type PublicAnnouncement, type SecretScalar } from '@ghostpay/core-crypto';
import type { TypedDataInput } from '@ghostpay/tx-review';
import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, parseTransaction, serializeTransaction } from 'viem/utils';
import { UserFacingError, type MessageDescriptor } from './errors';
import { sweepFeeFields, sweepFeeReserve } from './opStackFee';
import { TransactionOutcomeError } from './transactionOutcome';
import { buildPermit } from './pay';
import type { MessageKey } from '../i18n/catalog';
import { RelayerRefusedError, requestQuote, submitSweep, type FetchFn, type RelayerQuote } from './relayerClient';
import { captureSessionGuard, withSessionSecrets } from './session';
import { DIRECT_MAX_FEE_SHARE_BPS, guardTx, guardTypedData, reportsRevert, reviewPolicy, simulateCall, type Simulation } from './txGuard';

export interface SweepTarget {
  readonly chainId: number;
  readonly token: Address | 'native';
  /** Stealth address that holds the funds. */
  readonly owner: Address;
  readonly announcement: PublicAnnouncement;
}

type Rpc = Pick<RpcClient, 'request'>;

/**
 * Derives the stealth key in memory and proves it controls `owner` before it is ever used.
 *
 * @remarks The announced view tag is not compared (L4-02): it is only a scan filter, and a payment the deep scan found
 * despite a payer-published wrong tag is still the seller's. Control is proven by the derived address alone, inside
 * `deriveStealthSecret` (against the announced address) and below (against the address being swept).
 */
export function deriveVerifiedSweepKey(target: SweepTarget): SecretScalar {
  const secret = withSessionSecrets((s) => deriveStealthSecret(target.announcement, s.keys, { ignoreViewTag: true }));
  if (addressOfSecret(secret) !== target.owner) {
    zeroize(secret);
    throw new UserFacingError({ key: 'error.sweep.blockedTheDerivedKeyDoesNotControlThatAddress' });
  }
  return secret;
}

/**
 * Validates a sweep destination (S3-12/S3-22 address poisoning).
 *
 * @remarks Parsing is strict: `0x` + 40 hex, all-lowercase or a valid EIP-55 checksum. A destination that shares its
 * first and last four nibbles with the stealth address, a GhostPay contract or any address in `known` (saved
 * destinations) without being equal is refused as a probable lookalike. GhostPay's contracts, its fee recipient and the
 * chain's allowlisted token contracts are refused outright: swept funds could not come back from them.
 *
 * @param known Addresses the user already trusts (saved destinations).
 */
export function checkDestination(destination: string, owner: Address, manifest: DeploymentManifest, known: readonly Address[] = []): Address {
  const parsed = parseStrictAddress(destination.trim());
  if (isReason(parsed)) throw new UserFacingError({ key: 'error.sweep.enterAValidDestinationAddress0xMixedCaseAddressesMust' });
  const d = parsed;
  if (d === owner) throw new UserFacingError({ key: 'error.sweep.theDestinationMustDifferFromTheStealthAddress' });
  if (d === manifest.router || d === manifest.sweepRelayer || d === manifest.announcer || d === manifest.feeRecipient) {
    throw new UserFacingError({ key: 'error.sweep.theDestinationMustNotBeAGhostPayContractOrThe' });
  }
  if (tokensForChain(manifest.chainId).some((token) => token.address.toLowerCase() === d.toLowerCase())) {
    throw new UserFacingError({ key: 'error.sweep.theDestinationMustNotBeATokenContract' });
  }
  const trusted = [owner, manifest.router, manifest.sweepRelayer, manifest.announcer, manifest.feeRecipient, ...known];
  if (findLookalikes(d, trusted).length > 0) {
    throw new UserFacingError({ key: 'error.sweep.blockedThisAddressLooksAlmostIdenticalToAnAddressYou' });
  }
  return d;
}

/** How the destination relates to what the user knows; the UI shows the linkability warning for `new`. */
export function describeDestination(destination: Address, owner: Address, saved: readonly Address[] = []): DestinationClass {
  return classifyDestination(destination, { saved, ownStealth: [owner], feeRecipients: [] });
}

export async function readBalance(rpc: Rpc, owner: Address, token: Address | 'native'): Promise<bigint> {
  if (token === 'native') return parseQuantity(await rpc.request('eth_getBalance', [owner, 'latest']));
  const data = encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
  const r = await rpc.request('eth_call', [{ to: token, data }, 'latest']);
  if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) throw new UserFacingError({ key: 'error.sweep.yourRPCReturnedAnUnexpectedBalance' });
  return BigInt(r);
}

export interface SweepQuoteView {
  readonly quote: RelayerQuote;
  readonly net: bigint;
}

/** Keep a quote from expiring while the local signatures are assembled or the relay request is posted. */
export const SWEEP_QUOTE_EXPIRY_SAFETY_SECONDS = 30;

function assertRelayerQuote(
  quote: RelayerQuote,
  manifest: DeploymentManifest,
  amount: bigint,
  nowSeconds: number,
): void {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new UserFacingError({ key: 'error.sweep.theLocalClockIsInvalidRefusingToSignASweep' });
  if (quote.expiresAt <= nowSeconds + SWEEP_QUOTE_EXPIRY_SAFETY_SECONDS) {
    throw new UserFacingError({ key: 'error.sweep.theRelayerQuoteHasExpiredOrIsAboutToRequest' });
  }
  if (getAddress(quote.feeTo) !== getAddress(manifest.feeRecipient)) {
    throw new UserFacingError({ key: 'error.sweep.theRelayerFeeAddressDoesNotMatchTheDeploymentFee' });
  }
  try {
    assertSponsorFeeAcceptable(amount, quote.fee);
  } catch {
    throw new UserFacingError({ key: 'error.sweep.theRelayerFeeIsAboveThePublishedCapForThis' });
  }
}

/** Relayer quote with the fee checked against the published cap (FEE_SCHEDULE) before anything is signed. */
export async function getSweepQuote(
  relayerUrl: string,
  target: SweepTarget & { token: Address },
  destination: Address,
  amount: bigint,
  nowSeconds: number,
  feeRecipient: Address,
  fetchFn?: FetchFn,
): Promise<SweepQuoteView> {
  if (relayerUrl === '') throw new UserFacingError({ key: 'error.sweep.setARelayerURLInSettingsOrSweepDirectly' });
  const quote = await requestQuote(relayerUrl, { chainId: target.chainId, token: target.token, owner: target.owner, destination, amount }, fetchFn);
  try {
    assertSponsorFeeAcceptable(amount, quote.fee);
  } catch {
    throw new UserFacingError({ key: 'error.sweep.theRelayerAskedForAFeeAboveThePublishedCap' });
  }
  if (quote.expiresAt <= nowSeconds) throw new UserFacingError({ key: 'error.sweep.theRelayerQuoteHasAlreadyExpired' });
  if (quote.feeTo === target.owner || quote.feeTo === destination) throw new UserFacingError({ key: 'error.sweep.theRelayerFeeAddressIsUnacceptable' });
  if (quote.feeTo !== getAddress(feeRecipient)) throw new UserFacingError({ key: 'error.sweep.theRelayerFeeAddressDoesNotMatchTheDeploymentFee' });
  return { quote, net: amount - quote.fee };
}

export interface RelayedSweepInput {
  readonly target: SweepTarget & { token: Address };
  readonly manifest: DeploymentManifest;
  readonly destination: Address;
  readonly amount: bigint;
  readonly quote: RelayerQuote;
  readonly relayerUrl: string;
  readonly rpc: Rpc;
  /** Current wall-clock seconds, sampled again at each signing and submission boundary. */
  readonly nowSeconds: () => number;
  readonly fetchFn?: FetchFn;
  readonly randomNonce?: () => bigint;
  /** Revalidates the caller's live review before key derivation, signatures and pre-handoff continuations. */
  readonly assertReviewCurrent?: () => void;
  /**
   * Called with the signed order's on-chain identity immediately before it is posted to the relayer. It must persist
   * the lock; if it throws, nothing is posted and the error propagates.
   */
  readonly onBeforeHandoff?: (order: RelayedOrderRef) => void;
}

function defaultNonce(): bigint {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return BigInt(`0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`);
}

/** Signs the EIP-712 Sweep and the ERC-2612 permit with the in-memory stealth key and hands them to the relayer. */
export async function relayedSweep(i: RelayedSweepInput): Promise<string> {
  const readNow = (): number => i.nowSeconds();
  const checkQuote = (): void => assertRelayerQuote(i.quote, i.manifest, i.amount, readNow());
  // Validate before deriving the one-time key or doing any signing work. The quote is rechecked after each await.
  checkQuote();
  const assertSessionUnchanged = captureSessionGuard();
  const assertCurrent = (): void => { assertSessionUnchanged(); i.assertReviewCurrent?.(); };
  // A loaded session does not authorize a review that the user has since changed or cancelled.
  assertCurrent();
  const secret = deriveVerifiedSweepKey(i.target);
  try {
    const deadline = BigInt(readNow() + 20 * 60);
    const order: SweepOrder = {
      token: i.target.token,
      owner: i.target.owner,
      destination: i.destination,
      feeTo: i.quote.feeTo,
      amount: i.amount,
      fee: i.quote.fee,
      deadline,
      nonce: (i.randomNonce ?? defaultNonce)(),
    };
    const td = buildSweepTypedData(i.target.chainId, i.manifest.sweepRelayer, order);
    const policy = reviewPolicy(i.manifest, i.target.chainId);
    // Decode the typed data that will be signed and compare it with the order the user reviewed (S3-09).
    guardTypedData(
      td as unknown as TypedDataInput,
      {
        kind: 'relayed_sweep_sig',
        chainId: i.target.chainId,
        verifyingContract: i.manifest.sweepRelayer,
        owner: i.target.owner,
        token: i.target.token,
        destination: i.destination,
        amount: i.amount,
        fee: i.quote.fee,
        feeTo: i.manifest.feeRecipient,
        deadline,
        nonce: order.nonce,
      },
      policy,
      readNow(),
    );
    checkQuote();
    assertCurrent();
    const sweepSig = await signSweep(td, secret);
    checkQuote();
    assertCurrent();
    const ptd = await buildPermit(i.rpc, {
      chainId: i.target.chainId,
      token: i.target.token,
      owner: i.target.owner,
      spender: i.manifest.sweepRelayer,
      value: i.amount,
      deadline,
    });
    checkQuote();
    assertCurrent();
    guardTypedData(
      ptd,
      {
        kind: 'permit_sig',
        chainId: i.target.chainId,
        token: i.target.token,
        owner: i.target.owner,
        spender: i.manifest.sweepRelayer,
        value: i.amount,
        nonce: BigInt((ptd.message as { nonce: bigint }).nonce),
        deadline,
      },
      policy,
      readNow(),
    );
    checkQuote();
    assertCurrent();
    const permit = await signPermit(ptd, secret);
    checkQuote();
    assertCurrent();
    zeroize(secret);
    // This is the last pre-broadcast checkpoint. Do not reject after submitSweep resolves: the relayer may
    // already have accepted the signed order even if the seller session was locked while the request was in flight.
    assertCurrent();
    checkQuote();
    i.onBeforeHandoff?.({ relayer: i.manifest.sweepRelayer, nonce: order.nonce, deadline: Number(deadline) });
    return await submitSweep(
      i.relayerUrl,
      {
        chainId: i.target.chainId,
        sweep: order,
        sweepSig: sweepSig.signature,
        permit: { value: i.amount, deadline, v: permit.v, r: permit.r, s: permit.s },
        quoteToken: i.quote.quoteToken,
      },
      i.fetchFn,
    );
  } finally {
    zeroize(secret);
  }
}

export interface DirectSweepInput {
  readonly target: SweepTarget;
  /** Authenticated manifest: the review policy (allowlist, protocol contracts) is built from it. */
  readonly manifest: DeploymentManifest;
  /** Unix seconds. A live clock is read again across asynchronous signing steps. */
  readonly nowSeconds?: number | (() => number);
  readonly destination: Address;
  /**
   * For ERC-20 the amount to move; for native the whole balance minus every fee (gas, and on OP Stack the L1 data fee)
   * is moved and this is the balance.
   */
  readonly amount: bigint;
  readonly rpc: Rpc;
  /**
   * Re-sign a direct sweep whose handoff outcome is unknown (L2-F2, B-R5): sign with exactly this owner nonce, the
   * locked one, instead of the pending count. Only one transaction per nonce can ever be mined, so the new one can
   * replace the recorded one but never add a second transfer. Refused once a transaction with this nonce is mined.
   */
  readonly replaceNonce?: number;
  /** Revalidates the caller's live review before key derivation, signatures and pre-handoff continuations. */
  readonly assertReviewCurrent?: () => void;
  /**
   * Called with the `unknown-after-handoff` attempt immediately before the signed bytes are handed to the RPC. It must
   * persist the lock; if it throws, nothing is broadcast and the error propagates.
   */
  readonly onBeforeHandoff?: (attempt: DirectSweepAttempt) => void;
}

/**
 * Public record of one direct-sweep transaction handed to the RPC (GP-SWEEP-OUTCOME-01). It holds no key material.
 *
 * @remarks `expectedHash` is keccak256 of the exact signed bytes, computed before handoff. `unknown-after-handoff`
 * means the bytes may already be on the network: it is neither success nor proof that nothing was sent.
 */
export interface DirectSweepAttempt {
  readonly chainId: number;
  readonly owner: Address;
  /** Owner nonce of a direct sweep; absent for a relayed sweep (the relayer's account sends it). */
  readonly nonce?: number;
  readonly destination: Address;
  readonly asset: Address | 'native';
  readonly amount: bigint;
  readonly expectedHash: Hex;
  readonly status: 'submitted' | 'unknown-after-handoff' | 'included' | 'reverted';
}

/** On-chain identity of a signed relayed-sweep order: the sweep contract it was signed for, its nonce and deadline. */
export interface RelayedOrderRef {
  readonly relayer: Address;
  readonly nonce: bigint;
  /** Unix seconds; the contract rejects the order once `block.timestamp > deadline`. */
  readonly deadline: number;
}

/**
 * `expired`: a relayed order whose nonce was still unused in a block more than {@link RELAYED_EXPIRY_MARGIN_SECONDS}
 * past its deadline; it can no longer execute. `refused`: the relayer answered with a client error (4xx other than
 * 409), which by its API contract happens before anything is broadcast. `replaced`: a direct sweep none of whose
 * recorded transactions (with a same-nonce re-sign, every attempt) has a receipt while the owner's nonce is already used
 * at the finalized block, so none of them can ever be mined: a transaction this lock does not record was.
 */
export type SweepLockStatus = DirectSweepAttempt['status'] | 'expired' | 'refused' | 'replaced';

/**
 * The fields a signing lock needs; the persisted journal keeps only these (no destination or amount). A direct sweep
 * carries `expectedHash`; a relayed sweep carries `order` and, once the relayer answers, the hash it reported.
 */
export interface SweepLock {
  readonly chainId: number;
  readonly owner: Address;
  readonly nonce?: number;
  readonly expectedHash?: Hex;
  /**
   * A direct lock re-signed with the same nonce (L2-F2): the hashes of the other transactions signed for that nonce.
   * Any one of them, or `expectedHash`, may be the transaction that is mined, so a status check looks for all of them.
   */
  readonly otherHashes?: readonly Hex[];
  readonly order?: RelayedOrderRef;
  readonly status: SweepLockStatus;
}

/** Margin past the order deadline, measured on the finalized block, before an unused nonce counts as expired (clock skew). */
export const RELAYED_EXPIRY_MARGIN_SECONDS = 600;

/** True while an attempt may still land; signing a new transaction from the same address must stay disarmed. */
export function isUnresolvedAttempt(a: { readonly status: SweepLockStatus }): boolean {
  return a.status === 'unknown-after-handoff' || a.status === 'submitted';
}

/** Thrown when the signed bytes were handed to the RPC but the outcome could not be confirmed. */
export class DirectSweepOutcomeUnknownError extends TransactionOutcomeError {
  public readonly attempt: DirectSweepAttempt;
  /** As on {@link DirectSweepResult}: `unavailable` means the bytes were handed off without a dry run; show the warning. */
  public readonly simulation: Simulation;

  public constructor(message: string | MessageDescriptor, attempt: DirectSweepAttempt, simulation: Simulation, code = 'BROADCAST_UNKNOWN') {
    super({
      phase: 'broadcast-unknown', hash: attempt.expectedHash, code,
      message: typeof message === 'string' ? { key: 'transaction.sweep.legacy', values: { detail: message } } : message,
    });
    this.name = 'DirectSweepOutcomeUnknownError';
    this.attempt = attempt;
    this.simulation = simulation;
  }
}

export interface DirectSweepResult {
  readonly hash: Hex;
  readonly sent: bigint;
  readonly maxGasCost: bigint;
  readonly attempt: DirectSweepAttempt;
  /** `unavailable`: the node could not run the dry run, so the transaction was sent without it; show a warning. */
  readonly simulation: Simulation;
}

/**
 * One receipt read by exact hash: its on-chain status, `absent` when the RPC answered an explicit `null` (no receipt), or
 * `unknown` for an RPC error, malformed data or a receipt for another hash.
 */
async function readReceipt(rpc: Rpc, hash: Hex): Promise<'included' | 'reverted' | 'absent' | 'unknown'> {
  let receipt: unknown;
  try {
    receipt = await rpc.request('eth_getTransactionReceipt', [hash]);
  } catch {
    return 'unknown';
  }
  if (receipt === null) return 'absent';
  if (typeof receipt !== 'object') return 'unknown';
  const r = receipt as { transactionHash?: unknown; status?: unknown };
  if (typeof r.transactionHash !== 'string' || r.transactionHash.toLowerCase() !== hash) return 'unknown';
  if (r.status === '0x1') return 'included';
  if (r.status === '0x0') return 'reverted';
  return 'unknown';
}

/**
 * Read-only receipt lookup by the exact expected hash through the configured RPC. A missing receipt, an RPC error or a
 * receipt for another hash leaves the attempt unchanged: absence is never proof that the transaction was not sent.
 */
export async function reconcileDirectSweep<T extends { readonly expectedHash: Hex; readonly status: SweepLockStatus }>(rpc: Rpc, attempt: T): Promise<T> {
  const look = await readReceipt(rpc, attempt.expectedHash);
  return look === 'included' || look === 'reverted' ? { ...attempt, status: look } : attempt;
}

async function nonceUsedAt(rpc: Rpc, owner: Address, order: RelayedOrderRef, block: string | { readonly blockHash: Hex; readonly requireCanonical: true }): Promise<boolean> {
  const data = encodeFunctionData({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', args: [owner, order.nonce] });
  const raw = await rpc.request('eth_call', [{ to: order.relayer, data }, block]);
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]*$/.test(raw)) throw new Error('invalid eth_call result');
  return decodeFunctionResult({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', data: raw as Hex });
}

/**
 * Read-only resolution of a relayed order from chain state alone (no relayer trust):
 * - executed (`included`) when the sweep contract reports the order's nonce used at `latest`;
 * - `expired` only when the **finalized** block is more than {@link RELAYED_EXPIRY_MARGIN_SECONDS} past the deadline
 *   and the nonce is still unused at that exact canonical block (EIP-1898 `blockHash` + `requireCanonical`), so a
 *   reorg cannot later include the order;
 * - otherwise unchanged.
 * @throws {UserFacingError} when the RPC fails or answers malformed data (including no `finalized` support): the
 *   outcome is then unknown and must not be reported as "not executed".
 */
export async function reconcileRelayedOrder<T extends { readonly owner: Address; readonly order?: RelayedOrderRef; readonly status: SweepLockStatus }>(rpc: Rpc, lock: T): Promise<T> {
  const order = lock.order;
  if (order === undefined) return lock;
  try {
    if (await nonceUsedAt(rpc, lock.owner, order, 'latest')) return { ...lock, status: 'included' };
    const block = (await rpc.request('eth_getBlockByNumber', ['finalized', false])) as { hash?: unknown; timestamp?: unknown } | null;
    if (block === null || typeof block.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || typeof block.timestamp !== 'string') {
      throw new Error('no finalized block');
    }
    if (parseQuantity(block.timestamp) <= BigInt(order.deadline + RELAYED_EXPIRY_MARGIN_SECONDS)) return lock;
    const used = await nonceUsedAt(rpc, lock.owner, order, { blockHash: block.hash as Hex, requireCanonical: true });
    return { ...lock, status: used ? 'included' : 'expired' };
  } catch {
    throw new UserFacingError({ key: 'error.sweep.couldNotCheckTheOrderOnChainTheRPCFailed' });
  }
}

/**
 * Resolves any sweep lock: relayed orders by nonce/deadline (errors propagate), direct sweeps by the exact expected
 * hash's receipt. A legacy hash-only lock without an owner nonce is a relayed sweep recorded before order tracking: a
 * reverted relayer transaction does not consume its order, so `reverted` does not release it.
 *
 * A direct lock re-signed with the same nonce is looked up by every hash it records: only one transaction per nonce can
 * be mined, so the first one with a receipt settles the lock and becomes its `expectedHash`.
 *
 * A direct lock none of whose hashes has a receipt resolves as `replaced` once the owner's nonce is used at the
 * finalized block: another transaction with that nonce was mined, and none can follow it. That takes an explicit "no
 * receipt" answer for every hash, read after the nonce check; a failed nonce read, or a failed or malformed receipt
 * read, keeps signing locked and reports uncertainty. A submitted transaction that the RPC no longer knows may be
 * re-signed only with its original nonce; absence never releases the lock.
 */
export async function reconcileSweepLock<T extends SweepLock>(rpc: Rpc, lock: T): Promise<T> {
  if (lock.order !== undefined) return reconcileRelayedOrder(rpc, lock);
  const expectedHash = lock.expectedHash;
  if (expectedHash === undefined) return lock;
  const hashes = [expectedHash, ...(lock.otherHashes ?? [])];
  const first = await readReceipts(rpc, hashes);
  if (first.mined !== undefined) {
    if (first.mined.status === 'reverted' && lock.nonce === undefined) return lock;
    return first.mined.status === lock.status && first.mined.hash === expectedHash ? lock : settled(lock, first.mined);
  }
  if (lock.nonce === undefined || !isUnresolvedAttempt(lock) || !(await nonceFinal(rpc, lock.owner, lock.nonce))) {
    if (!first.allAbsent) throw uncertainReceipt();
    if (lock.nonce !== undefined && lock.status === 'submitted' && await transactionsAbsent(rpc, hashes)) {
      // The configured RPC may have forgotten them, but another node may still include one. Keep the same nonce lock.
      return { ...lock, status: 'unknown-after-handoff' };
    }
    return lock;
  }
  // Look once more now that the nonce is final: a receipt for a recorded hash still wins, and an RPC error or a
  // malformed answer proves nothing (B-R1).
  const again = await readReceipts(rpc, hashes);
  if (again.mined !== undefined) return settled(lock, again.mined);
  if (!again.allAbsent) throw uncertainReceipt();
  return { ...lock, status: 'replaced' };
}

function uncertainReceipt(): UserFacingError {
  return new UserFacingError({ key: 'error.sweep.couldNotCheckEveryTransactionReceiptTheOutcomeIsStill' });
}

/** Only explicit null for every recorded hash permits same-nonce recovery; errors and all other answers prove nothing. */
async function transactionsAbsent(rpc: Rpc, hashes: readonly Hex[]): Promise<boolean> {
  try {
    for (const hash of hashes) {
      if (await rpc.request('eth_getTransactionByHash', [hash]) !== null) return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface MinedTx { readonly hash: Hex; readonly status: 'included' | 'reverted' }

/** Receipt reads for every hash, stopping at the first one with a receipt; `allAbsent` only when each answered null. */
async function readReceipts(rpc: Rpc, hashes: readonly Hex[]): Promise<{ readonly mined?: MinedTx; readonly allAbsent: boolean }> {
  let allAbsent = true;
  for (const hash of hashes) {
    const look = await readReceipt(rpc, hash);
    if (look === 'included' || look === 'reverted') return { mined: { hash, status: look }, allAbsent: false };
    if (look === 'unknown') allAbsent = false;
  }
  return { allAbsent };
}

/** The lock settled by the transaction that was mined; an earlier attempt's hash becomes `expectedHash`, the rest stay. */
function settled<T extends SweepLock>(lock: T, mined: MinedTx): T {
  if (mined.hash === lock.expectedHash) return { ...lock, status: mined.status };
  const otherHashes = [lock.expectedHash, ...(lock.otherHashes ?? [])].filter((h): h is Hex => h !== undefined && h !== mined.hash);
  return { ...lock, expectedHash: mined.hash, otherHashes, status: mined.status };
}

/** True only when the RPC reports the owner's nonce above `nonce` at the finalized block; a failed read means "not known". */
async function nonceFinal(rpc: Rpc, owner: Address, nonce: number): Promise<boolean> {
  try {
    return parseQuantity(await rpc.request('eth_getTransactionCount', [owner, 'finalized'])) > BigInt(nonce);
  } catch {
    return false;
  }
}

/** Gas of a plain value transfer to an account without code: the intrinsic minimum of every transaction. */
const TRANSFER_GAS = 21_000n;

// The L1 data / operator fee reserve lives in opStackFee.ts so the gas buffer quote (pay.ts) sizes it the same way.
export { OP_STACK_FEE_RESERVE_MULTIPLIER, OP_STACK_GAS_PRICE_ORACLE } from './opStackFee';

/** `eth_estimateGas`; a call the node reports as reverting is refused here, before anything is signed. */
async function estimateGas(rpc: Rpc, call: { readonly from: Address; readonly to: Address; readonly data?: Hex; readonly value?: bigint }): Promise<bigint> {
  const value = call.value === undefined ? {} : { value: `0x${call.value.toString(16)}` };
  let raw: unknown;
  try {
    raw = await rpc.request('eth_estimateGas', [{ from: call.from, to: call.to, ...(call.data === undefined ? {} : { data: call.data }), ...value }]);
  } catch (e) {
    if (reportsRevert(e)) throw new UserFacingError({ key: 'error.sweep.blockedADryRunOfThisTransferFailsItWould' });
    throw e;
  }
  return parseQuantity(raw);
}

/** The owner nonce to sign with: the pending count, or for a same-nonce re-sign exactly the locked nonce while unused. */
async function sweepNonce(i: Pick<DirectSweepInput, 'target' | 'rpc' | 'replaceNonce'>): Promise<number> {
  const owner = i.target.owner;
  if (i.replaceNonce === undefined) return Number(parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'pending'])));
  if (!Number.isSafeInteger(i.replaceNonce) || i.replaceNonce < 0) throw new UserFacingError({ key: 'error.sweep.invalidNonceForAReplacementTransaction' });
  const mined = parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'latest']));
  if (mined > BigInt(i.replaceNonce)) {
    throw new UserFacingError({ key: 'error.sweep.aTransactionWithThisNonceIsAlreadyOnChainSo' });
  }
  return i.replaceNonce;
}

/** Longest a reviewed direct sweep may wait for its signature: its fee fields come from a gas price read at review. */
export const DIRECT_SWEEP_REVIEW_TTL_SECONDS = 120;

/** The unsigned EIP-1559 transfer a direct sweep signs. */
export interface DirectSweepUnsignedTx {
  readonly type: 'eip1559';
  readonly chainId: number;
  readonly nonce: number;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly gas: bigint;
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
}

/**
 * A direct sweep computed for the user's review and not yet signed (G07-D2). The stealth key signs in the page, with no
 * wallet confirmation, so this review is the only one: {@link signReviewedDirectSweep} signs exactly `unsigned`, and
 * every figure shown to the user is derived from the same fields.
 */
export interface DirectSweepReview {
  readonly chainId: number;
  readonly owner: Address;
  readonly destination: Address;
  readonly asset: Address | 'native';
  /** What the transfer moves to the destination. For native coin: the balance minus `maxGasCost` and `feeReserve`. */
  readonly sent: bigint;
  /** Gas limit times max fee per gas: the most the gas of this transaction can cost, in native coin. */
  readonly maxGasCost: bigint;
  /** OP Stack L1 data fee and operator fee kept back for this transaction (twice the current quote); `0n` elsewhere. */
  readonly feeReserve: bigint;
  /** Native coin at the one-time address when reviewed. For a native sweep this is the reviewed balance. */
  readonly nativeBalance: bigint;
  /** Set for a same-nonce replacement of a lock whose handoff outcome is unknown (L2-F2). */
  readonly replaceNonce?: number;
  readonly unsigned: DirectSweepUnsignedTx;
  /** Dry run at review time; signing runs it again. */
  readonly simulation: Simulation;
  /** Unix seconds when the figures were read. */
  readonly reviewedAt: number;
}

/** What signing a reviewed direct sweep needs besides the review itself. */
export type SignReviewedDirectSweepInput = Pick<DirectSweepInput, 'target' | 'manifest' | 'rpc' | 'nowSeconds' | 'assertReviewCurrent' | 'onBeforeHandoff'>;

function sweepNow(nowSeconds: DirectSweepInput['nowSeconds']): number {
  const now = typeof nowSeconds === 'function' ? nowSeconds() : nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) throw new UserFacingError({ key: 'error.sweep.theLocalClockIsInvalidRefusingToSignASweep' });
  return now;
}

/** The exact serialized fields of `unsigned`, decoded and compared with the reviewed intent (S3-09). */
function guardDirectSweepTx(unsigned: DirectSweepUnsignedTx, intent: { readonly owner: Address; readonly token: Address | 'native'; readonly destination: Address; readonly amount: bigint }, manifest: DeploymentManifest, now: number): void {
  const reviewed = parseTransaction(serializeTransaction(unsigned));
  guardTx(
    {
      chainId: unsigned.chainId,
      to: reviewed.to ?? '',
      data: reviewed.data ?? '0x',
      value: reviewed.value ?? 0n,
      from: intent.owner,
      maxFeePerGas: reviewed.maxFeePerGas ?? 0n,
      maxPriorityFeePerGas: reviewed.maxPriorityFeePerGas ?? 0n,
      gasLimit: reviewed.gas ?? 0n,
    },
    {
      kind: 'direct_sweep',
      chainId: unsigned.chainId,
      from: intent.owner,
      token: intent.token,
      to: intent.destination,
      amount: intent.amount,
      maxFeePerGas: unsigned.maxFeePerGas,
      maxPriorityFeePerGas: unsigned.maxPriorityFeePerGas,
      gasLimit: unsigned.gas,
    },
    reviewPolicy(manifest, unsigned.chainId, { maxFeeShareBps: DIRECT_MAX_FEE_SHARE_BPS }),
    now,
  );
}

/**
 * Computes a direct sweep for review without signing it: fee fields, nonce, gas limit, the OP Stack fee reserve, the
 * amount sent and a dry run with the gas limit that will be signed. The stealth key is derived only to prove that it
 * controls the address before the destination is named to the RPC, and is wiped again at once.
 */
export async function reviewDirectSweep(i: Omit<DirectSweepInput, 'onBeforeHandoff'>): Promise<DirectSweepReview> {
  const assertSessionUnchanged = captureSessionGuard();
  const assertCurrent = (): void => { assertSessionUnchanged(); i.assertReviewCurrent?.(); };
  // A loaded session does not authorize a review that the user has since changed or cancelled.
  assertCurrent();
  zeroize(deriveVerifiedSweepKey(i.target));
  const now = sweepNow(i.nowSeconds);
  const { owner, chainId, token } = i.target;
  const gasPrice = parseQuantity(await i.rpc.request('eth_gasPrice', []));
  assertCurrent();
  const { maxFeePerGas, maxPriorityFeePerGas: priority } = sweepFeeFields(gasPrice);
  const nonce = await sweepNonce(i);
  assertCurrent();
  const nativeBalance = parseQuantity(await i.rpc.request('eth_getBalance', [owner, 'latest']));
  assertCurrent();
  // The native amount is the balance the user explicitly reviewed. A new deposit or withdrawal must require a
  // fresh balance read and consent instead of silently changing the amount this signing action will sweep.
  if (token === 'native' && nativeBalance !== i.amount) {
    throw new UserFacingError({ key: 'error.sweep.yourRPCReturnedAnUnexpectedBalance' });
  }
  let to: Address;
  let data: Hex = '0x';
  let value: bigint;
  let gas: bigint;
  let reserve: bigint;
  if (token === 'native') {
    to = i.destination;
    if (nativeBalance <= TRANSFER_GAS * maxFeePerGas) throw new UserFacingError({ key: 'error.sweep.theBalanceDoesNotCoverTheNetworkFee' });
    // A contract or EIP-7702 destination needs more than 21 000 gas, and Arbitrum's estimate includes its L1 cost.
    // Estimated with the largest value this sweep could send.
    const est = await estimateGas(i.rpc, { from: owner, to, value: nativeBalance - TRANSFER_GAS * maxFeePerGas });
    assertCurrent();
    gas = est <= TRANSFER_GAS ? TRANSFER_GAS : (est * 12n) / 10n;
    const gasCost = gas * maxFeePerGas;
    if (nativeBalance <= gasCost) throw new UserFacingError({ key: 'error.sweep.theBalanceDoesNotCoverTheNetworkFee' });
    // An OP Stack node also charges an L1 data fee (and an operator fee) outside gas * price and refuses a transaction
    // whose total cost exceeds the balance (L2-F2). They are priced on this transaction's unsigned bytes with the
    // largest value it can carry: the value only shrinks, so the encoding never grows.
    reserve = await sweepFeeReserve(i.rpc, { chainId, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, gas, to, value: nativeBalance - gasCost, data });
    assertCurrent();
    if (nativeBalance <= gasCost + reserve) throw new UserFacingError({ key: 'error.sweep.theBalanceDoesNotCoverTheNetworkFeeIncludingThe' });
    value = nativeBalance - gasCost - reserve;
    // The review below caps gas * fee at a share of the amount moved; the L1 data fee counts towards that share too.
    if (reserve > 0n && (gasCost + reserve) * 10_000n > value * BigInt(DIRECT_MAX_FEE_SHARE_BPS)) {
      throw new UserFacingError({ key: 'error.sweep.excessiveFee', values: { maximum: String(DIRECT_MAX_FEE_SHARE_BPS / 100) } });
    }
  } else {
    to = token;
    value = 0n;
    data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [i.destination, i.amount] });
    const est = await estimateGas(i.rpc, { from: owner, to, data });
    assertCurrent();
    gas = (est * 12n) / 10n;
    if (nativeBalance < gas * maxFeePerGas) {
      throw new UserFacingError({ key: 'error.sweep.theStealthAddressHasNoNativeCoinForGasUse' });
    }
    // On OP Stack the native coin must also cover the L1 data fee and operator fee of this transfer, priced on its
    // exact unsigned bytes; the node refuses a transaction it cannot pay for, and the sweep lock would jam.
    reserve = await sweepFeeReserve(i.rpc, { chainId, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, gas, to, value, data });
    assertCurrent();
    if (nativeBalance < gas * maxFeePerGas + reserve) {
      throw new UserFacingError({ key: 'error.sweep.theStealthAddressDoesNotHoldEnoughNativeCoinFor' });
    }
  }
  const unsigned: DirectSweepUnsignedTx = { type: 'eip1559', chainId, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, gas, to, value, data };
  const sent = token === 'native' ? value : i.amount;
  // Review the exact serialized bytes that will be hashed (S3-09): allowlisted token only, capped fee fields.
  guardDirectSweepTx(unsigned, { owner, token, destination: i.destination, amount: sent }, i.manifest, now);
  // Dry run with the gas limit that is signed, where the node supports it: a transfer that would revert is never signed
  // (S3-09, S3-19). A node that cannot run it is reported to the caller as a warning, not a refusal (L2-F1).
  const simulation = await simulateCall(i.rpc, { from: owner, to, data, value, gas }, token !== 'native');
  assertCurrent();
  return Object.freeze({
    chainId,
    owner,
    destination: i.destination,
    asset: token,
    sent,
    maxGasCost: gas * maxFeePerGas,
    feeReserve: reserve,
    nativeBalance,
    ...(i.replaceNonce === undefined ? {} : { replaceNonce: i.replaceNonce }),
    unsigned: Object.freeze(unsigned),
    simulation,
    reviewedAt: now,
  });
}

/**
 * Signs exactly the transaction of a reviewed direct sweep with the stealth key and broadcasts it. Nothing is recomputed:
 * a review older than {@link DIRECT_SWEEP_REVIEW_TTL_SECONDS}, a nonce or native balance that changed since the review,
 * or a dry run that now fails refuses before the key signs, and the user reviews again.
 */
export async function signReviewedDirectSweep(review: DirectSweepReview, i: SignReviewedDirectSweepInput): Promise<DirectSweepResult> {
  const assertSessionUnchanged = captureSessionGuard();
  const assertCurrent = (): number => {
    assertSessionUnchanged();
    i.assertReviewCurrent?.();
    const now = sweepNow(i.nowSeconds);
    if (now < review.reviewedAt || now - review.reviewedAt > DIRECT_SWEEP_REVIEW_TTL_SECONDS) {
      throw new UserFacingError({ key: 'error.sweep.directReviewExpired' });
    }
    return now;
  };
  const now = assertCurrent();
  const { owner, chainId, token } = i.target;
  const { unsigned } = review;
  const expectedTo = token === 'native' ? review.destination : token;
  if (review.owner !== owner || review.chainId !== chainId || unsigned.chainId !== chainId || review.asset !== token || unsigned.to !== expectedTo) {
    throw new UserFacingError({ key: 'sweep.reviewChanged' });
  }
  // The reviewed bytes are checked again as they will be signed.
  guardDirectSweepTx(unsigned, { owner, token, destination: review.destination, amount: review.sent }, i.manifest, now);
  const secret = deriveVerifiedSweepKey(i.target);
  try {
    // The nonce and the native coin at the address must be what the review was computed from.
    if (review.replaceNonce === undefined) {
      const pending = parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'pending']));
      assertCurrent();
      if (pending !== BigInt(unsigned.nonce)) throw new UserFacingError({ key: 'error.sweep.directReviewOutdated' });
    } else {
      if (review.replaceNonce !== unsigned.nonce) throw new UserFacingError({ key: 'sweep.reviewChanged' });
      const mined = parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'latest']));
      assertCurrent();
      if (mined > BigInt(unsigned.nonce)) throw new UserFacingError({ key: 'error.sweep.aTransactionWithThisNonceIsAlreadyOnChainSo' });
    }
    // Less native coin than reviewed (another sweep, or a reorg) could leave the fee unpaid and the lock jammed; more
    // (a new deposit) leaves the reviewed transaction exactly as valid, and the extra stays at the address.
    const nativeBalance = parseQuantity(await i.rpc.request('eth_getBalance', [owner, 'latest']));
    assertCurrent();
    if (nativeBalance < review.nativeBalance) throw new UserFacingError({ key: 'error.sweep.directReviewOutdated' });
    const { to, data, value, gas } = unsigned;
    // Dry run again immediately before signing: the reviewed transfer must still succeed (S3-09, S3-19).
    const simulation = await simulateCall(i.rpc, { from: owner, to, data, value, gas }, token !== 'native');
    // Check immediately before using the secret to sign, and again before handing the raw transaction to the RPC.
    assertCurrent();
    const sig = await signDigest(keccak256(serializeTransaction(unsigned)), secret);
    assertCurrent();
    const raw = serializeTransaction(unsigned, { r: sig.r, s: sig.s, yParity: sig.v - 27 });
    zeroize(secret);
    const sent = review.sent;
    // Known before handoff, so an uncertain broadcast can still be tracked by its exact hash (GP-SWEEP-OUTCOME-01).
    const expectedHash = keccak256(raw);
    const attempt: DirectSweepAttempt = { chainId, owner, nonce: unsigned.nonce, destination: review.destination, asset: token, amount: sent, expectedHash, status: 'unknown-after-handoff' };
    // Last pre-handoff checkpoint: a failure up to here means the signed bytes never left this page.
    assertCurrent();
    i.onBeforeHandoff?.(attempt);
    let hash: unknown;
    try {
      hash = await i.rpc.request('eth_sendRawTransaction', [raw]);
    } catch (error) {
      // The alert names no hash (#286 item 5); the expected hash is shown with the recorded attempt.
      throw new DirectSweepOutcomeUnknownError(
        { key: 'transaction.sweep.unknown' },
        attempt,
        simulation,
        error instanceof ChainAdapterError ? error.code : 'RPC_HANDOFF_UNKNOWN',
      );
    }
    if (typeof hash !== 'string' || hash.toLowerCase() !== expectedHash) {
      throw new DirectSweepOutcomeUnknownError(
        { key: 'transaction.sweep.hashMismatch' },
        attempt,
        simulation,
        'RPC_HASH_MISMATCH',
      );
    }
    return { hash: expectedHash, sent, maxGasCost: review.maxGasCost, attempt: { ...attempt, status: 'submitted' }, simulation };
  } finally {
    zeroize(secret);
  }
}

/** Reviews and signs in one step (library callers and tests); the Sweep page shows the review before signing it. */
export async function directSweep(i: DirectSweepInput): Promise<DirectSweepResult> {
  const review = await reviewDirectSweep(i);
  return signReviewedDirectSweep(review, i);
}

/**
 * Spec 04: one catalog key per permit pre-flight state, as the Sweep screen words it. `ok_to_permit` and
 * `already_allowed` are not refusals (the relayer skips an already-covered permit and sweeps by allowance); they have
 * text so the table is exhaustive. None of the refusal texts retries automatically.
 */
// The relayed flow only renders the PERMIT_REFUSAL_KEYS subset below. ok_to_permit and already_allowed never arrive as
// relayer refusals (an already-covered permit is skipped and the sweep uses the allowance). nonce_consumed, sig_invalid
// and unsupported_token arrive as the relayer's diagnosed classes permit_nonce_consumed, permit_signature_invalid and
// permit_unsupported_token (it re-checks the signature after a failed permit-path simulation); the table stays
// exhaustive over PermitState (pinned by sweep.test.ts):
export const SWEEP_PERMIT_STATE_KEYS: Readonly<Record<PermitState, MessageKey>> = {
  ok_to_permit: 'sweep.permit.ok',
  already_allowed: 'sweep.permit.alreadyAllowed',
  nonce_consumed: 'sweep.permit.nonceConsumed',
  sig_invalid: 'sweep.permit.failed',
  expired: 'sweep.permit.expired',
  unsupported_token: 'sweep.permit.unsupported',
};

/**
 * Relayer refusal classes (apps/relayer service.ts) that concern the permit or the owner's failure budget. While a
 * permit is in use the relayer reports every `simulation_reverted` and `token_transfer_failed` (SafeERC20FailedOperation,
 * UnexpectedBalanceDelta, e.g. a fee-on-transfer token) as `permit_failed`. That class therefore proves only that the
 * pre-broadcast simulation failed with a permit in use: the permit (bad signature, spent nonce, non-standard token) or
 * the token transfer itself may be the cause. It gets its own text, which names both without claiming which, and not
 * the `sig_invalid` text, which says the token rejected the permit. When the relayer can diagnose the permit itself it
 * answers with one of the specific `permit_nonce_consumed` / `permit_signature_invalid` / `permit_unsupported_token`
 * classes instead, which reuse the matching PermitState texts.
 */
// Rendered by Sweep.tsx through sweepPermitRefusalKey:
const PERMIT_REFUSAL_KEYS: Readonly<Record<string, MessageKey>> = {
  permit_expired: 'sweep.permit.expired',
  permit_failed: 'sweep.permit.simulationFailed',
  permit_not_supported: 'sweep.permit.unsupported',
  permit_nonce_consumed: 'sweep.permit.nonceConsumed',
  permit_signature_invalid: 'sweep.permit.failed',
  permit_unsupported_token: 'sweep.permit.unsupported',
  permit_value_too_low: 'sweep.permit.valueTooLow',
  insufficient_allowance: 'sweep.permit.noAllowance',
  owner_failure_limit: 'sweep.permit.ownerFailureLimit',
};

/** The Sweep message key for a relayer permit/grief refusal, or `undefined` for anything else (shown generically). */
export function sweepPermitRefusalKey(e: unknown): MessageKey | undefined {
  if (!(e instanceof RelayerRefusedError) || e.code === undefined || !e.beforeBroadcast) return undefined;
  return Object.hasOwn(PERMIT_REFUSAL_KEYS, e.code) ? PERMIT_REFUSAL_KEYS[e.code] : undefined;
}

/**
 * Spec 04 section 2 step 3: only a bad/unsupported/missing permit offers the direct-sweep (owner pays gas) fallback.
 * A relayer `permit_failed` may be a bad permit, so it offers the fallback too; it never retries on its own.
 *
 * `sweep.permit.nonceConsumed` deliberately does not: the nonce was spent by the owner's own key (or a front-runner)
 * and no allowance covers the sweep, so its text is shown as is and the owner decides what to do next.
 */
export function sweepPermitSuggestsDirect(key: MessageKey): boolean {
  return key === 'sweep.permit.failed' || key === 'sweep.permit.simulationFailed' || key === 'sweep.permit.unsupported' || key === 'sweep.permit.noAllowance';
}

// i18n-use: error.sweep.directReviewExpired error.sweep.directReviewOutdated sweep.reviewChanged
// i18n-use: error.sweep.aTransactionWithThisNonceIsAlreadyOnChainSo error.sweep.blockedADryRunOfThisTransferFailsItWould error.sweep.blockedTheDerivedKeyDoesNotControlThatAddress error.sweep.blockedThisAddressLooksAlmostIdenticalToAnAddressYou error.sweep.couldNotCheckEveryTransactionReceiptTheOutcomeIsStill error.sweep.couldNotCheckTheOrderOnChainTheRPCFailed error.sweep.couldNotReadTheL1DataFeeFromThisChain error.sweep.enterAValidDestinationAddress0xMixedCaseAddressesMust error.sweep.excessiveFee error.sweep.invalidNonceForAReplacementTransaction error.sweep.setARelayerURLInSettingsOrSweepDirectly error.sweep.theBalanceDoesNotCoverTheNetworkFee error.sweep.theBalanceDoesNotCoverTheNetworkFeeIncludingThe error.sweep.theDestinationMustDifferFromTheStealthAddress error.sweep.theDestinationMustNotBeAGhostPayContractOrThe error.sweep.theDestinationMustNotBeATokenContract error.sweep.theLocalClockIsInvalidRefusingToSignASweep error.sweep.theRelayerAskedForAFeeAboveThePublishedCap error.sweep.theRelayerFeeAddressDoesNotMatchTheDeploymentFee error.sweep.theRelayerFeeAddressIsUnacceptable error.sweep.theRelayerFeeIsAboveThePublishedCapForThis error.sweep.theRelayerQuoteHasAlreadyExpired error.sweep.theRelayerQuoteHasExpiredOrIsAboutToRequest error.sweep.theStealthAddressDoesNotHoldEnoughNativeCoinFor error.sweep.theStealthAddressHasNoNativeCoinForGasUse error.sweep.yourRPCReturnedAnUnexpectedBalance sweep.permit.alreadyAllowed sweep.permit.expired sweep.permit.failed sweep.permit.noAllowance sweep.permit.nonceConsumed sweep.permit.ok sweep.permit.ownerFailureLimit sweep.permit.simulationFailed sweep.permit.unsupported sweep.permit.valueTooLow transaction.sweep.hashMismatch transaction.sweep.legacy transaction.sweep.unknown
