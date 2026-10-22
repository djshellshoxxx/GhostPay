import { ed25519 } from '@noble/curves/ed25519.js';
import { equalBytes } from '@noble/curves/utils.js';
import { base58 } from '@scure/base';
import { fail } from './errors.js';

declare const pointBrand: unique symbol;

/** noble ed25519 extended point. */
export type EdPoint = typeof ed25519.Point.BASE;

/** Point constructor (exposes BASE, ZERO, Fn). */
export const Point = ed25519.Point;

/**
 * A validated 32-byte ed25519 encoding of a point in the prime-order subgroup,
 * not the identity, in canonical form (y < p, no "negative zero" x).
 */
export type PrimeOrderPoint = Uint8Array & { readonly [pointBrand]: 'PrimeOrderPoint' };

/**
 * Strictly decodes a public point that must lie in the prime-order subgroup.
 *
 * @remarks Rejects: wrong length; y >= p (non-canonical); x = 0 with the sign bit
 * set; any encoding that does not re-encode byte-identically; the identity; any
 * point with a torsion component (`isTorsionFree() === false`, which includes
 * all 8 small-order points). Because every accepted point has prime order L, no
 * cofactor multiplication is needed anywhere in this package.
 *
 * @param bytes Candidate 32-byte encoding.
 * @returns The decoded point.
 * @throws {SolanaStealthError} `INVALID_POINT`.
 */
export function decodePrimeOrderPoint(bytes: Uint8Array): EdPoint {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return fail('INVALID_POINT');
  let p: EdPoint;
  try {
    p = Point.fromBytes(bytes, false); // RFC 8032 strict decoding
  } catch {
    return fail('INVALID_POINT');
  }
  if (!equalBytes(p.toBytes(), bytes)) return fail('INVALID_POINT');
  if (p.is0() || p.isSmallOrder() || !p.isTorsionFree()) return fail('INVALID_POINT');
  return p;
}

/**
 * Validates and copies a prime-order point encoding (see {@link decodePrimeOrderPoint}).
 *
 * @param bytes Candidate encoding.
 * @returns Branded copy.
 * @throws {SolanaStealthError} `INVALID_POINT`.
 */
export function parsePrimeOrderPoint(bytes: Uint8Array): PrimeOrderPoint {
  decodePrimeOrderPoint(bytes);
  return Uint8Array.from(bytes) as PrimeOrderPoint;
}

/** @internal Encode a point already known to be prime-order and non-identity. */
export function brandPoint(p: EdPoint): PrimeOrderPoint {
  return p.toBytes() as PrimeOrderPoint;
}

/**
 * Solana "is on curve" predicate as used by PDA derivation.
 *
 * @remarks Mirrors `bytes_are_curve_point` in solana-program (curve25519-dalek
 * `CompressedEdwardsY::decompress().is_some()`): y is taken mod p with the top
 * bit as the x sign, and x = 0 with the sign bit set is accepted. noble's
 * `fromBytes(bytes, zip215 = true)` has the same acceptance set. No subgroup
 * check (dalek does none here either).
 *
 * @param bytes 32 bytes.
 * @returns True when the bytes decompress to a curve point.
 */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  try {
    Point.fromBytes(bytes, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encodes 32 bytes as a Solana base58 address.
 *
 * @param bytes 32-byte public key / program address.
 * @returns Base58 string.
 * @throws {SolanaStealthError} `INVALID_ADDRESS` for wrong length.
 */
export function encodeAddress(bytes: Uint8Array): string {
  if (bytes.length !== 32) fail('INVALID_ADDRESS');
  return base58.encode(bytes);
}

/**
 * Strictly decodes a Solana base58 address to 32 bytes.
 *
 * @remarks Rejects non-base58 characters, any length other than 32 bytes, and
 * strings that do not re-encode identically.
 *
 * @param address Base58 string.
 * @returns 32 bytes.
 * @throws {SolanaStealthError} `INVALID_ADDRESS`.
 */
export function decodeAddress(address: string): Uint8Array {
  if (typeof address !== 'string' || address.length < 32 || address.length > 44)
    return fail('INVALID_ADDRESS');
  let b: Uint8Array;
  try {
    b = base58.decode(address);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (b.length !== 32 || base58.encode(b) !== address) return fail('INVALID_ADDRESS');
  return b;
}
