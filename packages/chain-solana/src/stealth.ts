import { equalBytes } from '@noble/curves/utils.js';
import { encodeAnnouncement } from './announcement.js';
import { fail } from './errors.js';
import { reduceDigestNonZero, taggedSha512, TAG_TWEAK, TAG_VIEW_TAG } from './hash.js';
import { decodeMetaAddress, type SolanaMetaAddress } from './keys.js';
import {
  brandPoint,
  decodeAddress,
  decodePrimeOrderPoint,
  encodeAddress,
  Point,
  type EdPoint,
  type PrimeOrderPoint,
} from './point.js';
import { randomScalar, type RandomSource } from './rng.js';
import { L, scalarFromValue, scalarValue, type SecretScalar } from './secret.js';

/** Result of deriving a one-time Solana stealth address (sender side). */
export interface DerivedSolanaStealthPayment {
  /** base58 Solana address of P = S + h*B (an ordinary on-curve system account). */
  readonly stealthAddress: string;
  /** 32-byte encoding of P. */
  readonly stealthPublicKey: PrimeOrderPoint;
  /** R = r*B, published in the announcement. */
  readonly ephemeralPublicKey: PrimeOrderPoint;
  /** First byte of the view-tag hash. */
  readonly viewTag: number;
  /** Binary announcement `0x01 || R || view_tag` (no metadata). */
  readonly announcement: Uint8Array;
}

/** A detected output (receiver side). */
export interface DetectedStealthOutput {
  readonly stealthAddress: string;
  readonly stealthPublicKey: PrimeOrderPoint;
  /** h; spend key is s + h mod L (see {@link deriveStealthSpendScalar}). */
  readonly tweak: SecretScalar;
}

/** Minimal announcement fields needed to check ownership. */
export interface AnnouncementFields {
  readonly ephemeralPublicKey: Uint8Array;
  readonly viewTag: number;
}

/** @internal View tag: first byte of SHA-512(tag || K). */
export function viewTagOf(sharedPoint: EdPoint): number {
  return taggedSha512(TAG_VIEW_TAG, sharedPoint.toBytes())[0] as number;
}

/** @internal h = SHA-512(tag || K || R || S) mod L, rejected if zero. */
export function tweakOf(sharedPoint: EdPoint, R: Uint8Array, S: Uint8Array): bigint {
  return reduceDigestNonZero(taggedSha512(TAG_TWEAK, sharedPoint.toBytes(), R, S));
}

/**
 * @internal Cofactor-cleared ECDH point K = [8]*(k*Q) (Monero `ge_mul8` style).
 *
 * @remarks Q is already validated as prime-order, so [8] is a bijection on
 * the subgroup and never changes security; it is kept as defence in depth so a
 * future relaxation of input validation cannot let a torsion component of a
 * hostile R desynchronise sender and receiver.
 *
 * @throws {SolanaStealthError} `IDENTITY_POINT` (only reachable for an unvalidated small-order Q).
 */
export function sharedSecretPoint(Q: EdPoint, k: bigint): EdPoint {
  const K = Q.multiply(k).clearCofactor();
  if (K.is0()) fail('IDENTITY_POINT');
  return K;
}

/**
 * @internal P = S + h*B; the identity is rejected (only when h = -s mod L).
 *
 * @throws {SolanaStealthError} `IDENTITY_POINT`.
 */
export function addTweak(S: EdPoint, h: bigint): EdPoint {
  const P = S.add(Point.BASE.multiply(h));
  if (P.is0()) fail('IDENTITY_POINT');
  return P;
}

/**
 * @internal Sender derivation with an explicit ephemeral scalar (vectors/tests).
 *
 * @param meta Recipient keys.
 * @param ephemeral r in [1, L-1].
 */
export function deriveWithEphemeral(
  meta: SolanaMetaAddress,
  ephemeral: SecretScalar,
): DerivedSolanaStealthPayment {
  const S = decodePrimeOrderPoint(meta.spendPublicKey);
  const V = decodePrimeOrderPoint(meta.viewPublicKey);
  if (S.equals(V)) fail('KEY_REUSE');
  const r = scalarValue(ephemeral);
  const R = brandPoint(Point.BASE.multiply(r));
  const K = sharedSecretPoint(V, r);
  const h = tweakOf(K, R, meta.spendPublicKey);
  const P = brandPoint(addTweak(S, h));
  const viewTag = viewTagOf(K);
  return {
    stealthAddress: encodeAddress(P),
    stealthPublicKey: P,
    ephemeralPublicKey: R,
    viewTag,
    announcement: encodeAnnouncement({ ephemeralPublicKey: R, viewTag }),
  };
}

