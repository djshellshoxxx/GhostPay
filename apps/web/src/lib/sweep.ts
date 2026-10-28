import {
  addressOfSecret,
  assertSponsorFeeAcceptable,
  buildSweepTypedData,
  erc20Abi,
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
import { DIRECT_MAX_FEE_SHARE_BPS, guardTx, guardTypedData, reviewPolicy, simulateCall } from './txGuard';

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
  /** For ERC-20 the amount to move; for native the whole balance minus gas is moved and this is the balance. */
  readonly amount: bigint;
  readonly rpc: Rpc;
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
 * 409), which by its API contract happens before anything is broadcast.
 */
export type SweepLockStatus = DirectSweepAttempt['status'] | 'expired' | 'refused';

/**
 * The fields a signing lock needs; the persisted journal keeps only these (no destination or amount). A direct sweep
 * carries `expectedHash`; a relayed sweep carries `order` and, once the relayer answers, the hash it reported.
 */
export interface SweepLock {
  readonly chainId: number;
  readonly owner: Address;
  readonly nonce?: number;
  readonly expectedHash?: Hex;
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

  public constructor(message: string, attempt: DirectSweepAttempt) {
    super(message);
    this.name = 'DirectSweepOutcomeUnknownError';
    this.attempt = attempt;
  }
}

export interface DirectSweepResult {
  readonly hash: Hex;
  readonly sent: bigint;
  readonly maxGasCost: bigint;
  readonly attempt: DirectSweepAttempt;
}

/**
 * Read-only receipt lookup by the exact expected hash through the configured RPC. A missing receipt, an RPC error or a
 * receipt for another hash leaves the attempt unchanged: absence is never proof that the transaction was not sent.
 */
export async function reconcileDirectSweep<T extends { readonly expectedHash: Hex; readonly status: SweepLockStatus }>(rpc: Rpc, attempt: T): Promise<T> {
  let receipt: unknown;
  try {
    receipt = await rpc.request('eth_getTransactionReceipt', [attempt.expectedHash]);
  } catch {
    return attempt;
  }
  if (typeof receipt !== 'object' || receipt === null) return attempt;
  const r = receipt as { transactionHash?: unknown; status?: unknown };
  if (typeof r.transactionHash !== 'string' || r.transactionHash.toLowerCase() !== attempt.expectedHash) return attempt;
  if (r.status === '0x1') return { ...attempt, status: 'included' };
  if (r.status === '0x0') return { ...attempt, status: 'reverted' };
  return attempt;
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
 */
export async function reconcileSweepLock<T extends SweepLock>(rpc: Rpc, lock: T): Promise<T> {
  if (lock.order !== undefined) return reconcileRelayedOrder(rpc, lock);
  const expectedHash = lock.expectedHash;
  if (expectedHash === undefined) return lock;
  const next = await reconcileDirectSweep(rpc, { expectedHash, status: lock.status });
  if (next.status === 'reverted' && lock.nonce === undefined) return lock;
  return next.status === lock.status ? lock : { ...lock, status: next.status };
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
    const nonce = Number(parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'pending'])));
    assertSessionUnchanged();
    const nativeBalance = parseQuantity(await i.rpc.request('eth_getBalance', [owner, 'latest']));
    assertSessionUnchanged();
    let to: Address;
    let data: Hex = '0x';
    let value: bigint;
    let gas: bigint;
    if (token === 'native') {
      gas = 21_000n;
      to = i.destination;
      const cost = gas * maxFeePerGas;
      if (nativeBalance <= cost) throw new UserFacingError('The balance does not cover the network fee.');
      value = nativeBalance - cost;
    } else {
      to = token;
      value = 0n;
      data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [i.destination, i.amount] });
      const est = parseQuantity(await i.rpc.request('eth_estimateGas', [{ from: owner, to, data }]));
      assertSessionUnchanged();
      gas = (est * 12n) / 10n;
      if (nativeBalance < gas * maxFeePerGas) {
        throw new UserFacingError('The stealth address has no native coin for gas. Use the relayer, or send a small amount of native coin to it first.');
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
    // Dry run where the node supports it: a transfer that would revert is never signed (S3-09, S3-19).
    await simulateCall(i.rpc, { from: owner, to, data, value }, token !== 'native');
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
        `The RPC request failed after the signed transaction was handed to it, so it may already have been broadcast. Do not sign again; check the expected transaction hash ${expectedHash}.`,
        attempt,
      );
    }
    if (typeof hash !== 'string' || hash.toLowerCase() !== expectedHash) {
      throw new DirectSweepOutcomeUnknownError(
        `The RPC returned a transaction hash that does not match the signed transaction. It may already have been broadcast; check the expected transaction hash ${expectedHash}.`,
        attempt,
      );
    }
    return { hash: expectedHash, sent, maxGasCost: gas * maxFeePerGas, attempt: { ...attempt, status: 'submitted' } };
  } finally {
    zeroize(secret);
  }
}
