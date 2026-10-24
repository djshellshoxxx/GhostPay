import { sha256 } from '@noble/hashes/sha2.js';
import { SilentPaymentError } from './errors.js';

/**
 * Bitcoin block header and Merkle checks for data served by an untrusted block source.
 *
 * Scope (foundation only): one header's own proof of work against its claimed `nBits` and the
 * network's proof-of-work limit, header-to-header linkage, and the transaction Merkle root. It does
 * NOT validate difficulty retargeting, median-time-past, cumulative chain work or best-chain
 * selection, so a server can still serve a self-consistent low-work fork. On test networks the
 * proof-of-work limit is cheap to meet; these checks bind data to *a* header, not to *the* chain.
 */

export type HeaderNetwork = 'mainnet' | 'testnet4' | 'signet' | 'regtest';

/** `powLimit` per network from Bitcoin Core `chainparams.cpp`. */
export const POW_LIMIT: Readonly<Record<HeaderNetwork, bigint>> = Object.freeze({
  mainnet: 0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
  testnet4: 0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
  signet: 0x00000377ae000000000000000000000000000000000000000000000000000000n,
  regtest: 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
});

export interface BlockHeader {
  readonly version: number;
  /** Display-order (big-endian) hex, as block explorers show it. */
  readonly prevHash: string;
  /** Display-order hex. */
  readonly merkleRoot: string;
  readonly time: number;
  readonly bits: number;
  readonly nonce: number;
  /** Display-order hex of double-SHA256 of the 80 header bytes. */
  readonly hash: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

function bad(): never {
  throw new SilentPaymentError('INVALID_RESPONSE');
}

export function sha256d(b: Uint8Array): Uint8Array {
  return sha256(sha256(b));
}

function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Internal byte order <-> display order. */
export function reverseHex(h: string): string {
  return toHex(fromHex(h).reverse());
}

function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

/** Parses exactly 80 header bytes given as hex. */
export function parseHeader(hex: string): BlockHeader {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{160}$/.test(hex)) return bad();
  const b = fromHex(hex.toLowerCase());
  return {
    version: u32le(b, 0) | 0,
    prevHash: toHex(b.slice(4, 36).reverse()),
    merkleRoot: toHex(b.slice(36, 68).reverse()),
    time: u32le(b, 68),
    bits: u32le(b, 72),
    nonce: u32le(b, 76),
    hash: toHex(sha256d(b).reverse()),
  };
}

/**
 * Expands compact `nBits`. Rejects the encodings Bitcoin Core treats as invalid for proof of work:
 * negative (sign bit set with a non-zero mantissa), zero, or overflowing 256 bits.
 */
export function targetFromBits(bits: number): bigint {
  if (!Number.isInteger(bits) || bits < 0 || bits > 0xffffffff) return bad();
  const exponent = bits >>> 24;
  const mantissa = bits & 0x007fffff;
  if ((bits & 0x00800000) !== 0 && mantissa !== 0) return bad();
  if (mantissa === 0) return bad();
  if (exponent > 34 || (exponent === 34 && mantissa > 0xff) || (exponent === 33 && mantissa > 0xffff)) return bad();
  const target = exponent <= 3 ? BigInt(mantissa) >> BigInt(8 * (3 - exponent)) : BigInt(mantissa) << BigInt(8 * (exponent - 3));
  if (target === 0n || target >= 1n << 256n) return bad();
  return target;
}

/** The header hash meets its own `nBits`, and `nBits` is no easier than the network's limit. */
export function checkProofOfWork(h: BlockHeader, network: HeaderNetwork): void {
  const target = targetFromBits(h.bits);
  if (target > POW_LIMIT[network]) return bad();
  if (BigInt(`0x${h.hash}`) > target) return bad();
}

/**
 * Bitcoin transaction Merkle root of display-order txids. Rejects the CVE-2012-2459 mutation (two
 * identical sibling hashes at any level), which lets a different txid list share the same root.
 */
export function merkleRoot(txidsDisplay: readonly string[]): string {
  if (txidsDisplay.length === 0 || txidsDisplay.length > 1_000_000) return bad();
  let level = txidsDisplay.map((t) => {
    if (!HEX64.test(t)) return bad();
    return fromHex(t).reverse();
  });
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left;
      if (i + 1 < level.length && toHex(left) === toHex(right)) return bad();
      const both = new Uint8Array(64);
      both.set(left, 0);
      both.set(right, 32);
      next.push(sha256d(both));
    }
    level = next;
  }
  return toHex(level[0]!.slice().reverse());
}

/**
 * Full per-block check: header parses, its hash equals `expectedHash`, proof of work holds, and the
 * txid list (in block order) produces the header's Merkle root.
 */
export function verifyBlockData(p: {
  readonly headerHex: string;
  readonly expectedHash: string;
  readonly txids: readonly string[];
  readonly network: HeaderNetwork;
}): BlockHeader {
  const header = parseHeader(p.headerHex);
  if (header.hash !== p.expectedHash.toLowerCase()) return bad();
  checkProofOfWork(header, p.network);
  if (merkleRoot(p.txids) !== header.merkleRoot) return bad();
  return header;
}
