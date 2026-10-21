import { buildErc20Metadata, buildNativeMetadata, parseCompressedPoint } from '@ghostpay/core-crypto';
import { bytesToHex, decodeFunctionData, encodeFunctionData, hexToBytes } from 'viem/utils';
import { ghostPayPolicyRouterAbi } from './abi/policyRouter.js';
import type { CallRequest } from './calldata.js';
import type { Scheme2Payment } from './derive.js';
import { fail } from './errors.js';
import { accountSalt, predictAccountAddress, predictAccountAddressFromSalt, type PolicyDeployment } from './policy.js';
import { MAX_UINT256, bytes32, hexBytes, nonZeroAddr, uint, type Address, type Hex } from './types.js';

/** `GhostPayPolicyRouter.FEE_BPS` (25 bps). */
export const POLICY_ROUTER_FEE_BPS = 25n;
/** Largest gross the router accepts (`gross * FEE_BPS` must not overflow). */
export const MAX_POLICY_ROUTER_GROSS = MAX_UINT256 / POLICY_ROUTER_FEE_BPS;

/** Policy router entry points. */
export type PolicyRouterMethod = 'payERC20' | 'payERC20WithPermit' | 'payNative' | 'payERC20WithBuffer';

/** Inputs of {@link buildPolicyPaymentTx}. */
export interface PolicyPaymentInput {
  /** `GhostPayPolicyRouter` of the chain (from the pinned manifest). */
  readonly router: Address;
  /** The router's `FEE_RECIPIENT()`; used to refuse colliding stealth addresses. */
  readonly feeRecipient: Address;
  /** The factory/implementation the router's `FACTORY()` uses; the account is re-predicted with it. */
  readonly deployment: PolicyDeployment;
  /** Output of {@link deriveScheme2Payment}. */
  readonly payment: Pick<Scheme2Payment, 'ownerAddress' | 'accountAddress' | 'policyHash' | 'ephemeralPublicKey' | 'viewTag'>;
  /** ERC-20 token or `'native'`. */
  readonly token: Address | 'native';
  /** Gross amount spent by the payer. */
  readonly gross: bigint;
  /** Slippage floor for the net amount; defaults to the exact net. */
  readonly minNet?: bigint;
  /** Unix-seconds deadline (inclusive on-chain). */
  readonly deadline: bigint;
  /** Current unix seconds; when given the deadline must be strictly later. */
  readonly now?: bigint;
  /** 65-byte ERC-2612 permit signature (value = gross, spender = router, same deadline). */
  readonly permitSignature?: Hex;
  /** Native gas buffer forwarded to the account (no fee). */
  readonly buffer?: { readonly bufferWei: bigint; readonly maxBufferWei?: bigint };
}

/** Output of {@link buildPolicyPaymentTx}. */
export interface PolicyPayment {
  readonly method: PolicyRouterMethod;
  readonly tx: CallRequest;
  readonly fee: bigint;
  readonly net: bigint;
  /** 57-byte announcement metadata. */
  readonly metadata: Hex;
}

/**
 * Router fee, identical to `gross * FEE_BPS / BPS` (floor).
 *
 * @param gross Gross amount in `[1, MAX_POLICY_ROUTER_GROSS]`.
 * @returns Fee.
 * @throws {PolicySchemeError} `INVALID_INPUT`.
 * @security Public data.
 */
export function policyRouterFee(gross: bigint): bigint {
  const g = uint(gross, MAX_POLICY_ROUTER_GROSS, 'gross');
  if (g === 0n) return fail('INVALID_INPUT', 'gross');
  return (g * POLICY_ROUTER_FEE_BPS) / 10_000n;
}

