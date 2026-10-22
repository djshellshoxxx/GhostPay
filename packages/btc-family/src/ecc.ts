import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { CURVE_ORDER, type CompressedPoint, type SecretScalar } from './secret.js';

/** @internal A secp256k1 point. */
export type Pt = ReturnType<typeof secp256k1.Point.fromBytes>;

/** @internal Generator point. */
export const G: Pt = secp256k1.Point.BASE;

/** @internal Maximum recipients sharing one scan key / per-scan k limit (BIP-352 K_max). */
export const K_MAX = 2323;

/** @internal k*G for k in [1, n-1] (noble throws otherwise). */
export function mulG(k: bigint): Pt {
  return G.multiply(k);
}

/** @internal Reads a scalar from a secret, which is already range-validated. */
export function scalarOf(secret: SecretScalar): bigint {
  return bytesToNumberBE(secret);
}

/** @internal Big-endian 32 bytes of a scalar in [0, 2^256). */
export function scalarBytes(n: bigint): Uint8Array {
  return numberToBytesBE(n, 32);
}

/** @internal Reduces modulo the group order into [0, n-1]. */
export function modN(n: bigint): bigint {
  const r = n % CURVE_ORDER;
  return r >= 0n ? r : r + CURVE_ORDER;
}

/** @internal Parses 33 bytes as a point (throws INVALID_POINT). */
export function pointFromCompressed(bytes: Uint8Array): Pt {
  if (bytes.length !== 33 || (bytes[0] !== 0x02 && bytes[0] !== 0x03)) fail('INVALID_POINT');
  try {
    return secp256k1.Point.fromBytes(bytes);
  } catch {
    return fail('INVALID_POINT');
  }
}

/** @internal BIP-340 lift_x: the point with the given x and even y, or null when x is not on the curve. */
export function liftX(x: Uint8Array): Pt | null {
  if (x.length !== 32) return null;
  try {
    return secp256k1.Point.fromBytes(concatBytes(Uint8Array.of(2), x));
  } catch {
    return null;
  }
}

/** @internal True when the affine y coordinate is even (BIP-340 convention). The point must not be infinity. */
export function hasEvenY(p: Pt): boolean {
  return (p.y & 1n) === 0n;
}

/** @internal SEC1 compressed encoding. The point must not be infinity. */
export function compress(p: Pt): CompressedPoint {
  return p.toBytes(true) as unknown as CompressedPoint;
}

/** @internal 32-byte x coordinate. The point must not be infinity. */
export function xOnly(p: Pt): Uint8Array {
  return p.toBytes(true).slice(1);
}

/** @internal BIP-352 / BIP-340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || msg). */
const TAG_CACHE = new Map<string, Uint8Array>();
export function taggedHash(tag: string, ...msgs: readonly Uint8Array[]): Uint8Array {
  let t = TAG_CACHE.get(tag);
  if (t === undefined) {
    t = sha256(utf8ToBytes(tag));
    TAG_CACHE.set(tag, t);
  }
  return sha256(concatBytes(t, t, ...msgs));
}

/** @internal ser_32: 4-byte big-endian. */
export function ser32(i: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, i, false);
  return b;
}

/** @internal Interprets a 32-byte hash as a strict scalar, or null when it is 0 or >= n. */
export function strictScalar(hash: Uint8Array): bigint | null {
  const v = bytesToNumberBE(hash);
  return v >= 1n && v < CURVE_ORDER ? v : null;
}

/** @internal Strict lowercase/uppercase hex decoder with exact byte length. */
export function parseHex(hex: string, length: number): Uint8Array {
  if (typeof hex !== 'string' || hex.length !== length * 2 || !/^[0-9a-fA-F]*$/.test(hex)) {
    return fail('INVALID_INPUT');
  }
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** @internal Variable-length strict hex decoder (even length, may be empty). */
export function parseHexAny(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    return fail('INVALID_INPUT');
  }
  return parseHex(hex, hex.length / 2);
}

/** @internal Lowercase hex. */
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
