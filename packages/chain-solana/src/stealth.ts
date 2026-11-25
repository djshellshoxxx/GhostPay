import { equalBytes } from '@noble/curves/utils.js';
import { encodeAnnouncement } from './announcement.js';
import { fail } from './errors.js';
import { reduceDigestNonZero, taggedSha256, taggedSha512, TAG_SHARED, TAG_VIEW_TAG } from './hash.js';
import { decodeMetaAddress, type SolanaMetaKeys } from './keys.js';
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

/** @internal ADR-0017 view tag: `SHA-256(dst("view-tag") || R || Z)[0]`. */
export function viewTagOf(R: Uint8Array, Z: EdPoint): number {
  return taggedSha256(TAG_VIEW_TAG, R, Z.toBytes())[0] as number;
}

/** @internal ADR-0017 tweak: `h = SHA-512(dst("shared") || R || Z || S) mod L`, rejected if zero. */
export function tweakOf(R: Uint8Array, Z: EdPoint, S: Uint8Array): bigint {
  return reduceDigestNonZero(taggedSha512(TAG_SHARED, R, Z.toBytes(), S));
}

/**
 * @internal ADR-0017 ECDH point Z = k*Q, with no cofactor multiplication.
 *
 * @remarks Every Q reaching this function has been validated as a canonical, torsion-free, non-identity point
 * (`decodePrimeOrderPoint`), so a hostile R cannot carry a torsion component and k*Q stays in the prime-order
 * subgroup. This matches `@ghostpay/solana-stealth` byte for byte (an earlier version used [8]*(k*Q), which
 * derived different addresses for the same keys).
 *
 * @throws {SolanaStealthError} `IDENTITY_POINT` (unreachable for a validated Q and k in [1, L-1]).
 */
export function sharedSecretPoint(Q: EdPoint, k: bigint): EdPoint {
  const Z = Q.multiply(k);
  if (Z.is0()) fail('IDENTITY_POINT');
  return Z;
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
  meta: SolanaMetaKeys,
  ephemeral: SecretScalar,
): DerivedSolanaStealthPayment {
  const S = decodePrimeOrderPoint(meta.spendPublicKey);
  const V = decodePrimeOrderPoint(meta.viewPublicKey);
  if (S.equals(V)) fail('KEY_REUSE');
  const r = scalarValue(ephemeral);
  const R = brandPoint(Point.BASE.multiply(r));
  const Z = sharedSecretPoint(V, r);
  const h = tweakOf(R, Z, meta.spendPublicKey);
  const P = brandPoint(addTweak(S, h));
  const viewTag = viewTagOf(R, Z);
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
 * @remarks ADR-0017 section 3, identical to `@ghostpay/solana-stealth`: r is sampled uniformly in [1, L-1];
 * R = r*B; Z = r*V; h = SHA-512(dst("shared") || R || Z || S) mod L; P = S + h*B;
 * view_tag = SHA-256(dst("view-tag") || R || Z)[0]. All recipient points must be canonical and of prime order
 * (see `decodePrimeOrderPoint`). A text meta-address for devnet, testnet or localnet is accepted (the cluster is not part
 * of the derivation); a mainnet one (text, or a decoded `SolanaMetaAddress` object) is refused with `CHAIN_DISABLED`. Callers bound to one cluster use
 * `decodeMetaAddress(text, cluster)` first, as the adapter does.
 *
 * @param meta `st:sol:` meta-address or decoded keys.
 * @param rng Optional random source (tests only).
 * @returns Address, announcement and its parts.
 * @throws {SolanaStealthError} `INVALID_META_ADDRESS`, `LEGACY_META_ADDRESS`, `INVALID_POINT`, `KEY_REUSE`,
 * `CHAIN_DISABLED` (a text meta-address, or a decoded `SolanaMetaAddress`, for mainnet), `RNG_*`.
 * @security r is discarded after use; reuse of r for two payments links them.
 */
export function deriveStealthPayment(
  meta: string | SolanaMetaKeys,
  rng?: RandomSource,
): DerivedSolanaStealthPayment {
  const keys = typeof meta === 'string' ? decodeMetaAddress(meta) : meta;
  // Testnet-only proof of concept: a meta-address bound to mainnet (text, or a decoded SolanaMetaAddress carrying
  // its cluster) is never derived for. Checked before any randomness is drawn.
  if ((keys as { readonly cluster?: unknown }).cluster === 'mainnet') return fail('CHAIN_DISABLED');
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
 * @remarks Recomputes Z = v*R, compares the view tag first (cheap rejection
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
  const Z = sharedSecretPoint(R, v);
  if (viewTagOf(ann.ephemeralPublicKey, Z) !== ann.viewTag) return null;
  const h = tweakOf(ann.ephemeralPublicKey, Z, spendPublicKey);
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
