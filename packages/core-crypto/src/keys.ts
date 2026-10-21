import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { randomScalar, type RandomSource } from './rng.js';
import { parseCompressedPoint, zeroize, type CompressedPoint, type SecretScalar } from './secret.js';

/** Recipient key material for ERC-5564 scheme 1. */
export interface StealthKeySet {
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
  /** Redacting secret; throws if serialized or logged. */
  readonly spendingSecret: SecretScalar;
  /** Redacting secret; throws if serialized or logged. */
  readonly viewingSecret: SecretScalar;
}

/** Public half of a scheme-1 meta-address. */
export interface MetaAddressKeys {
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}

const META_PREFIX = 'st:eth:0x';
const META_RE = /^st:eth:0x([0-9a-fA-F]{132})$/;

/** @internal Public key for a validated secret. */
export function publicKeyOf(secret: Uint8Array): CompressedPoint {
  return parseCompressedPoint(secp256k1.getPublicKey(secret, true));
}

/**
 * Generates independent random spending and viewing keys.
 *
 * @remarks secp256k1; each scalar is sampled separately by rejection sampling
 * in [1, n-1] using Web Crypto (or the injected test RNG). Public keys are
 * 33-byte compressed SEC1 points.
 *
 * @param rng Production callers omit this (global `crypto.getRandomValues`).
 * @returns Key set with redacting secret wrappers.
 * @throws {GhostPayCryptoError} `KEY_REUSE` if the source returns the same scalar twice, or RNG errors.
 * @security Persist secrets only in encrypted form; never log or send to an RPC.
 * @see https://eips.ethereum.org/EIPS/eip-5564
 * @testVector scheme1-001
 */
export function generateKeySet(rng?: RandomSource): StealthKeySet {
  const spendingSecret = randomScalar(rng);
  const viewingSecret = randomScalar(rng);
  if (spendingSecret.every((b, i) => b === viewingSecret[i])) {
    zeroize(spendingSecret, viewingSecret);
    return fail('KEY_REUSE');
  }
  return {
    spendingPublicKey: publicKeyOf(spendingSecret),
    viewingPublicKey: publicKeyOf(viewingSecret),
    spendingSecret,
    viewingSecret,
  };
}

/**
 * Encodes a scheme-1 meta-address as `st:eth:0x<spendPub33><viewPub33>`.
 *
 * @remarks Lowercase hex, spending key first (ERC-5564 order). Both keys are
 * re-validated as on-curve compressed points.
 *
 * @param keys Public keys only.
 * @returns 140-character meta-address URI.
 * @throws {GhostPayCryptoError} `INVALID_POINT`, `KEY_REUSE`.
 * @security Public data; contains no secrets.
 * @see https://eips.ethereum.org/EIPS/eip-5564
 * @testVector scheme1-001
 */
export function encodeMetaAddress(keys: MetaAddressKeys): string {
  const spend = parseCompressedPoint(keys.spendingPublicKey);
  const view = parseCompressedPoint(keys.viewingPublicKey);
  if (bytesToHex(spend) === bytesToHex(view)) fail('KEY_REUSE');
  return META_PREFIX + bytesToHex(spend) + bytesToHex(view);
}

/**
 * Strictly decodes `st:eth:0x<spendPub33><viewPub33>`.
 *
 * @remarks Exactly 132 hex digits are required (single-key 66-digit form is
 * rejected, as are uncompressed keys, wrong prefixes, off-curve x values and
 * identical spending/viewing keys). Hex case is accepted; output is canonical.
 *
 * @param metaAddress Candidate URI.
 * @returns Validated public keys.
 * @throws {GhostPayCryptoError} `INVALID_META_ADDRESS`, `INVALID_POINT`, `KEY_REUSE`.
 * @security Public data. Error messages never echo the input.
 * @testVector scheme1-001
 */
export function decodeMetaAddress(metaAddress: string): MetaAddressKeys {
  const m = META_RE.exec(metaAddress);
  const body = m?.[1];
  if (body === undefined) return fail('INVALID_META_ADDRESS');
  const bytes = hexToBytes(body);
  const spendingPublicKey = parseCompressedPoint(bytes.subarray(0, 33));
  const viewingPublicKey = parseCompressedPoint(bytes.subarray(33, 66));
  if (bytesToHex(spendingPublicKey) === bytesToHex(viewingPublicKey)) fail('KEY_REUSE');
  return { spendingPublicKey, viewingPublicKey };
}
