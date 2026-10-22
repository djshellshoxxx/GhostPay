import { sha256 } from '@noble/hashes/sha2.js';
import { equalBytes } from '@noble/curves/utils.js';
import { createBase58check } from '@scure/base';
import { fail } from './errors.js';
import { brandPoint, decodePrimeOrderPoint, Point, type PrimeOrderPoint } from './point.js';
import { randomScalar, type RandomSource } from './rng.js';
import { scalarValue, type SecretScalar } from './secret.js';

/** Text prefix of a Solana stealth meta-address. */
export const META_ADDRESS_PREFIX = 'gpsol:';
/** Version byte inside the base58check payload. */
export const META_ADDRESS_VERSION = 0x01;

const b58check = createBase58check(sha256);

/** Public half of a Solana stealth identity: spend key S = s*B and view key V = v*B. */
export interface SolanaMetaAddress {
  readonly spendPublicKey: PrimeOrderPoint;
  readonly viewPublicKey: PrimeOrderPoint;
}

/** Full key set. `spendSecret` must stay offline; `viewSecret` only enables detection. */
export interface SolanaStealthKeys extends SolanaMetaAddress {
  readonly spendSecret: SecretScalar;
  readonly viewSecret: SecretScalar;
}

/**
 * Computes the public key s*B of a raw scalar.
 *
 * @param secret Scalar in [1, L-1].
 * @returns Canonical 32-byte encoding (prime order, never the identity).
 * @throws {SolanaStealthError} `INVALID_SCALAR`.
 */
export function publicKeyOf(secret: SecretScalar): PrimeOrderPoint {
  return brandPoint(Point.BASE.multiply(scalarValue(secret)));
}

/**
 * Builds a key set from two existing raw scalars.
 *
 * @param spendSecret s in [1, L-1].
 * @param viewSecret v in [1, L-1], v != s.
 * @returns Key set with S = s*B, V = v*B.
 * @throws {SolanaStealthError} `INVALID_SCALAR` or `KEY_REUSE`.
 * @security Inputs are copied by reference; do not mutate them afterwards.
 */
export function stealthKeysFromSecrets(
  spendSecret: SecretScalar,
  viewSecret: SecretScalar,
): SolanaStealthKeys {
  const s = scalarValue(spendSecret);
  const v = scalarValue(viewSecret);
  if (s === v) fail('KEY_REUSE');
  return {
    spendSecret,
    viewSecret,
    spendPublicKey: brandPoint(Point.BASE.multiply(s)),
    viewPublicKey: brandPoint(Point.BASE.multiply(v)),
  };
}

/**
 * Generates a fresh, independent spend/view key pair.
 *
 * @param rng Optional random source (tests only).
 * @returns Key set.
 * @throws {SolanaStealthError} `RNG_UNAVAILABLE` / `RNG_FAILURE`.
 */
export function generateStealthKeys(rng?: RandomSource): SolanaStealthKeys {
  const s = randomScalar(rng);
  const v = randomScalar(rng);
  // Two equal uniform draws (p ~ 2^-252) can only mean a broken source.
  if (equalBytes(s, v)) fail('RNG_FAILURE');
  return stealthKeysFromSecrets(s, v);
}

/**
 * Encodes a meta-address: `gpsol:` + base58check(0x01 || S(32) || V(32)).
 *
 * @remarks base58check = base58 of payload || first 4 bytes of SHA-256(SHA-256(payload)).
 *
 * @param meta Spend and view public keys (validated again here).
 * @returns Canonical text form.
 * @throws {SolanaStealthError} `INVALID_POINT` or `KEY_REUSE`.
 */
export function encodeMetaAddress(meta: SolanaMetaAddress): string {
  decodePrimeOrderPoint(meta.spendPublicKey);
  decodePrimeOrderPoint(meta.viewPublicKey);
  if (equalBytes(meta.spendPublicKey, meta.viewPublicKey)) fail('KEY_REUSE');
  const payload = new Uint8Array(65);
  payload[0] = META_ADDRESS_VERSION;
  payload.set(meta.spendPublicKey, 1);
  payload.set(meta.viewPublicKey, 33);
  return META_ADDRESS_PREFIX + b58check.encode(payload);
}

/**
 * Strictly decodes a meta-address produced by {@link encodeMetaAddress}.
 *
 * @remarks Rejects: other prefixes (case-sensitive), bad base58 or checksum,
 * payload length != 65, unknown version, any non-canonical / torsion / identity
 * point, S == V, and any string that does not re-encode identically.
 *
 * @param input Text meta-address.
 * @returns Validated keys.
 * @throws {SolanaStealthError} `INVALID_META_ADDRESS`.
 */
export function decodeMetaAddress(input: string): SolanaMetaAddress {
  if (typeof input !== 'string' || !input.startsWith(META_ADDRESS_PREFIX) || input.length > 128) {
    return fail('INVALID_META_ADDRESS');
  }
  try {
    const payload = b58check.decode(input.slice(META_ADDRESS_PREFIX.length));
    if (payload.length !== 65 || payload[0] !== META_ADDRESS_VERSION) return fail('INVALID_META_ADDRESS');
    const S = decodePrimeOrderPoint(payload.subarray(1, 33));
    const V = decodePrimeOrderPoint(payload.subarray(33, 65));
    const meta: SolanaMetaAddress = { spendPublicKey: brandPoint(S), viewPublicKey: brandPoint(V) };
    if (encodeMetaAddress(meta) !== input) return fail('INVALID_META_ADDRESS');
    return meta;
  } catch {
    return fail('INVALID_META_ADDRESS');
  }
}