/**
 * Builds calldata for `GhostPayPolicyRouter` (scheme `0x47500002` checkout).
 *
 * @remarks Method: native -> `payNative`; ERC-20 + permit -> `payERC20WithPermit`; ERC-20 + buffer ->
 * `payERC20WithBuffer`; else `payERC20`. Passes the per-payment CREATE2 salt
 * `keccak256(abi.encode(owner, policyHash))` (never the seller-constant `policyHash`, round-3 audit N-01)
 * and first re-predicts the account from the deployment, so calldata whose `stealth` the router would
 * reject (`NotPolicyAccount`) is never built. Metadata is built by core-crypto (view tag | marker | asset | net),
 * with `net = gross - floor(gross * 25 / 10000)` exactly as the contract computes it.
 *
 * @param input See {@link PolicyPaymentInput}.
 * @returns Method, transaction, fee, net and metadata.
 * @throws {PolicySchemeError} `INVALID_INPUT`, `INVALID_ADDRESS`, `INVALID_HEX`. {@link GhostPayCryptoError} for bad R, tag or token.
 * @security The router binds the paid address to the factory, not to the payee: `owner` and `policyHash`
 * must come from the payee's authenticated scheme-2 meta-address. The router cannot see either (only the
 * salt), so the zero-owner and policy checks here are the only ones. ABI regenerated from
 * GhostPayPolicyRouter with the salt argument and exercised on anvil (see DEVIATIONS.md S6).
 */
export function buildPolicyPaymentTx(input: PolicyPaymentInput): PolicyPayment {
  const router = nonZeroAddr(input.router, 'router');
  const feeRecipient = nonZeroAddr(input.feeRecipient, 'feeRecipient');
  const owner = nonZeroAddr(input.payment.ownerAddress, 'owner');
  const policyHash = bytes32(input.payment.policyHash, 'policyHash');
  const stealth = predictAccountAddress(input.deployment, owner, policyHash);
  if (stealth !== nonZeroAddr(input.payment.accountAddress, 'accountAddress')) {
    return fail('INVALID_INPUT', 'accountAddress is not the predicted policy account');
  }
  if (stealth === router || stealth === feeRecipient) return fail('INVALID_INPUT', 'stealth collides with router or fee recipient');
  const fee = policyRouterFee(input.gross);
  const gross = input.gross;
  const net = gross - fee;
  const minNet = input.minNet ?? net;
  if (typeof minNet !== 'bigint' || minNet < 1n || minNet > net) return fail('INVALID_INPUT', 'minNet');
  const deadline = uint(input.deadline, MAX_UINT256, 'deadline');
  if (input.now !== undefined && deadline <= input.now) return fail('INVALID_INPUT', 'deadline already passed');
  if (input.permitSignature !== undefined && input.buffer !== undefined) return fail('INVALID_INPUT', 'permit and buffer are mutually exclusive');
  const eph = bytesToHex(parseCompressedPoint(input.payment.ephemeralPublicKey));
  const salt = accountSalt(owner, policyHash);

  if (input.token === 'native') {
    if (input.permitSignature !== undefined || input.buffer !== undefined) return fail('INVALID_INPUT', 'native payments take no permit or buffer');
    const metadata = bytesToHex(buildNativeMetadata(input.payment.viewTag, net));
    const data = encodeFunctionData({ abi: ghostPayPolicyRouterAbi, functionName: 'payNative', args: [stealth, salt, minNet, deadline, eph, metadata] });
    return Object.freeze({ method: 'payNative', tx: Object.freeze({ to: router, data, value: gross }), fee, net, metadata });
  }
  const token = nonZeroAddr(input.token, 'token');
  const metadata = bytesToHex(buildErc20Metadata(input.payment.viewTag, token, net));
  if (input.permitSignature !== undefined) {
    const sig = hexBytes(input.permitSignature, 'permitSignature');
    const raw = hexToBytes(sig);
    if (raw.length !== 65) return fail('INVALID_HEX', 'permitSignature');
    const vRaw = raw[64] as number;
    const v = vRaw < 27 ? vRaw + 27 : vRaw;
    if (v !== 27 && v !== 28) return fail('INVALID_HEX', 'permitSignature v');
    const permit = { v, r: bytesToHex(raw.subarray(0, 32)), s: bytesToHex(raw.subarray(32, 64)) };
    const data = encodeFunctionData({
      abi: ghostPayPolicyRouterAbi,
      functionName: 'payERC20WithPermit',
      args: [token, stealth, salt, gross, minNet, deadline, eph, metadata, permit],
    });
    return Object.freeze({ method: 'payERC20WithPermit', tx: Object.freeze({ to: router, data, value: 0n }), fee, net, metadata });
  }
  if (input.buffer !== undefined) {
    const bufferWei = uint(input.buffer.bufferWei, MAX_UINT256, 'bufferWei');
    const maxBufferWei = uint(input.buffer.maxBufferWei ?? bufferWei, MAX_UINT256, 'maxBufferWei');
    if (bufferWei === 0n || bufferWei > maxBufferWei) return fail('INVALID_INPUT', 'bufferWei');
    const data = encodeFunctionData({
      abi: ghostPayPolicyRouterAbi,
      functionName: 'payERC20WithBuffer',
      args: [token, stealth, salt, gross, minNet, deadline, maxBufferWei, eph, metadata],
    });
    return Object.freeze({ method: 'payERC20WithBuffer', tx: Object.freeze({ to: router, data, value: bufferWei }), fee, net, metadata });
  }
  const data = encodeFunctionData({ abi: ghostPayPolicyRouterAbi, functionName: 'payERC20', args: [token, stealth, salt, gross, minNet, deadline, eph, metadata] });
  return Object.freeze({ method: 'payERC20', tx: Object.freeze({ to: router, data, value: 0n }), fee, net, metadata });
}

