import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { createBase58check } from '@scure/base';
import { fail } from './errors.js';

/** Tron mainnet/testnet address prefix byte. */
export const TRON_PREFIX = 0x41;
/** Length of the raw (pre-base58check) Tron address in bytes. */
export const TRON_ADDRESS_BYTES = 21;
/** Length of an EVM address in bytes. */
export const EVM_ADDRESS_BYTES = 20;

const b58c = createBase58check(sha256);
const TRON_HEX_RE = /^41[0-9a-fA-F]{40}$/;
const EVM_HEX_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Base58check Tron address string (34 chars, starts with `T`).
 * Branded type: obtain values only from this module's parsers.
 */
export type TronAddress = string & { readonly __tronAddress: true };

/**
 * Encodes a 21-byte raw Tron address (`0x41 || 20 bytes`) as base58check.
 *
 * @param raw Exactly 21 bytes beginning with 0x41.
 * @returns Base58check address (sha256d 4-byte checksum, Bitcoin alphabet).
 * @throws {TronError} `INVALID_LENGTH` or `INVALID_PREFIX`.
 * @security Public data only.
 */
export function encodeTronAddress(raw: Uint8Array): TronAddress {
  if (raw.length !== TRON_ADDRESS_BYTES) return fail('INVALID_LENGTH');
  if (raw[0] !== TRON_PREFIX) return fail('INVALID_PREFIX');
  return b58c.encode(raw) as TronAddress;
}

/**
 * Strictly decodes a base58check Tron address to its 21 raw bytes.
 *
 * @remarks Rejects wrong alphabet characters, bad checksum, wrong decoded length
 * and any prefix other than 0x41. Checks order: shape, checksum, length, prefix.
 *
 * @param address Base58check string.
 * @returns 21 bytes `0x41 || h20`.
 * @throws {TronError} `INVALID_ADDRESS`, `INVALID_CHECKSUM`, `INVALID_LENGTH`, `INVALID_PREFIX`.
 * @security Public data only.
 */
export function decodeTronAddress(address: string): Uint8Array {
  if (typeof address !== 'string') return fail('INVALID_ADDRESS');
  let raw: Uint8Array;
  try {
    raw = b58c.decode(address);
  } catch {
    // scure throws on both bad alphabet and checksum mismatch; distinguish by alphabet probe.
    return fail(isBase58String(address) ? 'INVALID_CHECKSUM' : 'INVALID_ADDRESS');
  }
  if (raw.length !== TRON_ADDRESS_BYTES) return fail('INVALID_LENGTH');
  if (raw[0] !== TRON_PREFIX) return fail('INVALID_PREFIX');
  return raw;
}

function isBase58String(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

/**
 * Converts a base58check Tron address to its `41…` hex form (42 lowercase hex chars).
 *
 * @param address Base58check Tron address.
 * @returns Lowercase hex without `0x`.
 * @throws {TronError} As {@link decodeTronAddress}.
 * @security Public data only.
 */
export function tronAddressToHex(address: string): string {
  return bytesToHex(decodeTronAddress(address));
}

/**
 * Parses a `41…` hex address (42 hex chars, no `0x`) into base58check form.
 *
 * @param hex 42 hex characters starting with `41`.
 * @returns Base58check address.
 * @throws {TronError} `INVALID_LENGTH`, `INVALID_PREFIX` or `INVALID_ADDRESS`.
 * @security Public data only.
 */
export function tronAddressFromHex(hex: string): TronAddress {
  if (typeof hex !== 'string') return fail('INVALID_ADDRESS');
  if (!/^[0-9a-fA-F]*$/.test(hex)) return fail('INVALID_ADDRESS');
  if (hex.length !== TRON_ADDRESS_BYTES * 2) return fail('INVALID_LENGTH');
  if (!TRON_HEX_RE.test(hex)) return fail('INVALID_PREFIX');
  return encodeTronAddress(hexToBytes(hex));
}

/**
 * Accepts either base58check or `41…` hex and returns the canonical base58check form.
 *
 * @param input Tron address in either form.
 * @returns Canonical base58check address.
 * @throws {TronError} On any validation failure.
 * @security Public data only.
 */
export function parseTronAddress(input: string): TronAddress {
  if (typeof input !== 'string') return fail('INVALID_ADDRESS');
  if (input.length === TRON_ADDRESS_BYTES * 2 && /^[0-9a-fA-F]+$/.test(input)) {
    return tronAddressFromHex(input);
  }
  return encodeTronAddress(decodeTronAddress(input));
}

/**
 * Non-throwing validity check for either address form.
 *
 * @param input Candidate string (any type tolerated).
 * @returns True iff {@link parseTronAddress} would succeed.
 * @security Public data only.
 */
export function isTronAddress(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  try {
    parseTronAddress(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the 20-byte account payload of a Tron address (identical to the EVM address bytes).
 *
 * @param address Base58check or `41…` hex Tron address.
 * @returns 20 bytes.
 * @throws {TronError} On invalid input.
 * @security Public data only.
 */
export function tronAddressToBytes20(address: string): Uint8Array {
  return decodeTronAddress(parseTronAddress(address)).subarray(1);
}

/**
 * Converts a Tron address to the 20-byte EVM form `0x` + lowercase hex.
 *
 * @remarks Lowercase, not EIP-55: this package avoids a keccak-checksum dependency
 * on viem. Lowercase is accepted by strict EVM address parsers.
 *
 * @param address Base58check or `41…` hex Tron address.
 * @returns `0x` + 40 lowercase hex chars.
 * @throws {TronError} On invalid input.
 * @security Public data only.
 */
export function tronToEvmAddress(address: string): `0x${string}` {
  return `0x${bytesToHex(tronAddressToBytes20(address))}`;
}

/**
 * Converts a 20-byte EVM address to a Tron base58check address.
 *
 * @remarks Mixed-case input is NOT checksum-verified here (no EIP-55 dependency);
 * callers handling untrusted mixed-case input should verify EIP-55 first.
 *
 * @param evm `0x` + 40 hex chars.
 * @returns Base58check Tron address.
 * @throws {TronError} `INVALID_ADDRESS` / `INVALID_LENGTH`.
 * @security Public data only.
 */
export function evmToTronAddress(evm: string): TronAddress {
  if (typeof evm !== 'string') return fail('INVALID_ADDRESS');
  if (!EVM_HEX_RE.test(evm)) return fail(evm.startsWith('0x') && /^0x[0-9a-fA-F]*$/.test(evm) ? 'INVALID_LENGTH' : 'INVALID_ADDRESS');
  const raw = new Uint8Array(TRON_ADDRESS_BYTES);
  raw[0] = TRON_PREFIX;
  raw.set(hexToBytes(evm.slice(2)), 1);
  return encodeTronAddress(raw);
}

/**
 * Derives the Tron address of a secp256k1 public key: `0x41 || keccak256(X||Y)[12:]`.
 *
 * @param publicKey 33-byte compressed or 65-byte uncompressed SEC1 key (validated on-curve).
 * @returns Base58check address.
 * @throws {TronError} `INVALID_PUBLIC_KEY`.
 * @security Public data only.
 */
export function tronAddressFromPublicKey(publicKey: Uint8Array): TronAddress {
  let xy: Uint8Array;
  try {
    xy = secp256k1.Point.fromBytes(publicKey).toBytes(false).subarray(1);
  } catch {
    return fail('INVALID_PUBLIC_KEY');
  }
  const raw = new Uint8Array(TRON_ADDRESS_BYTES);
  raw[0] = TRON_PREFIX;
  raw.set(keccak_256(xy).subarray(12), 1);
  return encodeTronAddress(raw);
}
