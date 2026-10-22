import { base58 } from '@scure/base';
import { equalBytes } from '@noble/curves/utils.js';
import { fail } from './errors.js';
import {
  G,
  decodePoint,
  encodePoint,
  hash256,
  hashToScalar,
  randomScalar,
  type PublicPoint,
  type RandomSource,
} from './ed25519.js';
import { L, scalarValue, wrapScalar, type SecretScalar } from './secret.js';

/** Sender-side result: everything that goes on chain, nothing secret. */
export interface StealthPayment {
  /** One-time ed25519 public key `P = S + h*G`; as base58 it is a normal Solana address. */
  readonly stealthPublicKey: PublicPoint;
  /** Base58 Solana address of `P`. */
  readonly stealthAddress: string;
  /** Ephemeral public key `R = r*G`, published in the announcement. */
  readonly ephemeralPublicKey: PublicPoint;
  /** First byte of SHA-256(dst('view-tag') || R || Z); lets scanners skip ~255/256 of announcements. */
  readonly viewTag: number;
}

/** Recipient-side match. */
export interface StealthMatch {
  readonly stealthPublicKey: PublicPoint;
  readonly stealthAddress: string;
  /** Tweak `h`; spend key is `s + h mod L` (see {@link deriveSpendKey}). Secret: links payment. */
  readonly tweak: SecretScalar;
}

interface Core {
  P: PublicPoint;
  viewTag: number;
  h: bigint;
}

/** Shared derivation: Z is the DH point, R/S are bound into the hash. */
function core(Rbytes: Uint8Array, Zbytes: Uint8Array, Sbytes: Uint8Array): Core {
  const h = hashToScalar('shared', Rbytes, Zbytes, Sbytes);
  if (h === 0n) return fail('DERIVED_KEY_INVALID');
  const viewTag = hash256('view-tag', Rbytes, Zbytes)[0] as number;
  const P = decodePoint(Sbytes).add(G.multiply(h));
  if (P.is0()) return fail('DERIVED_KEY_INVALID');
  return { P: encodePoint(P), viewTag, h };
}

/**
 * Sender: derives a one-time stealth address for recipient `(S, V)` with a given ephemeral scalar.
 *
 * @remarks Exposed for deterministic test vectors; production code uses
 * {@link deriveStealthPayment}, which samples `r` from the CSPRNG. Never reuse `r`.
 * `Z = r*V`, `h = SHA-512(dst('shared') || R || Z || S) mod L`, `P = S + h*G`.
 * @param spendPublicKey `S` (validated).
 * @param viewPublicKey `V` (validated).
 * @param ephemeralSecret `r`.
 * @returns On-chain data.
 * @throws {SolanaStealthError} `INVALID_POINT`, `DERIVED_KEY_INVALID`.
 */
export function deriveStealthPaymentWithEphemeral(
  spendPublicKey: Uint8Array,
  viewPublicKey: Uint8Array,
  ephemeralSecret: SecretScalar,
): StealthPayment {
  decodePoint(spendPublicKey);
  const V = decodePoint(viewPublicKey);
  const r = scalarValue(ephemeralSecret);
  const R = G.multiply(r).toBytes();
  const Z = V.multiply(r).toBytes();
  const { P, viewTag } = core(R, Z, spendPublicKey);
  return {
    stealthPublicKey: P,
    stealthAddress: base58.encode(P),
    ephemeralPublicKey: R as PublicPoint,
    viewTag,
  };
}

/**
 * Sender: derives a fresh one-time stealth address.
 *
 * @param spendPublicKey `S`.
 * @param viewPublicKey `V`.
 * @param rng Optional random source (tests only).
 * @returns On-chain data.
 */
export function deriveStealthPayment(
  spendPublicKey: Uint8Array,
  viewPublicKey: Uint8Array,
  rng?: RandomSource,
): StealthPayment {
  return deriveStealthPaymentWithEphemeral(spendPublicKey, viewPublicKey, randomScalar(rng));
}

/**
 * Recipient: tests one announcement against the view key.
 *
 * @remarks Rejects invalid `R` (small-order / mixed-order / non-canonical) before any secret
 * math, so a malicious announcer cannot probe the view key with torsion points.
 * @param viewSecret `v`.
 * @param spendPublicKey `S`.
 * @param ephemeralPublicKey `R` from the announcement.
 * @param viewTag Announced view tag, or `undefined` to skip the fast filter.
 * @param expectedStealthPublicKey Optional `P` seen on chain; a different derived `P` returns `null`.
 * @returns Match, or `null`.
 * @throws {SolanaStealthError} `INVALID_POINT` for a malformed `R` or `S`.
 */
export function checkAnnouncement(
  viewSecret: SecretScalar,
  spendPublicKey: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  viewTag: number | undefined,
  expectedStealthPublicKey?: Uint8Array,
): StealthMatch | null {
  decodePoint(spendPublicKey);
  const R = decodePoint(ephemeralPublicKey);
  const Z = R.multiply(scalarValue(viewSecret)).toBytes();
  if (viewTag !== undefined && hash256('view-tag', ephemeralPublicKey, Z)[0] !== viewTag) {
    return null;
  }
  const { P, h } = core(ephemeralPublicKey, Z, spendPublicKey);
  if (expectedStealthPublicKey !== undefined && !equalBytes(P, expectedStealthPublicKey)) return null;
  return { stealthPublicKey: P, stealthAddress: base58.encode(P), tweak: wrapScalar(h) };
}

/**
 * Recipient: one-time spend scalar `p = s + h mod L`.
 *
 * @param spendSecret `s`.
 * @param tweak `h` from {@link checkAnnouncement}.
 * @param expectedStealthPublicKey Optional `P`; when given, `p*G == P` is enforced.
 * @returns Spend scalar (sign with {@link signWithScalar}, never with a seed-based API).
 * @throws {SolanaStealthError} `DERIVED_KEY_INVALID`.
 */
export function deriveSpendKey(
  spendSecret: SecretScalar,
  tweak: SecretScalar,
  expectedStealthPublicKey?: Uint8Array,
): SecretScalar {
  const p = (scalarValue(spendSecret) + scalarValue(tweak)) % L;
  if (p === 0n) return fail('DERIVED_KEY_INVALID');
  if (
    expectedStealthPublicKey !== undefined &&
    !equalBytes(G.multiply(p).toBytes(), expectedStealthPublicKey)
  ) {
    return fail('DERIVED_KEY_INVALID');
  }
  return wrapScalar(p);
}