/**
 * Derives a fresh one-time Solana address for a recipient (sender side).
 *
 * @remarks r is sampled uniformly in [1, L-1]; R = r*B; K = [8](r*V);
 * h = H_s(K || R || S); P = S + h*B; view_tag = H_t(K)[0]. All recipient points
 * must be canonical and of prime order (see `decodePrimeOrderPoint`).
 *
 * @param meta Text meta-address or decoded keys.
 * @param rng Optional random source (tests only).
 * @returns Address, announcement and its parts.
 * @throws {SolanaStealthError} `INVALID_META_ADDRESS`, `INVALID_POINT`, `KEY_REUSE`, `RNG_*`.
 * @security r is discarded after use; reuse of r for two payments links them.
 */
export function deriveStealthPayment(
  meta: string | SolanaMetaAddress,
  rng?: RandomSource,
): DerivedSolanaStealthPayment {
  const keys = typeof meta === 'string' ? decodeMetaAddress(meta) : meta;
  const r = randomScalar(rng);
  try {
    return deriveWithEphemeral(keys, r);
  } finally {
    r.fill(0);
  }
}

/**
 * Checks whether an announcement pays the holder of `viewSecret` (receiver side).
 *
 * @remarks Recomputes K = [8](v*R), compares the view tag first (cheap rejection
 * of ~255/256 foreign announcements), then derives P = S + h*B. When
 * `expectedAddress` is given (the account the transaction actually funded), P
 * must equal it. Returns `null` for "not ours", including every hostile
 * announcement (invalid, non-canonical, small-order or torsion-mixed R, or a
 * view tag outside 0..255): a hostile announcement never halts a scan.
 * Without `expectedAddress`, a 1/256 view-tag collision returns an unfunded P,
 * so the caller must confirm the account balance.
 *
 * @param ann R and view tag from a decoded announcement.
 * @param viewSecret v.
 * @param spendPublicKey S.
 * @param expectedAddress Optional base58 destination observed on chain.
 * @returns Detected output or `null`.
 * @throws {SolanaStealthError} Only for the caller's own inputs: `INVALID_POINT` (S),
 * `INVALID_SCALAR` (v), `INVALID_ADDRESS` (expectedAddress).
 */
export function checkAnnouncement(
  ann: AnnouncementFields,
  viewSecret: SecretScalar,
  spendPublicKey: Uint8Array,
  expectedAddress?: string,
): DetectedStealthOutput | null {
  const S = decodePrimeOrderPoint(spendPublicKey);
  const v = scalarValue(viewSecret);
  const expected = expectedAddress === undefined ? undefined : decodeAddress(expectedAddress);
  if (!Number.isInteger(ann.viewTag) || ann.viewTag < 0 || ann.viewTag > 255) return null;
  let R: EdPoint;
  try {
    R = decodePrimeOrderPoint(ann.ephemeralPublicKey);
  } catch {
    return null;
  }
  const K = sharedSecretPoint(R, v);
  if (viewTagOf(K) !== ann.viewTag) return null;
  const h = tweakOf(K, ann.ephemeralPublicKey, spendPublicKey);
  const P = brandPoint(addTweak(S, h));
  if (expected !== undefined && !equalBytes(expected, P)) return null;
  return { stealthAddress: encodeAddress(P), stealthPublicKey: P, tweak: scalarFromValue(h) };
}

/**
 * Computes the one-time spend scalar x = s + h mod L for a detected output.
 *
 * @remarks x*B = P. The result is a RAW scalar (no seed); sign with
 * `signWithScalar`, not with `ed25519.sign`, which expects an RFC 8032 seed.
 *
 * @param spendSecret s.
 * @param tweak h from {@link checkAnnouncement}.
 * @param expectedPublicKey Optional P; when given, x*B must equal it.
 * @returns x as a redacting secret.
 * @throws {SolanaStealthError} `ZERO_STEALTH_KEY`, `KEY_MISMATCH`, `INVALID_SCALAR`.
 * @security x controls the funds at P. Never log or transmit it.
 */
export function deriveStealthSpendScalar(
  spendSecret: SecretScalar,
  tweak: SecretScalar,
  expectedPublicKey?: Uint8Array,
): SecretScalar {
  const x = (scalarValue(spendSecret) + scalarValue(tweak)) % L;
  if (x === 0n) fail('ZERO_STEALTH_KEY');
  if (expectedPublicKey !== undefined && !equalBytes(Point.BASE.multiply(x).toBytes(), expectedPublicKey)) {
    fail('KEY_MISMATCH');
  }
  return scalarFromValue(x);
}
