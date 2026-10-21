import { getAddress, isAddress } from 'viem/utils';
import { fail } from './errors.js';

/** 0x-prefixed hex string. */
export type Hex = `0x${string}`;
/** EIP-55 checksummed EVM address. */
export type Address = `0x${string}`;

/** ERC-5564 scheme id of the GhostPay policy-guarded account ("GP" + 2). */
export const SCHEME_ID = 0x47500002n;
/** `PolicyAccount.MAX_DELAY` (30 days). */
export const MAX_DELAY = 30n * 24n * 60n * 60n;
/** `PolicyAccountFactory.MIN_DELAY` (1 hour). The account alone accepts down to 1 s. */
export const MIN_DELAY = 60n * 60n;
/** Largest uint256. As a limit it means "unlimited". */
export const MAX_UINT256 = 2n ** 256n - 1n;
/** Largest uint64 (bound of `windowSeconds`). */
export const MAX_UINT64 = 2n ** 64n - 1n;
/** The zero address; as a token it denotes the native coin. */
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';
/** The zero word; as `limitsRoot` it means "no limits". */
export const ZERO_HASH: Hex = `0x${'00'.repeat(32)}`;

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/** @internal Strict address parse (checksum enforced for mixed case); returns EIP-55 form. */
export function addr(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: true })) return fail('INVALID_ADDRESS', field);
  return getAddress(value);
}

/** @internal Address that must not be zero. */
export function nonZeroAddr(value: unknown, field: string): Address {
  const a = addr(value, field);
  if (a === ZERO_ADDRESS) return fail('INVALID_ADDRESS', field);
  return a;
}

/** @internal Strict 32-byte hex; returns lowercase. */
export function bytes32(value: unknown, field: string): Hex {
  if (typeof value !== 'string' || !BYTES32_RE.test(value)) return fail('INVALID_HEX', field);
  return value.toLowerCase() as Hex;
}

/** @internal Strict even-length hex; returns lowercase. */
export function hexBytes(value: unknown, field: string): Hex {
  if (typeof value !== 'string' || !HEX_RE.test(value)) return fail('INVALID_HEX', field);
  return value.toLowerCase() as Hex;
}

/** @internal bigint in [0, max]. */
export function uint(value: unknown, max: bigint, field: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > max) return fail('INVALID_INPUT', field);
  return value;
}

/** @internal Positive safe-integer chain id. */
export function chainIdOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return fail('INVALID_INPUT', 'chainId');
  return value;
}
