import { keccak_256 } from '@noble/hashes/sha3.js';

const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/**
 * Tests for a `0x`-prefixed, even-length hex string.
 *
 * @param s Candidate value (untrusted).
 * @returns Whether `s` is well-formed hex bytes.
 */
export function isHexBytes(s: unknown): s is string {
  return typeof s === 'string' && HEX_RE.test(s);
}

/**
 * Decodes validated hex into bytes.
 *
 * @param s `0x`-prefixed even-length hex.
 * @returns The bytes.
 * @throws {Error} When `s` is not well-formed hex.
 */
export function hexToBytes(s: string): Uint8Array {
  if (!isHexBytes(s)) throw new Error('invalid hex bytes');
  const out = new Uint8Array((s.length - 2) / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 + 2 * i, 4 + 2 * i), 16);
  return out;
}

/**
 * Encodes bytes as lowercase `0x` hex.
 *
 * @param b Bytes.
 * @returns Hex string.
 */
export function bytesToHex(b: Uint8Array): string {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/**
 * Keccak-256 of hex-encoded bytes.
 *
 * @param hex `0x` hex input.
 * @returns Lowercase `0x` 32-byte hash.
 * @throws {Error} When `hex` is malformed.
 */
export function keccakHex(hex: string): string {
  return bytesToHex(keccak_256(hexToBytes(hex)));
}
