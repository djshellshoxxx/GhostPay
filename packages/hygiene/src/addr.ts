import { getAddress } from 'viem/utils';
import { fail } from './errors.js';

/** Hex string typed as an address. */
export type Address = `0x${string}`;
/** Hex string. */
export type Hex = `0x${string}`;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const H32_RE = /^0x[0-9a-fA-F]{64}$/;

/** @internal Strict address parse; returns lowercase form (comparison key). Rejects bad EIP-55 mixed case. */
export function normAddress(v: unknown): Address {
  if (typeof v !== 'string' || !ADDR_RE.test(v)) return fail('INVALID_ADDRESS', 'not a 20-byte hex address');
  const body = v.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase()) {
    try {
      if (getAddress(v.toLowerCase()) !== v) return fail('INVALID_ADDRESS', 'bad checksum');
    } catch {
      return fail('INVALID_ADDRESS', 'bad checksum');
    }
  }
  return v.toLowerCase() as Address;
}

/** @internal Checksummed form of a lowercase address. */
export function checksum(a: Address): Address {
  return getAddress(a);
}

/** @internal True for 0x + 64 hex. */
export function isHash32(v: unknown): v is Hex {
  return typeof v === 'string' && H32_RE.test(v);
}

/** @internal Quantity (0x-hex, no leading zeros except 0x0) to bigint, else undefined. */
export function parseQty(v: unknown): bigint | undefined {
  if (typeof v !== 'string' || !/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v) || v.length > 66) return undefined;
  return BigInt(v);
}

/** @internal bigint to 0x quantity. */
export function toQty(n: bigint): Hex {
  return `0x${n.toString(16)}`;
}
