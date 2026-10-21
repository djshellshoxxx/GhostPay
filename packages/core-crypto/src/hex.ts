import { hexToBytes } from '@noble/hashes/utils.js';
import { isAddress } from 'viem/utils';
import { fail, type CryptoErrorCode } from './errors.js';

/** 0x-prefixed lowercase/uppercase hex string. */
export type Hex = `0x${string}`;
/** EVM address string. */
export type Address = `0x${string}`;

const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/** @internal Strict 0x-hex to bytes. */
export function strictHexToBytes(value: unknown, code: CryptoErrorCode): Uint8Array {
  if (typeof value !== 'string' || !HEX_RE.test(value)) return fail(code);
  return hexToBytes(value.slice(2));
}

/** @internal Strict address check (checksum enforced for mixed case). */
export function assertAddress(value: unknown, code: CryptoErrorCode): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: true })) return fail(code);
  return value;
}
