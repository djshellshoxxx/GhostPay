import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { parseTronAddress, tronAddressToBytes20, tronAddressToHex } from './address.js';
import { fail } from './errors.js';

/** Function selector of `transfer(address,uint256)`. */
export const TRC20_TRANSFER_SELECTOR = 'a9059cbb';
/** Function selector of `balanceOf(address)`. */
export const TRC20_BALANCE_OF_SELECTOR = '70a08231';
/** Canonical signature strings used in `function_selector`. */
export const TRC20_TRANSFER_SIGNATURE = 'transfer(address,uint256)';
export const TRC20_BALANCE_OF_SIGNATURE = 'balanceOf(address)';

/** Maximum uint256. */
export const UINT256_MAX: bigint = (1n << 256n) - 1n;
/** 1 TRX = 1_000_000 sun. */
export const SUN_PER_TRX = 1_000_000n;
/**
 * Upper bound for `fee_limit` in sun (15,000 TRX).
 * @remarks UNVERIFIED against live network parameter `getMaxFeeLimit`; see DEVIATIONS.
 */
export const MAX_FEE_LIMIT_SUN: bigint = 15_000n * SUN_PER_TRX;
/** Upper bound for `call_value` in sun; kept within JS safe-integer range for JSON. */
export const MAX_CALL_VALUE_SUN: bigint = BigInt(Number.MAX_SAFE_INTEGER);

/** Plain-data body for TronGrid/full-node `POST /wallet/triggersmartcontract`. */
export interface TriggerSmartContractBody {
  /** `41…` hex (visible=false). */
  readonly owner_address: string;
  readonly contract_address: string;
  readonly function_selector: string;
  /** ABI-encoded arguments WITHOUT selector, hex, no 0x. */
  readonly parameter: string;
  /** Sun. */
  readonly fee_limit: number;
  /** Sun. */
  readonly call_value: number;
  readonly visible: false;
}

/** Plain-data body for `POST /wallet/triggerconstantcontract` (read-only calls). */
export interface TriggerConstantContractBody {
  readonly owner_address: string;
  readonly contract_address: string;
  readonly function_selector: string;
  readonly parameter: string;
  readonly visible: false;
}

/** Inputs for {@link buildTrc20TransferRequest}. */
export interface Trc20TransferParams {
  /** Sender (payer) address. */
  readonly owner: string;
  /** TRC-20 contract address. */
  readonly contract: string;
  /** Recipient, typically a stealth address. */
  readonly to: string;
  /** Base units, 1..2^256-1. */
  readonly amount: bigint;
  /** Max energy burn in sun, 1..{@link MAX_FEE_LIMIT_SUN}. */
  readonly feeLimit: bigint;
  /** TRX attached in sun; default 0. */
  readonly callValue?: bigint;
}

function word(bytes20: Uint8Array): Uint8Array {
  const w = new Uint8Array(32);
  w.set(bytes20, 12);
  return w;
}

/**
 * ABI-encodes a uint256 as a 32-byte big-endian word.
 *
 * @param value Integer in [0, 2^256-1].
 * @returns 32 bytes.
 * @throws {TronError} `INVALID_AMOUNT`.
 */
export function encodeUint256(value: bigint): Uint8Array {
  if (typeof value !== 'bigint' || value < 0n || value > UINT256_MAX) return fail('INVALID_AMOUNT');
  return hexToBytes(value.toString(16).padStart(64, '0'));
}

/**
 * ABI-encodes `transfer(address,uint256)` arguments (no selector).
 *
 * @param to Recipient Tron address (base58check or `41…`).
 * @param amount Amount in [1, 2^256-1].
 * @returns 64 bytes.
 * @throws {TronError} On invalid address or amount.
 * @security Public data only. A zero amount is rejected to avoid address-poisoning style dust.
 */
export function encodeTrc20TransferArgs(to: string, amount: bigint): Uint8Array {
  if (typeof amount !== 'bigint' || amount < 1n || amount > UINT256_MAX) return fail('INVALID_AMOUNT');
  const out = new Uint8Array(64);
  out.set(word(tronAddressToBytes20(to)), 0);
  out.set(encodeUint256(amount), 32);
  return out;
}

