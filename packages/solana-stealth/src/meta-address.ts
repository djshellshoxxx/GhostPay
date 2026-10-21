import { base58 } from '@scure/base';
import { concatBytes, equalBytes } from '@noble/curves/utils.js';
import { fail } from './errors.js';
import { hash256, parsePublicPoint, type PublicPoint } from './ed25519.js';

/** Solana clusters this package knows. */
export type SolanaCluster = 'mainnet' | 'devnet' | 'testnet' | 'localnet';

/** Human-readable prefix of every meta-address string. */
export const META_ADDRESS_PREFIX = 'st:sol:';
/** Current meta-address version byte. */
export const META_ADDRESS_VERSION = 0x01;

const CLUSTER_BYTE: Readonly<Record<SolanaCluster, number>> = {
  mainnet: 0x00,
  devnet: 0x01,
  testnet: 0x02,
  localnet: 0x03,
};
const PAYLOAD_LEN = 1 + 1 + 32 + 32;
const TOTAL_LEN = PAYLOAD_LEN + 4;
const MAX_STRING_LEN = 128;

/** Decoded meta-address. */
export interface SolanaMetaAddress {
  readonly cluster: SolanaCluster;
  readonly spendPublicKey: PublicPoint;
  readonly viewPublicKey: PublicPoint;
}

function checksum(payload: Uint8Array): Uint8Array {
  return hash256('checksum', payload).subarray(0, 4);
}

/**
 * Encodes `st:sol:` + base58(version || cluster || S || V || checksum4).
 *
 * @remarks checksum4 = first 4 bytes of SHA-256(dst('checksum') || version || cluster || S || V).
 * Both keys are re-validated so an invalid key can never be published.
 * @param cluster Target cluster (bound into the checksum, so cross-cluster use is detected).
 * @param spendPublicKey `S`.
 * @param viewPublicKey `V`.
 * @returns Canonical string.
 * @throws {SolanaStealthError} `INVALID_POINT`.
 */
export function encodeMetaAddress(
  cluster: SolanaCluster,
  spendPublicKey: Uint8Array,
  viewPublicKey: Uint8Array,
): string {
  const S = parsePublicPoint(spendPublicKey);
  const V = parsePublicPoint(viewPublicKey);
  const payload = concatBytes(Uint8Array.of(META_ADDRESS_VERSION, CLUSTER_BYTE[cluster]), S, V);
  return META_ADDRESS_PREFIX + base58.encode(concatBytes(payload, checksum(payload)));
}

/**
 * Strictly decodes a meta-address.
 *
 * @param input String form.
 * @param expectedCluster If set, any other cluster fails with `NETWORK_MISMATCH`.
 * @returns Decoded keys.
 * @throws {SolanaStealthError} `INVALID_META_ADDRESS`, `BAD_CHECKSUM`, `UNSUPPORTED_VERSION`,
 * `NETWORK_MISMATCH`, `INVALID_POINT`.
 */
export function decodeMetaAddress(input: string, expectedCluster?: SolanaCluster): SolanaMetaAddress {
  if (typeof input !== 'string' || input.length > MAX_STRING_LEN) return fail('INVALID_META_ADDRESS');
  if (!input.startsWith(META_ADDRESS_PREFIX)) return fail('INVALID_META_ADDRESS');
  let raw: Uint8Array;
  try {
    raw = base58.decode(input.slice(META_ADDRESS_PREFIX.length));
  } catch {
    return fail('INVALID_META_ADDRESS');
  }
  if (raw.length !== TOTAL_LEN) return fail('INVALID_META_ADDRESS');
  const payload = raw.subarray(0, PAYLOAD_LEN);
  if (!equalBytes(checksum(payload), raw.subarray(PAYLOAD_LEN))) return fail('BAD_CHECKSUM');
  if (payload[0] !== META_ADDRESS_VERSION) return fail('UNSUPPORTED_VERSION');
  const cluster = (Object.keys(CLUSTER_BYTE) as SolanaCluster[]).find(
    (c) => CLUSTER_BYTE[c] === payload[1],
  );
  if (cluster === undefined) return fail('INVALID_META_ADDRESS');
  if (expectedCluster !== undefined && cluster !== expectedCluster) return fail('NETWORK_MISMATCH');
  return {
    cluster,
    spendPublicKey: parsePublicPoint(payload.subarray(2, 34)),
    viewPublicKey: parsePublicPoint(payload.subarray(34, 66)),
  };
}
