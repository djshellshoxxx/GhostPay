import { concatBytes, equalBytes } from '@noble/curves/utils.js';
import { base58 } from '@scure/base';
import { fail } from './errors.js';
import { taggedSha256, TAG_CHECKSUM } from './hash.js';
import { brandPoint, decodePrimeOrderPoint, Point, type PrimeOrderPoint } from './point.js';
import { randomScalar, type RandomSource } from './rng.js';
import { scalarValue, type SecretScalar } from './secret.js';

/** Text prefix of a Solana stealth meta-address (ADR-0017 section 3, shared with `@ghostpay/solana-stealth`). */
export const META_ADDRESS_PREFIX = 'st:sol:';
/** Prefix of the retired, pre-ADR-0017 chain-solana form. Rejected with `LEGACY_META_ADDRESS`. */
export const LEGACY_META_ADDRESS_PREFIX = 'gpsol:';
/** Version byte inside the payload. */
export const META_ADDRESS_VERSION = 0x01;

/** Solana clusters a meta-address can be bound to (ADR-0017 cluster byte). */
export type SolanaCluster = 'mainnet' | 'devnet' | 'testnet' | 'localnet';
/** Cluster bytes, in ADR-0017 order. */
export const SOLANA_CLUSTER_BYTES: Readonly<Record<SolanaCluster, number>> = Object.freeze({
  mainnet: 0x00,
  devnet: 0x01,
  testnet: 0x02,
  localnet: 0x03,
});
const CLUSTERS = Object.keys(SOLANA_CLUSTER_BYTES) as readonly SolanaCluster[];
/** version(1) || cluster(1) || S(32) || V(32). */
const PAYLOAD_LENGTH = 66;
const MAX_TEXT_LENGTH = 128;

/** Public keys of a Solana stealth identity: spend key S = s*B and view key V = v*B. */
export interface SolanaMetaKeys {
  readonly spendPublicKey: PrimeOrderPoint;
  readonly viewPublicKey: PrimeOrderPoint;
}

/** A meta-address: the public keys plus the cluster the checksum binds them to. */
export interface SolanaMetaAddress extends SolanaMetaKeys {
  readonly cluster: SolanaCluster;
}

/**
 * Full key set (cluster-independent). `spendSecret` must stay offline; `viewSecret` only enables detection.
 * Pass `{ ...keys, cluster }` to {@link encodeMetaAddress}.
 */
export interface SolanaStealthKeys extends SolanaMetaKeys {
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

function checksum(payload: Uint8Array): Uint8Array {
  return taggedSha256(TAG_CHECKSUM, payload).subarray(0, 4);
}

/**
 * Encodes a meta-address exactly as `@ghostpay/solana-stealth` does (ADR-0017 section 3):
 * `st:sol:` + base58(version 0x01 || cluster || S(32) || V(32) || checksum4).
 *
 * @remarks checksum4 = first 4 bytes of SHA-256(u8(len(tag)) || tag || payload), tag
 * `GhostPay/solana-stealth/v1/checksum`; the checksum covers the cluster byte, so cross-cluster use is detected.
 *
 * @param meta Spend and view public keys (validated again here) and the cluster.
 * @returns Canonical text form.
 * @throws {SolanaStealthError} `INVALID_META_ADDRESS` (unknown cluster), `INVALID_POINT` or `KEY_REUSE`.
 */
export function encodeMetaAddress(meta: SolanaMetaAddress): string {
  if (typeof meta.cluster !== 'string' || !Object.hasOwn(SOLANA_CLUSTER_BYTES, meta.cluster)) {
    return fail('INVALID_META_ADDRESS');
  }
  decodePrimeOrderPoint(meta.spendPublicKey);
  decodePrimeOrderPoint(meta.viewPublicKey);
  if (equalBytes(meta.spendPublicKey, meta.viewPublicKey)) fail('KEY_REUSE');
  const payload = concatBytes(
    Uint8Array.of(META_ADDRESS_VERSION, SOLANA_CLUSTER_BYTES[meta.cluster]),
    meta.spendPublicKey,
    meta.viewPublicKey,
  );
  return META_ADDRESS_PREFIX + base58.encode(concatBytes(payload, checksum(payload)));
}

/**
 * Strictly decodes an ADR-0017 `st:sol:` meta-address (the format the web app shows its users).
 *
 * @remarks Rejects: the retired `gpsol:` form (`LEGACY_META_ADDRESS`, so a holder of an old string gets a clear
 * reason instead of a generic failure); other prefixes (case-sensitive) and surrounding whitespace; bad base58;
 * decoded length != 70; bad checksum; unknown version or cluster byte; any non-canonical, torsion or identity point;
 * S == V (`KEY_REUSE`, stricter than `@ghostpay/solana-stealth`, which accepts it); and, when `expectedCluster` is
 * given, any other cluster (`NETWORK_MISMATCH`).
 *
 * @param input Text meta-address.
 * @param expectedCluster Optional cluster the caller operates on.
 * @returns Validated keys and their cluster.
 * @throws {SolanaStealthError} `INVALID_META_ADDRESS`, `LEGACY_META_ADDRESS`, `KEY_REUSE`, `NETWORK_MISMATCH`.
 */
export function decodeMetaAddress(input: string, expectedCluster?: SolanaCluster): SolanaMetaAddress {
  if (typeof input !== 'string' || input.length > MAX_TEXT_LENGTH) return fail('INVALID_META_ADDRESS');
  if (input.startsWith(LEGACY_META_ADDRESS_PREFIX)) return fail('LEGACY_META_ADDRESS');
  if (!input.startsWith(META_ADDRESS_PREFIX)) return fail('INVALID_META_ADDRESS');
  let raw: Uint8Array;
  try {
    raw = base58.decode(input.slice(META_ADDRESS_PREFIX.length));
  } catch {
    return fail('INVALID_META_ADDRESS');
  }
  if (raw.length !== PAYLOAD_LENGTH + 4) return fail('INVALID_META_ADDRESS');
  const payload = raw.subarray(0, PAYLOAD_LENGTH);
  if (!equalBytes(checksum(payload), raw.subarray(PAYLOAD_LENGTH))) return fail('INVALID_META_ADDRESS');
  if (payload[0] !== META_ADDRESS_VERSION) return fail('INVALID_META_ADDRESS');
  const cluster = CLUSTERS.find((c) => SOLANA_CLUSTER_BYTES[c] === payload[1]);
  if (cluster === undefined) return fail('INVALID_META_ADDRESS');
  let S: PrimeOrderPoint;
  let V: PrimeOrderPoint;
  try {
    S = brandPoint(decodePrimeOrderPoint(payload.subarray(2, 34)));
    V = brandPoint(decodePrimeOrderPoint(payload.subarray(34, 66)));
  } catch {
    return fail('INVALID_META_ADDRESS');
  }
  if (equalBytes(S, V)) return fail('KEY_REUSE');
  if (expectedCluster !== undefined && cluster !== expectedCluster) return fail('NETWORK_MISMATCH');
  return { cluster, spendPublicKey: S, viewPublicKey: V };
}