/**
 * Full EVM-style calldata (selector + args) for `transfer`, hex without `0x`.
 *
 * @param to Recipient.
 * @param amount Amount.
 * @returns 136 hex chars.
 * @throws {TronError} As {@link encodeTrc20TransferArgs}.
 */
export function encodeTrc20TransferCalldata(to: string, amount: bigint): string {
  return TRC20_TRANSFER_SELECTOR + bytesToHex(encodeTrc20TransferArgs(to, amount));
}

/**
 * ABI-encodes `balanceOf(address)` arguments (no selector).
 *
 * @param account Tron address.
 * @returns 32 bytes.
 * @throws {TronError} On invalid address.
 */
export function encodeTrc20BalanceOfArgs(account: string): Uint8Array {
  return word(tronAddressToBytes20(account));
}

/**
 * Decodes a 32-byte hex `constant_result` entry as uint256.
 *
 * @param hex 64 hex chars (optionally `0x`-prefixed).
 * @returns Value.
 * @throws {TronError} `INVALID_ABI_DATA`.
 */
export function decodeUint256Result(hex: string): bigint {
  const h = typeof hex === 'string' && hex.startsWith('0x') ? hex.slice(2) : hex;
  if (typeof h !== 'string' || !/^[0-9a-fA-F]{64}$/.test(h)) return fail('INVALID_ABI_DATA');
  return BigInt(`0x${h}`);
}

/**
 * Computes the 4-byte selector of a canonical signature (keccak256 prefix), hex.
 *
 * @param signature e.g. `transfer(address,uint256)`.
 * @returns 8 hex chars.
 */
export function selectorOf(signature: string): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(signature)).subarray(0, 4));
}

/**
 * Builds the `triggersmartcontract` request body for a TRC-20 `transfer`.
 *
 * @remarks Pure data: NO network access, no signing. The caller sends it to a node
 * they trust, then signs the returned transaction locally after re-verifying that
 * `raw_data` matches the intent (a malicious node can swap the call).
 *
 * @param p Transfer parameters; amounts are bigint.
 * @returns JSON-serializable body with hex (`visible:false`) addresses.
 * @throws {TronError} On any invalid address, amount, fee limit or call value.
 * @security Never trust the node's response blindly; verify before signing.
 */
export function buildTrc20TransferRequest(p: Trc20TransferParams): TriggerSmartContractBody {
  const callValue = p.callValue ?? 0n;
  if (typeof p.feeLimit !== 'bigint' || p.feeLimit < 1n || p.feeLimit > MAX_FEE_LIMIT_SUN) {
    return fail('INVALID_FEE_LIMIT');
  }
  if (typeof callValue !== 'bigint' || callValue < 0n || callValue > MAX_CALL_VALUE_SUN) {
    return fail('INVALID_CALL_VALUE');
  }
  return {
    owner_address: tronAddressToHex(parseTronAddress(p.owner)),
    contract_address: tronAddressToHex(parseTronAddress(p.contract)),
    function_selector: TRC20_TRANSFER_SIGNATURE,
    parameter: bytesToHex(encodeTrc20TransferArgs(p.to, p.amount)),
    fee_limit: Number(p.feeLimit),
    call_value: Number(callValue),
    visible: false,
  };
}

/**
 * Builds the `triggerconstantcontract` body for TRC-20 `balanceOf`.
 *
 * @param owner Caller address (any valid address).
 * @param contract TRC-20 contract.
 * @param account Account to query.
 * @returns Plain request body.
 * @throws {TronError} On invalid addresses.
 */
export function buildTrc20BalanceOfRequest(owner: string, contract: string, account: string): TriggerConstantContractBody {
  return {
    owner_address: tronAddressToHex(parseTronAddress(owner)),
    contract_address: tronAddressToHex(parseTronAddress(contract)),
    function_selector: TRC20_BALANCE_OF_SIGNATURE,
    parameter: bytesToHex(encodeTrc20BalanceOfArgs(account)),
    visible: false,
  };
}
