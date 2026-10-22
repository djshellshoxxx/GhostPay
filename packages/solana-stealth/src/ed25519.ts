import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToNumberLE, concatBytes, equalBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { L, scalarValue, wrapScalar, zeroize, type SecretScalar } from './secret.js';

declare const pointBrand: unique symbol;

/** Validated 32-byte ed25519 public point (canonical, prime-order subgroup, not identity). */
export type PublicPoint = Uint8Array & { readonly [pointBrand]: 'Ed25519PublicPoint' };

/** Minimal random source: `crypto` or a deterministic test double. */
export type RandomSource = Pick<Crypto, 'getRandomValues'>;

type Point = InstanceType<typeof ed25519.Point>;
const G = ed25519.Point.BASE;

/** Version-1 domain separation prefix. Every hash in the scheme is keyed by a distinct label. */
export const DOMAIN = 'GhostPay/solana-stealth/v1/';

/** Domain labels used by the scheme (ADR-0017 section 3). */
export type DomainLabel = 'shared' | 'view-tag' | 'checksum' | 'spend-key' | 'view-key' | 'nonce';

/**
 * Domain separation tag bytes: `len(tag) || tag`, tag = `DOMAIN + label` (ASCII).
 * The length prefix makes the encoding injective across labels.
 */
export function dst(label: DomainLabel): Uint8Array {
  const tag = utf8ToBytes(DOMAIN + label);
  return concatBytes(Uint8Array.of(tag.length), tag);
}

/** SHA-512 over `dst(label) || parts...`, reduced mod L. */
export function hashToScalar(label: DomainLabel, ...parts: Uint8Array[]): bigint {
  return bytesToNumberLE(sha512(concatBytes(dst(label), ...parts))) % L;
}

/** SHA-256 over `dst(label) || parts...`. */
export function hash256(label: DomainLabel, ...parts: Uint8Array[]): Uint8Array {
  return sha256(concatBytes(dst(label), ...parts));
}

/** @internal Decode + validate; returns the point object. */
export function decodePoint(bytes: Uint8Array): Point {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return fail('INVALID_POINT');
  let p: Point;
  try {
    p = ed25519.Point.fromBytes(bytes, false);
  } catch {
    return fail('INVALID_POINT');
  }
  // Canonical encoding only (rejects y >= p and the "-0" x sign bit alias).
  if (!equalBytes(p.toBytes(), bytes)) return fail('INVALID_POINT');
  // Reject identity, the 8 small-order points and any mixed-order point (torsion component).
  if (p.is0() || p.isSmallOrder() || !p.isTorsionFree()) return fail('INVALID_POINT');
  return p;
}

/**
 * Validates and copies a 32-byte ed25519 public point.
 *
 * @remarks Rejects non-canonical encodings, the identity, all small-order points and every
 * point with a non-trivial torsion component (requires `L * P == identity`). Cofactor
 * multiplication is therefore unnecessary in the DH step.
 * @param bytes Candidate encoding.
 * @returns Branded copy.
 * @throws {SolanaStealthError} `INVALID_POINT`.
 */
export function parsePublicPoint(bytes: Uint8Array): PublicPoint {
  decodePoint(bytes);
  return new Uint8Array(bytes) as PublicPoint;
}

/** @internal Encode a point known to be valid. */
export function encodePoint(p: Point): PublicPoint {
  return p.toBytes() as PublicPoint;
}

/** Public point `x * G` of a secret scalar. */
export function publicFromSecret(secret: SecretScalar): PublicPoint {
  return encodePoint(G.multiply(scalarValue(secret)));
}

/** @internal Resolve the injected or global CSPRNG. */
export function resolveRng(rng?: RandomSource): RandomSource {
  const r = rng ?? (globalThis as { crypto?: RandomSource }).crypto;
  if (r === undefined || typeof r.getRandomValues !== 'function') return fail('RNG_UNAVAILABLE');
  return r;
}

/**
 * Samples a scalar in [1, L-1] from 64 random bytes reduced mod L (bias < 2^-259).
 *
 * @param rng Optional source; production callers pass nothing (global `crypto`).
 * @returns Redacting secret scalar.
 * @throws {SolanaStealthError} `RNG_UNAVAILABLE` / `RNG_FAILURE` (stuck RNG).
 */
export function randomScalar(rng?: RandomSource): SecretScalar {
  const source = resolveRng(rng);
  const buf = new Uint8Array(64);
  try {
    for (let i = 0; i < 8; i++) {
      source.getRandomValues(buf);
      const v = bytesToNumberLE(buf) % L;
      if (v !== 0n) return wrapScalar(v);
    }
    return fail('RNG_FAILURE');
  } finally {
    zeroize(buf);
  }
}

/**
 * ed25519 signature with a RAW scalar (no RFC 8032 seed hashing / clamping).
 *
 * @remarks Needed because a stealth spend key `p = s + h mod L` is a scalar, not a seed.
 * Output verifies under standard RFC 8032 verification against `A = p * G`:
 * `nonceKey = SHA-512(dst('nonce') || p_le)[0..32]`, `k = SHA-512(nonceKey || aux || M) mod L`,
 * `R = kG`, `c = SHA-512(R || A || M) mod L`, `S = k + c*p mod L`. `aux` is 32 bytes; all-zero
 * gives deterministic signatures (test vectors), random gives hedged signatures (default).
 * The result is self-verified before it is returned.
 * @param secret Spend scalar.
 * @param message Bytes to sign (Solana: the compiled message bytes).
 * @param aux Optional 32 bytes of extra randomness; defaults to fresh CSPRNG output.
 * @returns 64-byte signature `R || S`.
 * @throws {SolanaStealthError} `SIGNATURE_INVALID` if self-verification fails.
 */
export function signWithScalar(secret: SecretScalar, message: Uint8Array, aux?: Uint8Array): Uint8Array {
  const p = scalarValue(secret);
  const A = G.multiply(p).toBytes();
  let auxBytes = aux;
  if (auxBytes === undefined) {
    auxBytes = new Uint8Array(32);
    resolveRng().getRandomValues(auxBytes);
  }
  if (auxBytes.length !== 32) return fail('INVALID_INPUT');
  const pBytes = numberToBytesLE(p, 32);
  const nonceKey = sha512(concatBytes(dst('nonce'), pBytes)).subarray(0, 32);
  let k = bytesToNumberLE(sha512(concatBytes(nonceKey, auxBytes, message))) % L;
  zeroize(pBytes, nonceKey);
  if (k === 0n) k = 1n; // probability 2^-252; keeps the signature well-formed
  const R = G.multiply(k).toBytes();
  const c = bytesToNumberLE(sha512(concatBytes(R, A, message))) % L;
  const S = (k + c * p) % L;
  const sig = concatBytes(R, numberToBytesLE(S, 32));
  if (!ed25519.verify(sig, message, A, { zip215: false })) return fail('SIGNATURE_INVALID');
  return sig;
}

/** Strict RFC 8032 verification (no ZIP-215 relaxations). */
export function verifySignature(sig: Uint8Array, message: Uint8Array, pub: Uint8Array): boolean {
  try {
    return ed25519.verify(sig, message, pub, { zip215: false });
  } catch {
    return false;
  }
}

/** @internal */
export { G };
