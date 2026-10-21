import {
  addressOfSecret,
  assertSponsorFeeAcceptable,
  buildSweepTypedData,
  erc20Abi,
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
import { encodeFunctionData, keccak256, parseTransaction, serializeTransaction } from 'viem/utils';
import { UserFacingError } from './errors';
import { buildPermit } from './pay';
import { requestQuote, submitSweep, type FetchFn, type RelayerQuote } from './relayerClient';
import { withSessionSecrets } from './session';
import { DIRECT_MAX_FEE_SHARE_BPS, guardTx, guardTypedData, reviewPolicy, simulateCall } from './txGuard';

export interface SweepTarget {
  readonly chainId: number;
  readonly token: Address | 'native';
  /** Stealth address that holds the funds. */
  readonly owner: Address;
  readonly announcement: PublicAnnouncement;
}

type Rpc = Pick<RpcClient, 'request'>;

/** Derives the stealth key in memory and proves it controls `owner` before it is ever used. */
export function deriveVerifiedSweepKey(target: SweepTarget): SecretScalar {
  const secret = withSessionSecrets((s) => deriveStealthSecret(target.announcement, s.keys));
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

/** Relayer quote with the fee checked against the published cap (FEE_SCHEDULE) before anything is signed. */
export async function getSweepQuote(
  relayerUrl: string,
  target: SweepTarget & { token: Address },
  destination: Address,
  amount: bigint,
  nowSeconds: number,
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
  readonly nowSeconds: number;
  readonly fetchFn?: FetchFn;
  readonly randomNonce?: () => bigint;
}

function defaultNonce(): bigint {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return BigInt(`0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`);
}

/** Signs the EIP-712 Sweep and the ERC-2612 permit with the in-memory stealth key and hands them to the relayer. */
export async function relayedSweep(i: RelayedSweepInput): Promise<string> {
  const secret = deriveVerifiedSweepKey(i.target);
  try {
    const deadline = BigInt(i.nowSeconds + 20 * 60);
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
    const policy = reviewPolicy(i.manifest, i.target.chainId, { feeRecipient: i.quote.feeTo });
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
        feeTo: i.quote.feeTo,
        deadline,
        nonce: order.nonce,
      },
      policy,
      i.nowSeconds,
    );
    const sweepSig = await signSweep(td, secret);
    const ptd = await buildPermit(i.rpc, {
      chainId: i.target.chainId,
      token: i.target.token,
      owner: i.target.owner,
      spender: i.manifest.sweepRelayer,
      value: i.amount,
      deadline,
    });
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
      i.nowSeconds,
    );
    const permit = await signPermit(ptd, secret);
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
}

export interface DirectSweepResult {
  readonly hash: Hex;
  readonly sent: bigint;
  readonly maxGasCost: bigint;
}

/** Signs a plain EIP-1559 transfer with the stealth key (the stealth address pays gas) and broadcasts it. */
export async function directSweep(i: DirectSweepInput): Promise<DirectSweepResult> {
  const secret = deriveVerifiedSweepKey(i.target);
  try {
    const { owner, chainId, token } = i.target;
    const gasPrice = parseQuantity(await i.rpc.request('eth_gasPrice', []));
    const maxFeePerGas = gasPrice * 2n;
    let priority = gasPrice / 10n;
    if (priority > maxFeePerGas) priority = maxFeePerGas;
    const nonce = Number(parseQuantity(await i.rpc.request('eth_getTransactionCount', [owner, 'pending'])));
    const nativeBalance = parseQuantity(await i.rpc.request('eth_getBalance', [owner, 'latest']));
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
    const sig = await signDigest(keccak256(serializeTransaction(unsigned)), secret);
    const raw = serializeTransaction(unsigned, { r: sig.r, s: sig.s, yParity: sig.v - 27 });
    const hash = await i.rpc.request('eth_sendRawTransaction', [raw]);
    if (typeof hash !== 'string' || hash.toLowerCase() !== keccak256(raw)) {
      throw new UserFacingError('The RPC returned a transaction hash that does not match the signed transaction.');
    }
    return { hash: hash.toLowerCase() as Hex, sent: token === 'native' ? value : i.amount, maxGasCost: gas * maxFeePerGas };
  } finally {
    zeroize(secret);
  }
}
