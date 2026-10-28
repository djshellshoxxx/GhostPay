import {
  addressOfSecret,
  assertSponsorFeeAcceptable,
  buildSweepTypedData,
  erc20Abi,
  findChain,
  ghostPaySweepRelayerAbi,
  parseQuantity,
  signDigest,
  signPermit,
  signSweep,
  type Address,
  type DeploymentManifest,
  type Hex,
  type RpcClient,
  type SweepOrder,
} from '@ghostpay/chain-adapters';
import { findLookalikes, parseStrictAddress, isReason, classifyDestination, type DestinationClass } from '@ghostpay/address-safety';
import { deriveStealthSecret, zeroize, type PublicAnnouncement, type SecretScalar } from '@ghostpay/core-crypto';
import type { TypedDataInput } from '@ghostpay/tx-review';
import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, parseTransaction, serializeTransaction } from 'viem/utils';
import { UserFacingError } from './errors';
import { buildPermit } from './pay';
import { requestQuote, submitSweep, type FetchFn, type RelayerQuote } from './relayerClient';
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
    throw new UserFacingError('Blocked: the derived key does not control that address.');
  }
  return secret;
}

/**
 * Validates a sweep destination (S3-12/S3-22 address poisoning).
 *
 * @remarks Parsing is strict: `0x` + 40 hex, all-lowercase or a valid EIP-55 checksum. A destination that shares its
 * first and last four nibbles with the stealth address, a GhostPay contract or any address in `known` (saved
 * destinations) without being equal is refused as a probable lookalike.
 *
 * @param known Addresses the user already trusts (saved destinations).
 */
