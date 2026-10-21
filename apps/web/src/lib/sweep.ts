import {
  addressOfSecret,
  assertSponsorFeeAcceptable,
  buildSweepTypedData,
  erc20Abi,
  findToken,
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
import { deriveStealthSecret, zeroize, type PublicAnnouncement, type SecretScalar } from '@ghostpay/core-crypto';
import { encodeFunctionData, getAddress, isAddress, keccak256, serializeTransaction } from 'viem/utils';
import { UserFacingError } from './errors';
import { buildPermit } from './pay';
import { requestQuote, submitSweep, type FetchFn, type RelayerQuote } from './relayerClient';
import { requireSession } from './session';

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
  const keys = requireSession().keys;
  const secret = deriveStealthSecret(target.announcement, keys);
  if (addressOfSecret(secret) !== target.owner) {
    zeroize(secret);
    throw new UserFacingError('Blocked: the derived key does not control that address.');
  }
  return secret;
}

export function checkDestination(destination: string, owner: Address, manifest: DeploymentManifest): Address {
  if (!isAddress(destination, { strict: false })) throw new UserFacingError('Enter a valid destination address (0x…).');
  const d = getAddress(destination);
  if (d === owner) throw new UserFacingError('The destination must differ from the stealth address.');
  if (d === manifest.router || d === manifest.sweepRelayer || d === manifest.announcer || d === manifest.feeRecipient) {
    throw new UserFacingError('The destination must not be a GhostPay contract or the fee recipient.');
  }
  return d;
}

/** What the user's RPC knows about a destination address (D1). */
export interface DestinationInfo {
  readonly address: Address;
  /** `eth_getTransactionCount`: transactions SENT from it. */
  readonly txCount: bigint;
  /** Current native balance. */
  readonly balance: bigint;
  readonly isContract: boolean;
  /** Used as a sweep destination earlier in this tab (memory only; nothing is persisted). */
  readonly usedThisSession: boolean;
  /** True when any of the above says this address is not fresh. */
  readonly hasHistory: boolean;
}

const usedDestinations = new Set<string>();

/** Remembers a destination for this tab only. Deliberately not persisted: a stored list of destinations is itself a linkage record. */
export function markDestinationUsed(destination: Address): void {
  usedDestinations.add(destination.toLowerCase());
}

/** Test hook. */
export function forgetUsedDestinations(): void {
  usedDestinations.clear();
}

/**
 * Looks the destination up through the user's RPC before anything is signed. A sweep destination with history lets the
 * payer (who knows the one-time address) follow the funds and see what else that address received.
 */
export async function inspectDestination(rpc: Rpc, destination: Address): Promise<DestinationInfo> {
  const [count, balance, code] = await Promise.all([
    rpc.request('eth_getTransactionCount', [destination, 'latest']),
    rpc.request('eth_getBalance', [destination, 'latest']),
    rpc.request('eth_getCode', [destination, 'latest']),
  ]);
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new UserFacingError('Your RPC returned an unexpected answer about the destination.');
  const txCount = parseQuantity(count);
  const bal = parseQuantity(balance);
  const isContract = code !== '0x';
  const usedThisSession = usedDestinations.has(destination.toLowerCase());
  return { address: destination, txCount, balance: bal, isContract, usedThisSession, hasHistory: txCount > 0n || bal > 0n || isContract || usedThisSession };
}

/** Human-readable reasons a destination is not fresh, for the blocking confirmation. */
export function destinationWarnings(d: DestinationInfo): readonly string[] {
  const w: string[] = [];
  if (d.txCount > 0n) w.push(`It has sent ${d.txCount.toString()} transaction${d.txCount === 1n ? '' : 's'} before.`);
  if (d.balance > 0n) w.push('It already holds a native balance, so it has received funds before.');
  if (d.isContract) w.push('It is a contract (a smart wallet, exchange deposit or something else).');
  if (d.usedThisSession) w.push('You already swept to this address in this tab: the two payments are now publicly linked to each other.');
  return w;
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
  if (findToken(i.target.chainId, i.target.token) === undefined) {
    throw new UserFacingError('This token is not on the allowlist, so it will not be swept from here. The announcement may be forged.');
  }
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
    const sweepSig = await signSweep(td, secret);
    const ptd = await buildPermit(i.rpc, {
      chainId: i.target.chainId,
      token: i.target.token,
      owner: i.target.owner,
      spender: i.manifest.sweepRelayer,
      value: i.amount,
      deadline,
    });
    const permit = await signPermit(ptd, secret);
    const hash = await submitSweep(
      i.relayerUrl,
      {
        sweep: order,
        sweepSig: sweepSig.signature,
        permit: { value: i.amount, deadline, v: permit.v, r: permit.r, s: permit.s },
        quoteToken: i.quote.quoteToken,
      },
      i.fetchFn,
    );
    markDestinationUsed(i.destination);
    return hash;
  } finally {
    zeroize(secret);
  }
}

