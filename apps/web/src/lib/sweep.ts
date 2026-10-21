import {
  addressOfSecret,
  assertSponsorFeeAcceptable,
  buildSweepTypedData,
  erc20Abi,
  findToken,
  signTransactionHash,
  parseQuantity,
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

/** Both sweep paths (relayed and direct) only move tokens on the chain's allowlist; native coin needs no entry. */
export function assertSweepTokenAllowed(chainId: number, token: Address | 'native'): void {
  if (token !== 'native' && findToken(chainId, token) === undefined) {
    throw new UserFacingError('This token is not on the allowlist. It will not be swept from here.');
  }
}

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
  // The relayer pins feeTo to the manifest feeRecipient; a different address is a hostile or misconfigured relayer.
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
  assertSweepTokenAllowed(i.target.chainId, i.target.token);
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
  assertSweepTokenAllowed(i.target.chainId, i.target.token);
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
    const sig = await signTransactionHash(unsigned, secret);
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