export function checkDestination(destination: string, owner: Address, manifest: DeploymentManifest, known: readonly Address[] = []): Address {
  const parsed = parseStrictAddress(destination.trim());
  if (isReason(parsed)) throw new UserFacingError('Enter a valid destination address (0x…). Mixed-case addresses must have a correct checksum.');
  const d = parsed;
  if (d === owner) throw new UserFacingError('The destination must differ from the stealth address.');
  if (d === manifest.router || d === manifest.sweepRelayer || d === manifest.announcer || d === manifest.feeRecipient) {
    throw new UserFacingError('The destination must not be a GhostPay contract or the fee recipient.');
  }
  const trusted = [owner, manifest.router, manifest.sweepRelayer, manifest.announcer, manifest.feeRecipient, ...known];
  if (findLookalikes(d, trusted).length > 0) {
    throw new UserFacingError('Blocked: this address looks almost identical to an address you know (address poisoning). Check every character.');
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
  if (typeof r !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r)) throw new UserFacingError('Your RPC returned an unexpected balance.');
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
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new UserFacingError('The local clock is invalid. Refusing to sign a sweep.');
  if (quote.expiresAt <= nowSeconds + SWEEP_QUOTE_EXPIRY_SAFETY_SECONDS) {
    throw new UserFacingError('The relayer quote has expired or is about to. Request a new quote.');
  }
  if (getAddress(quote.feeTo) !== getAddress(manifest.feeRecipient)) {
    throw new UserFacingError('The relayer fee address does not match the deployment fee recipient. Refusing.');
  }
  try {
    assertSponsorFeeAcceptable(amount, quote.fee);
  } catch {
    throw new UserFacingError('The relayer fee is above the published cap for this amount. Refusing.');
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
  if (relayerUrl === '') throw new UserFacingError('Set a relayer URL in Settings, or sweep directly.');
  const quote = await requestQuote(relayerUrl, { chainId: target.chainId, token: target.token, owner: target.owner, destination, amount }, fetchFn);
  try {
    assertSponsorFeeAcceptable(amount, quote.fee);
  } catch {
    throw new UserFacingError('The relayer asked for a fee above the published cap. Refusing.');
  }
  if (quote.expiresAt <= nowSeconds) throw new UserFacingError('The relayer quote has already expired.');
  if (quote.feeTo === target.owner || quote.feeTo === destination) throw new UserFacingError('The relayer fee address is unacceptable.');
  if (quote.feeTo !== getAddress(feeRecipient)) throw new UserFacingError('The relayer fee address does not match the deployment fee recipient. Refusing.');
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
    assertSessionUnchanged();
    const sweepSig = await signSweep(td, secret);
    checkQuote();
    assertSessionUnchanged();
    const ptd = await buildPermit(i.rpc, {
      chainId: i.target.chainId,
      token: i.target.token,
      owner: i.target.owner,
      spender: i.manifest.sweepRelayer,
      value: i.amount,
      deadline,
    });
    checkQuote();
    assertSessionUnchanged();
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
    assertSessionUnchanged();
    const permit = await signPermit(ptd, secret);
    checkQuote();
    assertSessionUnchanged();
    zeroize(secret);
    // This is the last pre-broadcast checkpoint. Do not reject after submitSweep resolves: the relayer may
    // already have accepted the signed order even if the seller session was locked while the request was in flight.
    assertSessionUnchanged();
    checkQuote();
    i.onBeforeHandoff?.({ relayer: i.manifest.sweepRelayer, nonce: order.nonce, deadline: Number(deadline) });
    return await submitSweep(
      i.relayerUrl,
      {
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
  /** Unix seconds (default: now). */
  readonly nowSeconds?: number;
  readonly destination: Address;
  /**
   * For ERC-20 the amount to move; for native the whole balance minus every fee (gas, and on OP Stack the L1 data fee)
   * is moved and this is the balance.
   */
  readonly amount: bigint;
  readonly rpc: Rpc;
  /**
   * Re-sign an unresolved direct sweep (L2-F2): sign with exactly this owner nonce, the locked one, instead of the
   * pending count. Only one transaction per nonce can ever be mined, so the new one can replace the recorded one but
   * never add a second transfer. Refused once a transaction with this nonce is mined.
   */
  readonly replaceNonce?: number;
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
 * 409), which by its API contract happens before anything is broadcast. `replaced`: a direct sweep whose recorded
 * transaction has no receipt while the owner's nonce is already used at the finalized block, so it can never be mined
 * (after a same-nonce re-sign, an earlier attempt was).
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
export class DirectSweepOutcomeUnknownError extends UserFacingError {
  public readonly attempt: DirectSweepAttempt;
  /** As on {@link DirectSweepResult}: `unavailable` means the bytes were handed off without a dry run; show the warning. */
  public readonly simulation: Simulation;

  public constructor(message: string, attempt: DirectSweepAttempt, simulation: Simulation) {
    super(message);
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
    throw new UserFacingError('Could not check the order on chain (the RPC failed or does not report finalized blocks). Its outcome is still unknown; check again later.');
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
 * read, leaves the lock unchanged.
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
  if (lock.nonce === undefined || !isUnresolvedAttempt(lock) || !(await nonceFinal(rpc, lock.owner, lock.nonce))) return lock;
  // Look once more now that the nonce is final: a receipt for a recorded hash still wins, and an RPC error or a
  // malformed answer proves nothing (B-R1).
  const again = await readReceipts(rpc, hashes);
  if (again.mined !== undefined) return settled(lock, again.mined);
  return again.allAbsent ? { ...lock, status: 'replaced' } : lock;
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

/** OP Stack GasPriceOracle predeploy: prices a transaction's L1 data fee and operator fee. */
export const OP_STACK_GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F' as Address;

/**
 * A native sweep on an OP Stack chain keeps back this multiple of the fees the oracle quotes now, because the L1 base fee
 * and blob fee can rise before inclusion. The unused part stays at the one-time address.
 */
export const OP_STACK_FEE_RESERVE_MULTIPLIER = 2n;

const gasPriceOracleAbi = [
  { type: 'function', name: 'getL1Fee', stateMutability: 'view', inputs: [{ name: '_data', type: 'bytes' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getOperatorFee', stateMutability: 'view', inputs: [{ name: '_gasUsed', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

async function readFeeOracle(rpc: Rpc, data: Hex): Promise<bigint> {
  const raw = await rpc.request('eth_call', [{ to: OP_STACK_GAS_PRICE_ORACLE, data }, 'latest']);
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error('invalid fee oracle answer');
  return BigInt(raw);
}

/**
 * The operator fee for `gas`. An OP Stack chain before the Isthmus upgrade has no `getOperatorFee`, so the call
 * reverts there; such a chain charges no operator fee. Any other failure is no answer and propagates.
 */
async function readOperatorFee(rpc: Rpc, gas: bigint): Promise<bigint> {
  try {
    return await readFeeOracle(rpc, encodeFunctionData({ abi: gasPriceOracleAbi, functionName: 'getOperatorFee', args: [gas] }));
  } catch (e) {
    if (reportsRevert(e)) return 0n;
    throw e;
  }
}

/**
 * What an OP Stack node charges outside `gas * gasPrice`, read from the GasPriceOracle: the L1 data fee of the unsigned
 * serialized transaction (the oracle adds the signature's size) and the operator fee for its gas limit (none where the
 * oracle has no `getOperatorFee`), times {@link OP_STACK_FEE_RESERVE_MULTIPLIER}.
 * @throws {UserFacingError} when the oracle cannot be read: the fee, and for a native sweep the amount to send, is then
 *   unknown, so nothing is signed.
 */
async function opStackFeeReserve(rpc: Rpc, unsignedTx: Hex, gas: bigint): Promise<bigint> {
  try {
    const l1 = await readFeeOracle(rpc, encodeFunctionData({ abi: gasPriceOracleAbi, functionName: 'getL1Fee', args: [unsignedTx] }));
    const operator = await readOperatorFee(rpc, gas);
    return (l1 + operator) * OP_STACK_FEE_RESERVE_MULTIPLIER;
  } catch {
    throw new UserFacingError('Could not read the L1 data fee from this chain\'s fee oracle, so the network fee of this sweep cannot be computed. Nothing was signed.');
  }
}

/** `eth_estimateGas`; a call the node reports as reverting is refused here, before anything is signed. */
async function estimateGas(rpc: Rpc, call: { readonly from: Address; readonly to: Address; readonly data?: Hex; readonly value?: bigint }): Promise<bigint> {
  const value = call.value === undefined ? {} : { value: `0x${call.value.toString(16)}` };
  let raw: unknown;
  try {
    raw = await rpc.request('eth_estimateGas', [{ from: call.from, to: call.to, ...(call.data === undefined ? {} : { data: call.data }), ...value }]);
  } catch (e) {
    if (reportsRevert(e)) throw new UserFacingError('Blocked: a dry run of this transfer fails (it would revert). Nothing was sent.');
    throw e;
  }
  return parseQuantity(raw);
}

/** The owner nonce to sign with: the pending count, or for a same-nonce re-sign exactly the locked nonce while unused. */
async function sweepNonce(i: DirectSweepInput): Promise<number> {
  const owner = i.target.owner;
  if (i.replaceNonce === undefined) return Number(parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'pending'])));
  if (!Number.isSafeInteger(i.replaceNonce) || i.replaceNonce < 0) throw new UserFacingError('Invalid nonce for a replacement transaction.');
  const mined = parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'latest']));
  if (mined > BigInt(i.replaceNonce)) {
    throw new UserFacingError('A transaction with this nonce is already on chain, so a replacement could never be included. Check the status of the pending sweep.');
  }
  return i.replaceNonce;
}

/** Signs a plain EIP-1559 transfer with the stealth key (the stealth address pays gas) and broadcasts it. */
export async function directSweep(i: DirectSweepInput): Promise<DirectSweepResult> {
  const assertSessionUnchanged = captureSessionGuard();
  const secret = deriveVerifiedSweepKey(i.target);
  try {
    const { owner, chainId, token } = i.target;
    const gasPrice = parseQuantity(await i.rpc.request('eth_gasPrice', []));
    assertSessionUnchanged();
    const maxFeePerGas = gasPrice * 2n;
    let priority = gasPrice / 10n;
    if (priority > maxFeePerGas) priority = maxFeePerGas;
    const nonce = await sweepNonce(i);
    assertSessionUnchanged();
    const nativeBalance = parseQuantity(await i.rpc.request('eth_getBalance', [owner, 'latest']));
    assertSessionUnchanged();
    let to: Address;
    let data: Hex = '0x';
    let value: bigint;
    let gas: bigint;
    if (token === 'native') {
      to = i.destination;
      if (nativeBalance <= TRANSFER_GAS * maxFeePerGas) throw new UserFacingError('The balance does not cover the network fee.');
      // A contract or EIP-7702 destination needs more than 21 000 gas, and Arbitrum's estimate includes its L1 cost.
      // Estimated with the largest value this sweep could send.
      const est = await estimateGas(i.rpc, { from: owner, to, value: nativeBalance - TRANSFER_GAS * maxFeePerGas });
      assertSessionUnchanged();
      gas = est <= TRANSFER_GAS ? TRANSFER_GAS : (est * 12n) / 10n;
      const gasCost = gas * maxFeePerGas;
      if (nativeBalance <= gasCost) throw new UserFacingError('The balance does not cover the network fee.');
      // An OP Stack node also charges an L1 data fee (and an operator fee) outside gas * price and refuses a transaction
      // whose total cost exceeds the balance (L2-F2). They are priced on this transaction's unsigned bytes with the
      // largest value it can carry: the value only shrinks, so the encoding never grows.
      const reserve = findChain(chainId)?.opStack === true
        ? await opStackFeeReserve(i.rpc, serializeTransaction({ type: 'eip1559', chainId, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, gas, to, value: nativeBalance - gasCost, data }), gas)
        : 0n;
      assertSessionUnchanged();
      if (nativeBalance <= gasCost + reserve) throw new UserFacingError('The balance does not cover the network fee, including the L1 data fee.');
      value = nativeBalance - gasCost - reserve;
      // The review below caps gas * fee at a share of the amount moved; the L1 data fee counts towards that share too.
      if (reserve > 0n && (gasCost + reserve) * 10_000n > value * BigInt(DIRECT_MAX_FEE_SHARE_BPS)) {
        throw new UserFacingError(`Blocked before signing: the network fee, including the L1 data fee, would be more than ${String(DIRECT_MAX_FEE_SHARE_BPS / 100)} % of the amount moved.`);
      }
    } else {
      to = token;
      value = 0n;
      data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [i.destination, i.amount] });
      const est = await estimateGas(i.rpc, { from: owner, to, data });
      assertSessionUnchanged();
      gas = (est * 12n) / 10n;
      if (nativeBalance < gas * maxFeePerGas) {
        throw new UserFacingError('The stealth address has no native coin for gas. Use the relayer, or send a small amount of native coin to it first.');
      }
      // On OP Stack the native coin must also cover the L1 data fee and operator fee of this transfer, priced on its
      // exact unsigned bytes; the node refuses a transaction it cannot pay for, and the sweep lock would jam.
      const reserve = findChain(chainId)?.opStack === true
        ? await opStackFeeReserve(i.rpc, serializeTransaction({ type: 'eip1559', chainId, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, gas, to, value, data }), gas)
        : 0n;
      assertSessionUnchanged();
      if (nativeBalance < gas * maxFeePerGas + reserve) {
        throw new UserFacingError('The stealth address does not hold enough native coin for the network fee, including the L1 data fee. Use the relayer, or send a small amount of native coin to it first.');
      }
    }
    const unsigned = { type: 'eip1559' as const, chainId, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, gas, to, value, data };
    // Review the exact serialized bytes that will be hashed (S3-09): allowlisted token only, capped fee fields.
    const reviewed = parseTransaction(serializeTransaction(unsigned));
    guardTx(
      {
        chainId,
        to: reviewed.to ?? '',
        data: reviewed.data ?? '0x',
        value: reviewed.value ?? 0n,
        from: owner,
        maxFeePerGas: reviewed.maxFeePerGas ?? 0n,
        maxPriorityFeePerGas: reviewed.maxPriorityFeePerGas ?? 0n,
        gasLimit: reviewed.gas ?? 0n,
      },
      {
        kind: 'direct_sweep',
        chainId,
        from: owner,
        token,
        to: i.destination,
        amount: token === 'native' ? value : i.amount,
        maxFeePerGas,
        maxPriorityFeePerGas: priority,
        gasLimit: gas,
      },
      reviewPolicy(i.manifest, chainId, { maxFeeShareBps: DIRECT_MAX_FEE_SHARE_BPS }),
      i.nowSeconds ?? Math.floor(Date.now() / 1000),
    );
    // Dry run with the gas limit that is signed, where the node supports it: a transfer that would revert is never signed
    // (S3-09, S3-19). A node that cannot run it is reported to the caller as a warning, not a refusal (L2-F1).
    const simulation = await simulateCall(i.rpc, { from: owner, to, data, value, gas }, token !== 'native');
    assertSessionUnchanged();
    // Check immediately before using the secret to sign, and again before handing the raw transaction to the RPC.
    assertSessionUnchanged();
    const sig = await signDigest(keccak256(serializeTransaction(unsigned)), secret);
    assertSessionUnchanged();
    const raw = serializeTransaction(unsigned, { r: sig.r, s: sig.s, yParity: sig.v - 27 });
    zeroize(secret);
    const sent = token === 'native' ? value : i.amount;
    // Known before handoff, so an uncertain broadcast can still be tracked by its exact hash (GP-SWEEP-OUTCOME-01).
    const expectedHash = keccak256(raw);
    const attempt: DirectSweepAttempt = { chainId, owner, nonce, destination: i.destination, asset: token, amount: sent, expectedHash, status: 'unknown-after-handoff' };
    // Last pre-handoff checkpoint: a failure up to here means the signed bytes never left this page.
    assertSessionUnchanged();
    i.onBeforeHandoff?.(attempt);
    let hash: unknown;
    try {
      hash = await i.rpc.request('eth_sendRawTransaction', [raw]);
    } catch {
      throw new DirectSweepOutcomeUnknownError(
        `The RPC request failed after the signed transaction was handed to it, so it may already have been broadcast. Check the expected transaction hash ${expectedHash} before doing anything else.`,
        attempt,
        simulation,
      );
    }
    if (typeof hash !== 'string' || hash.toLowerCase() !== expectedHash) {
      throw new DirectSweepOutcomeUnknownError(
        `The RPC returned a transaction hash that does not match the signed transaction. It may already have been broadcast; check the expected transaction hash ${expectedHash}.`,
        attempt,
        simulation,
      );
    }
    return { hash: expectedHash, sent, maxGasCost: gas * maxFeePerGas, attempt: { ...attempt, status: 'submitted' }, simulation };
  } finally {
    zeroize(secret);
  }
}
