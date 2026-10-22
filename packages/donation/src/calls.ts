import { encodeFunctionData, isAddress, toHex, type Address, type Hex } from 'viem';
import { isUsableRecipient } from './recipient.js';

/** Minimal ERC-20 `transfer` ABI. */
export const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/** A transaction-shaped call. */
export interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

/** Input of {@link buildDonationCall}. */
export interface DonationCallInput {
  chainId: number;
  /** ERC-20 address or `'native'`. */
  token: Address | 'native';
  recipient: Address;
  /** Base units; must be > 0. */
  amount: bigint;
}

/** Why no call was built. */
export type CallRefusal = 'zero_amount' | 'bad_amount' | 'bad_recipient' | 'bad_token' | 'bad_chain';

/** Result of {@link buildDonationCall}. */
export type DonationCallResult =
  { ok: true; call: Call; chainId: number } | { ok: false; reason: CallRefusal };

/** Above this, amounts do not fit a uint256. */
const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Builds the donation transfer.
 * @security Refuses amount 0, malformed or zero addresses, and bad chain ids; never builds a call
 * for an unvalidated recipient. Pure; does not sign or send.
 * @param input See {@link DonationCallInput}.
 */
export function buildDonationCall(input: DonationCallInput): DonationCallResult {
  const { chainId, token, recipient, amount } = input;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return { ok: false, reason: 'bad_chain' };
  if (typeof amount !== 'bigint' || amount < 0n || amount > UINT256_MAX)
    return { ok: false, reason: 'bad_amount' };
  if (amount === 0n) return { ok: false, reason: 'zero_amount' };
  if (!isUsableRecipient(recipient)) return { ok: false, reason: 'bad_recipient' };
  if (token === 'native') return { ok: true, chainId, call: { to: recipient, data: '0x', value: amount } };
  if (!isUsableRecipient(token)) return { ok: false, reason: 'bad_token' };
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
  });
  return { ok: true, chainId, call: { to: token, data, value: 0n } };
}

/** EIP-5792 call entry (hex quantity value). */
export interface SendCallsEntry {
  to: Address;
  data: Hex;
  value: Hex;
}

/** EIP-5792 `wallet_sendCalls` params object. */
export interface SendCallsParams {
  version: '2.0.0';
  chainId: Hex;
  atomicRequired: false;
  calls: SendCallsEntry[];
}

/**
 * Builds `wallet_sendCalls` params with the donation LAST and `atomicRequired: false`.
 * Atomicity choice: the flag only states atomicity is not REQUIRED, so a donation failure need not
 * revert the payment; a wallet may still choose atomic execution. Callers needing the hard guarantee
 * use the sequential after-confirmation path.
 * @security Pure; refuses empty main calls and a malformed call address.
 * @param chainId Chain id.
 * @param mainCalls The payment calls (non-empty).
 * @param donationCall Optional donation call, appended last.
 */
export function buildSendCallsBatch(
  chainId: number,
  mainCalls: readonly Call[],
  donationCall?: Call,
): SendCallsParams {
  if (!Number.isSafeInteger(chainId) || chainId <= 0)
    throw new RangeError('chainId must be a positive integer');
  if (mainCalls.length === 0) throw new RangeError('mainCalls must not be empty');
  const all = donationCall === undefined ? mainCalls : [...mainCalls, donationCall];
  const calls = all.map((c): SendCallsEntry => {
    if (!isAddress(c.to, { strict: false })) throw new RangeError('call.to must be an address');
    return { to: c.to, data: c.data, value: toHex(c.value) };
  });
  return { version: '2.0.0', chainId: toHex(chainId), atomicRequired: false, calls };
}

/**
 * True when the wallet's `wallet_getCapabilities` result lists the chain (so `wallet_sendCalls` can be used).
 * @security Pure; treats anything unexpected as unsupported.
 * @param capabilities Result of `wallet_getCapabilities`.
 * @param chainId Chain id.
 */
export function supportsSendCalls(capabilities: unknown, chainId: number): boolean {
  if (typeof capabilities !== 'object' || capabilities === null) return false;
  const want = toHex(chainId).toLowerCase();
  return Object.entries(capabilities).some(
    ([k, v]) => k.toLowerCase() === want && typeof v === 'object' && v !== null,
  );
}
