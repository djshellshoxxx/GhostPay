import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { createBase58check } from '@scure/base';
import { fail } from './errors.js';

const b58c = createBase58check(sha256);

/** TRON mainnet/testnet address version byte (all nets share it). */
export const TRON_ADDRESS_PREFIX = 0x41;
/** Raw (hex) TRON address length: 1 prefix byte + 20 hash bytes. */
export const TRON_RAW_LENGTH = 21;

const B58_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_RE = /^[0-9a-fA-F]+$/;

/** Encodes a 21-byte raw address (0x41 || hash20) as base58check. */
export function encodeTronAddress(raw: Uint8Array): string {
  if (raw.length !== TRON_RAW_LENGTH || raw[0] !== TRON_ADDRESS_PREFIX) fail('INVALID_ADDRESS');
  return b58c.encode(raw);
}

/** Strictly decodes a base58check TRON address ("T..." 34 chars) to 21 raw bytes. */
export function decodeTronAddress(address: string): Uint8Array {
  if (typeof address !== 'string' || !B58_RE.test(address)) return fail('INVALID_ADDRESS');
  let raw: Uint8Array;
  try {
    raw = b58c.decode(address);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (raw.length !== TRON_RAW_LENGTH || raw[0] !== TRON_ADDRESS_PREFIX) return fail('INVALID_ADDRESS');
  return raw;
}

/** True when `address` is a valid base58check TRON address. */
export function isTronAddress(address: string): boolean {
  try {
    decodeTronAddress(address);
    return true;
  } catch {
    return false;
  }
}

/** Hex form (42 hex chars, "41...") of a base58 address. */
export function tronAddressToHex(address: string): string {
  return bytesToHex(decodeTronAddress(address));
}

/** Base58 form of a 42-char hex "41..." address (as the node HTTP API returns it). */
export function tronAddressFromHex(hex: string): string {
  if (typeof hex !== 'string' || hex.length !== 42 || !HEX_RE.test(hex)) return fail('INVALID_ADDRESS');
  return encodeTronAddress(hexToBytes(hex));
}

/** Base58 TRON address from a 20-byte EVM-style address (0x-hex or bare hex). */
export function tronAddressFromEvm(evm: string): string {
  const h = evm.startsWith('0x') ? evm.slice(2) : evm;
  if (h.length !== 40 || !HEX_RE.test(h)) return fail('INVALID_ADDRESS');
  return encodeTronAddress(hexToBytes(`41${h}`));
}

/** Lowercase 20-byte hash part (no 0x, no 41 prefix) of a base58 address. */
export function tronAddressToEvmHex(address: string): string {
  return bytesToHex(decodeTronAddress(address).subarray(1));
}

/** TRON address of a secp256k1 public key (33-byte compressed or 65-byte uncompressed). */
export function tronAddressFromPublicKey(pub: Uint8Array): string {
  let uncompressed: Uint8Array;
  try {
    uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  const h = keccak_256(uncompressed.subarray(1));
  const raw = new Uint8Array(TRON_RAW_LENGTH);
  raw[0] = TRON_ADDRESS_PREFIX;
  raw.set(h.subarray(12), 1);
  return encodeTronAddress(raw);
}
