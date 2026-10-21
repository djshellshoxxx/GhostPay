import { encodeMetaAddress, parseCompressedPoint, type CompressedPoint } from '@ghostpay/core-crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { ZERO_HASH, bytes32, type Hex } from './types.js';

/** Public content of a scheme-2 meta-address. */
export interface Scheme2MetaAddress {
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
  /** {@link computePolicyHash} of the recipient's policy. */
  readonly policyHash: Hex;
}

/** Prefix of a scheme-2 meta-address (GhostPay-specific, see DEVIATIONS.md S1). */
export const SCHEME2_META_PREFIX = 'st:eth:gp2:0x';
const META_RE = /^st:eth:gp2:0x([0-9a-fA-F]{196})$/;

/** @internal Validates keys and the policy hash. */
function check(spend: Uint8Array, view: Uint8Array, policyHash: unknown): Scheme2MetaAddress {
  const spendingPublicKey = parseCompressedPoint(spend);
  const viewingPublicKey = parseCompressedPoint(view);
  if (bytesToHex(spendingPublicKey) === bytesToHex(viewingPublicKey)) fail('INVALID_META_ADDRESS', 'key reuse');
  const ph = bytes32(policyHash, 'policyHash');
  if (ph === ZERO_HASH) fail('INVALID_META_ADDRESS', 'policyHash');
  return Object.freeze({ spendingPublicKey, viewingPublicKey, policyHash: ph });
}

/**
 * Encodes a scheme-2 meta-address `st:eth:gp2:0x<spendPub33><viewPub33><policyHash32>`.
 *
 * @remarks Lowercase hex, 196 digits after the prefix. Keys are re-validated as distinct on-curve
 * compressed points; a zero policy hash is refused. The prefix differs from the scheme-1
 * `st:eth:0x` form so a scheme-1 wallet can never parse it as a plain stealth meta-address.
 *
 * @param meta Public keys and policy hash.
 * @returns Meta-address string.
 * @throws {GhostPayCryptoError} `INVALID_POINT`. {@link PolicySchemeError} `INVALID_META_ADDRESS`, `INVALID_HEX`.
 * @security Public data. The policy hash does not reveal the destination to someone who cannot guess it,
 * but it links every payment address derived from this meta-address to the same policy once deployed.
 * @testVector policy-scheme.accounts
 */
export function encodeScheme2MetaAddress(meta: Scheme2MetaAddress): string {
  const v = check(meta.spendingPublicKey, meta.viewingPublicKey, meta.policyHash);
  return SCHEME2_META_PREFIX + bytesToHex(v.spendingPublicKey) + bytesToHex(v.viewingPublicKey) + v.policyHash.slice(2);
}

/**
 * Strictly decodes a scheme-2 meta-address.
 *
 * @remarks Exactly 196 hex digits after `st:eth:gp2:0x`; any case accepted, output canonical.
 *
 * @param metaAddress Candidate string.
 * @returns Validated keys and policy hash (frozen).
 * @throws {PolicySchemeError} `INVALID_META_ADDRESS`. {@link GhostPayCryptoError} `INVALID_POINT`.
 * @security Public data; errors never echo the input.
 * @testVector policy-scheme.accounts
 */
export function decodeScheme2MetaAddress(metaAddress: string): Scheme2MetaAddress {
  const m = typeof metaAddress === 'string' ? META_RE.exec(metaAddress) : null;
  const body = m?.[1];
  if (body === undefined) return fail('INVALID_META_ADDRESS');
  const bytes = hexToBytes(body);
  return check(bytes.subarray(0, 33), bytes.subarray(33, 66), `0x${bytesToHex(bytes.subarray(66, 98))}`);
}

/**
 * The scheme-1 meta-address whose maths yields the owner EOA (`st:eth:0x<spend><view>`).
 *
 * @param meta Scheme-2 content.
 * @returns Scheme-1 meta-address of the same keys.
 * @throws {GhostPayCryptoError} `INVALID_POINT`, `KEY_REUSE`.
 * @security Public data. Do not publish it: payments to it are plain scheme-1 payments without policy.
 */
export function ownerMetaAddress(meta: Scheme2MetaAddress): string {
  return encodeMetaAddress({ spendingPublicKey: meta.spendingPublicKey, viewingPublicKey: meta.viewingPublicKey });
}
