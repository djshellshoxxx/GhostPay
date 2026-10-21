import {
  concat,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { assertTestnet } from '../chainGuard.js';
import { PayerSponsorError, ensure } from '../errors.js';
import type { PackedUserOperation } from './userop.js';

const U128 = 2n ** 128n;
const U48 = 2n ** 48n;

/** Parameters of `GhostPayVerifyingPaymaster` data. */
export interface PaymasterParams {
  readonly paymaster: Address;
  readonly verificationGasLimit: bigint;
  readonly postOpGasLimit: bigint;
  readonly validUntil: bigint;
  readonly validAfter: bigint;
}

/** Total byte length of the paymaster's `paymasterAndData` (20 + 16 + 16 + 6 + 6 + 65). */
export const PAYMASTER_AND_DATA_LENGTH = 129;

function head(p: PaymasterParams): Hex {
  ensure(p.verificationGasLimit >= 0n && p.verificationGasLimit < U128, 'verificationGasLimit out of range');
  ensure(p.postOpGasLimit >= 0n && p.postOpGasLimit < U128, 'postOpGasLimit out of range');
  ensure(p.validUntil > 0n && p.validUntil < U48, 'validUntil must be a non-zero 48-bit value');
  ensure(p.validAfter >= 0n && p.validAfter < U48, 'validAfter out of range');
  return concat([
    p.paymaster,
    numberToHex(p.verificationGasLimit, { size: 16 }),
    numberToHex(p.postOpGasLimit, { size: 16 }),
    numberToHex(p.validUntil, { size: 6 }),
    numberToHex(p.validAfter, { size: 6 }),
  ]);
}

/**
 * Encodes `paymasterAndData`: `paymaster || vgl || postOpGl || validUntil || validAfter || signature`.
 *
 * @param p Paymaster parameters.
 * @param signature 65-byte signature by the paymaster's verifying signer (use 65 zero bytes for hashing).
 * @returns 129 bytes of hex.
 */
export function encodePaymasterAndData(p: PaymasterParams, signature: Hex): Hex {
  ensure(signature.length === 132, 'signature must be 65 bytes');
  return concat([head(p), signature]);
}

/**
 * Decodes `paymasterAndData` of {@link encodePaymasterAndData}.
 *
 * @param data 129-byte hex.
 * @returns Parameters and signature.
 * @throws PayerSponsorError `PAYLOAD_MISMATCH` for a wrong length.
 */
export function decodePaymasterAndData(data: Hex): PaymasterParams & { readonly signature: Hex } {
  if (data.length !== 2 + PAYMASTER_AND_DATA_LENGTH * 2) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'paymasterAndData length');
  const h = data.slice(2);
  return {
    paymaster: `0x${h.slice(0, 40)}`,
    verificationGasLimit: BigInt(`0x${h.slice(40, 72)}`),
    postOpGasLimit: BigInt(`0x${h.slice(72, 104)}`),
    validUntil: BigInt(`0x${h.slice(104, 116)}`),
    validAfter: BigInt(`0x${h.slice(116, 128)}`),
    signature: `0x${h.slice(128)}`,
  };
}

/**
 * The hash the paymaster's verifying signer signs (before EIP-191 wrapping). Mirrors
 * `GhostPayVerifyingPaymaster.getHash`: it covers every operation field except the paymaster
 * signature, plus chain id, paymaster address and the validity window.
 *
 * @param op Operation whose `paymasterAndData` carries the paymaster address and gas limits (the
 *   signature part is ignored).
 * @param p Paymaster parameters (must agree with `op.paymasterAndData`).
 * @param chainId Chain id (testnet allowlist enforced).
 * @returns The 32-byte hash to wrap with `signMessage({ message: { raw } })`.
 */
export function paymasterSignedHash(op: PackedUserOperation, p: PaymasterParams, chainId: number): Hex {
  assertTestnet(chainId);
  const h1 = keccak256(
    encodeAbiParameters(parseAbiParameters('address, uint256, bytes32, bytes32, bytes32, uint256, bytes32'), [
      op.sender,
      op.nonce,
      keccak256(op.initCode),
      keccak256(op.callData),
      op.accountGasLimits,
      op.preVerificationGas,
      op.gasFees,
    ]),
  );
  const pmGas = concat([numberToHex(p.verificationGasLimit, { size: 16 }), numberToHex(p.postOpGasLimit, { size: 16 })]);
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, bytes32, uint256, address, uint48, uint48'), [
      h1,
      pmGas,
      BigInt(chainId),
      p.paymaster,
      Number(p.validUntil),
      Number(p.validAfter),
    ]),
  );
}

/**
 * Installs a paymaster signature into an operation.
 *
 * @param op Operation.
 * @param p Paymaster parameters.
 * @param signature Signature over {@link paymasterSignedHash} (EIP-191 personal-sign wrapped).
 * @returns Operation with `paymasterAndData` set.
 */
export function withPaymasterSignature(op: PackedUserOperation, p: PaymasterParams, signature: Hex): PackedUserOperation {
  return { ...op, paymasterAndData: encodePaymasterAndData(p, signature) };
}

/** Placeholder signature used while computing the paymaster hash. */
export const DUMMY_PAYMASTER_SIGNATURE: Hex = `0x${'00'.repeat(65)}`;