/** Decoded policy-router call. */
export interface DecodedPolicyPayment {
  readonly method: PolicyRouterMethod;
  readonly stealth: Address;
  /** Per-payment CREATE2 salt `keccak256(abi.encode(owner, policyHash))`. */
  readonly salt: Hex;
  readonly ephemeralPublicKey: Hex;
  readonly metadata: Hex;
}

/** Expected account inputs for {@link decodePolicyPaymentCalldata}. */
export interface ExpectedPolicyRef {
  readonly owner: Address;
  readonly policyHash: Hex;
}

/**
 * Decodes policy-router calldata and re-checks the policy binding.
 *
 * @param data Calldata.
 * @param deployment Factory and implementation; `stealth` must equal the account predicted from the salt.
 * @param expected When given, the salt must equal `accountSalt(expected.owner, expected.policyHash)`.
 * @returns Method and the scheme-2 fields.
 * @throws {PolicySchemeError} `INVALID_INPUT` on unknown calldata or a stealth/salt mismatch.
 * @security Use before showing a wallet prompt: a tampered `stealth` or salt is detected here; pass
 * `expected` (from the payee's meta-address and the payer's derivation) to also bind owner and policy.
 */
export function decodePolicyPaymentCalldata(data: Hex, deployment: PolicyDeployment, expected?: ExpectedPolicyRef): DecodedPolicyPayment {
  let d: ReturnType<typeof decodeFunctionData<typeof ghostPayPolicyRouterAbi>>;
  try {
    d = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: hexBytes(data, 'data') });
  } catch {
    return fail('INVALID_INPUT', 'not policy router calldata');
  }
  const method = d.functionName as string;
  const ephIdx = ({ payNative: 4, payERC20: 6, payERC20WithPermit: 6, payERC20WithBuffer: 7 } as Record<string, number>)[method];
  if (ephIdx === undefined) return fail('INVALID_INPUT', 'not a payment method');
  const a = d.args as readonly unknown[];
  const native = method === 'payNative';
  const stealth = (native ? a[0] : a[1]) as Address;
  const salt = (native ? a[1] : a[2]) as Hex;
  if (predictAccountAddressFromSalt(deployment, salt) !== stealth) {
    return fail('INVALID_INPUT', 'stealth is not the policy account');
  }
  if (expected !== undefined && accountSalt(nonZeroAddr(expected.owner, 'owner'), expected.policyHash) !== salt) {
    return fail('INVALID_INPUT', 'salt does not match the expected owner and policy');
  }
  return Object.freeze({
    method: method as PolicyRouterMethod,
    stealth,
    salt,
    ephemeralPublicKey: a[ephIdx] as Hex,
    metadata: a[ephIdx + 1] as Hex,
  });
}