export interface DirectSweepInput {
  readonly target: SweepTarget;
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

/** Hard ceiling for `maxFeePerGas` whatever the RPC reports (500 gwei): a lying RPC cannot make the stealth address overpay without bound. */
export const MAX_FEE_PER_GAS_CAP = 500n * 10n ** 9n;
/** A native sweep is refused when its worst-case gas cost exceeds this share of the balance (5 %). */
export const MAX_NATIVE_GAS_SHARE_BPS = 500n;

/** Everything a direct sweep will sign, computed from the RPC but not yet signed: shown to the user to confirm. */
export interface DirectSweepPlan {
  readonly owner: Address;
  readonly chainId: number;
  readonly token: Address | 'native';
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
  readonly gas: bigint;
  readonly nonce: number;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly maxGasCost: bigint;
  /** Amount of the asset that reaches the destination. */
  readonly sent: bigint;
}

/**
 * Reads gas and nonce from the RPC and builds the transaction to be signed.
 *
 * @remarks Refuses tokens that are not on the allowlist: the token address comes from announcement metadata that anyone
 * can forge, and signing a call to an attacker-chosen contract from the stealth address would run its code (S3-09).
 * `maxFeePerGas` is `2 x eth_gasPrice` but never above {@link MAX_FEE_PER_GAS_CAP}; a native sweep whose worst-case gas cost
 * exceeds {@link MAX_NATIVE_GAS_SHARE_BPS} of the balance is refused.
 */
export async function planDirectSweep(i: DirectSweepInput): Promise<DirectSweepPlan> {
  const { owner, chainId, token } = i.target;
  if (token !== 'native' && findToken(chainId, token) === undefined) {
    throw new UserFacingError('This token is not on the allowlist, so it will not be swept from here. The announcement may be forged.');
  }
  const gasPrice = parseQuantity(await i.rpc.request('eth_gasPrice', []));
  let maxFeePerGas = gasPrice * 2n;
  if (maxFeePerGas > MAX_FEE_PER_GAS_CAP) {
    if (gasPrice > MAX_FEE_PER_GAS_CAP) throw new UserFacingError('The RPC reports an unusually high gas price. Refusing to sign; try again later or use another RPC.');
    maxFeePerGas = MAX_FEE_PER_GAS_CAP;
  }
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
    if (cost * 10_000n > nativeBalance * MAX_NATIVE_GAS_SHARE_BPS) {
      throw new UserFacingError('The network fee would be more than 5 % of this balance. Wait for lower gas or sweep a larger amount.');
    }
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
  return { owner, chainId, token, to, data, value, gas, nonce, maxFeePerGas, maxPriorityFeePerGas: priority, maxGasCost: gas * maxFeePerGas, sent: token === 'native' ? value : i.amount };
}

/** Signs exactly `plan` with the stealth key and broadcasts it. */
export async function executeDirectSweep(i: DirectSweepInput, plan: DirectSweepPlan): Promise<DirectSweepResult> {
  const secret = deriveVerifiedSweepKey(i.target);
  try {
    const unsigned = {
      type: 'eip1559' as const,
      chainId: plan.chainId,
      nonce: plan.nonce,
      maxFeePerGas: plan.maxFeePerGas,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      gas: plan.gas,
      to: plan.to,
      value: plan.value,
      data: plan.data,
    };
    const sig = await signDigest(keccak256(serializeTransaction(unsigned)), secret);
    const raw = serializeTransaction(unsigned, { r: sig.r, s: sig.s, yParity: sig.v - 27 });
    const hash = await i.rpc.request('eth_sendRawTransaction', [raw]);
    if (typeof hash !== 'string' || hash.toLowerCase() !== keccak256(raw)) {
      throw new UserFacingError('The RPC returned a transaction hash that does not match the signed transaction.');
    }
    markDestinationUsed(i.destination);
    return { hash: hash.toLowerCase() as Hex, sent: plan.sent, maxGasCost: plan.maxGasCost };
  } finally {
    zeroize(secret);
  }
}

/** Plan and execute in one step (no confirmation screen). The UI uses the two halves separately. */
export async function directSweep(i: DirectSweepInput): Promise<DirectSweepResult> {
  return executeDirectSweep(i, await planDirectSweep(i));
}
