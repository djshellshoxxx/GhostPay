import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import { fail } from './errors.js';
import { SNARK_SCALAR_FIELD } from './field.js';

/** On-chain `Withdrawal` struct (spec 6.1). Every field is bound into the proof through `context`. */
export interface Withdrawal {
  readonly recipient: Address;
  /** `0x0` means anyone may submit. */
  readonly relayer: Address;
  readonly relayerFee: bigint;
  readonly feeTo: Address;
  readonly deadline: bigint;
  /** `0x0` iff the proof has `aspEnabled == 0`. */
  readonly aspPublisher: Address;
  /** Empty, or `abi.encode(bytes ephemeralPubKey, bytes metadata)` for SP-PAY. */
  readonly announce: Hex;
}

/** The ABI tuple of {@link Withdrawal}. */
export const WITHDRAWAL_COMPONENTS = [
  { name: 'recipient', type: 'address' },
  { name: 'relayer', type: 'address' },
  { name: 'relayerFee', type: 'uint256' },
  { name: 'feeTo', type: 'address' },
  { name: 'deadline', type: 'uint256' },
  { name: 'aspPublisher', type: 'address' },
  { name: 'announce', type: 'bytes' },
] as const;

/** `abi.encode(withdrawal)` as a dynamic tuple (leading 0x20 offset), matching Solidity. */
export function encodeWithdrawal(w: Withdrawal): Hex {
  return encodeAbiParameters([{ type: 'tuple', components: WITHDRAWAL_COMPONENTS }], [w]);
}

/**
 * `uint256(keccak256(abi.encode(withdrawal, SCOPE))) % P`: the public `context` input of the proof.
 *
 * @security Any change to any field of `w` changes the context and invalidates the proof; this is
 *   what stops a relayer or front-runner from redirecting funds (SP-CON-3).
 */
export function contextOf(w: Withdrawal, scope: bigint): bigint {
  if (scope < 0n || scope >= SNARK_SCALAR_FIELD) fail('INVALID_INPUT', 'scope not a field element');
  const data = encodeAbiParameters(
    [{ type: 'tuple', components: WITHDRAWAL_COMPONENTS }, { type: 'uint256' }],
    [w, scope],
  );
  return BigInt(keccak256(data)) % SNARK_SCALAR_FIELD;
}

/** Fee in bps of `value`, rounded down. */
export function maxFee(value: bigint, bps: bigint): bigint {
  return (value * bps) / 10_000n;
}
