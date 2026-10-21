import { bech32m } from '@scure/base';
import { bech32mDecode, bech32mEncode, SP_MAX_LENGTH } from './bech32m.js';
import { fail } from './errors.js';
import type { ChainParams } from './params.js';
import { parseCompressedPoint, type CompressedPoint } from './secret.js';

/** A decoded silent payment address (`B_scan`, `B_m`). */
export interface SilentPaymentAddress {
  /** `id` of the chain whose HRP the address carried. */
  readonly chainId: string;
  /** Version character value as decoded (0 for `q`). Encoding always produces 0. */
  readonly version: number;
  /** `B_scan`. */
  readonly scanPublicKey: CompressedPoint;
  /** `B_m` = `B_spend` or `B_spend + label * G`. */
  readonly spendPublicKey: CompressedPoint;
}

/** Payload length of version 0: two 33-byte compressed keys. */
const PAYLOAD_BYTES = 66;
const MAX_VERSION = 30;

/**
 * Encodes a version-0 silent payment address with the chain's HRP:
 * `bech32m(hrp, [0] || convertbits(ser_P(B_scan) || ser_P(B_m)))`.
 *
 * @remarks Encoding is allowed for experimental chains (round trips, research); funds-handling
 * entry points apply {@link assertFundsAllowed} separately.
 *
 * @param params Chain parameters (`spHrp`).
 * @param scanPublicKey `B_scan`, validated as a compressed point.
 * @param spendPublicKey `B_m`, validated as a compressed point.
 * @returns Lowercase address string.
 * @throws {BtcFamilyError} `INVALID_POINT`, `INVALID_ADDRESS`.
 * @security Public data only.
 */
export function encodeAddress(
  params: ChainParams,
  scanPublicKey: Uint8Array,
  spendPublicKey: Uint8Array,
): string {
  const scan = parseCompressedPoint(scanPublicKey);
  const spend = parseCompressedPoint(spendPublicKey);
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload.set(scan, 0);
  payload.set(spend, 33);
  return bech32mEncode(params.spHrp, [0, ...bech32m.toWords(payload)], SP_MAX_LENGTH);
}

/**
 * Strictly decodes a silent payment address for ONE chain.
 *
 * @remarks Rules (BIP-352 "Versions" and "Address encoding"): lowercase only; Bech32m checksum;
 * length at most 1023; the HRP must equal `params.spHrp`. A well-formed address with another HRP
 * is rejected with `NETWORK_MISMATCH` (never reinterpreted), so an address of chain A can not be
 * paid on chain B. Version 0 requires exactly 66 data bytes; versions 1 to 30 are read as the
 * first 66 bytes (forward compatibility); version 31 is rejected. Both keys must be valid points.
 *
 * @param params Chain parameters.
 * @param address Candidate string.
 * @returns The decoded keys.
 * @throws {BtcFamilyError} `INVALID_ADDRESS`, `NETWORK_MISMATCH`, `UNSUPPORTED_VERSION`, `INVALID_POINT`.
 * @security Public data only.
 */
export function decodeAddress(params: ChainParams, address: string): SilentPaymentAddress {
  if (typeof address !== 'string' || address !== address.toLowerCase()) return fail('INVALID_ADDRESS');
  const { hrp, words } = bech32mDecode(address, SP_MAX_LENGTH);
  if (hrp !== params.spHrp) return fail('NETWORK_MISMATCH');
  const version = words[0];
  if (version === undefined) return fail('INVALID_ADDRESS');
  if (version > MAX_VERSION) return fail('UNSUPPORTED_VERSION');
  let data: Uint8Array;
  try {
    data = bech32m.fromWords(words.slice(1));
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (version === 0 ? data.length !== PAYLOAD_BYTES : data.length < PAYLOAD_BYTES) {
    return fail('INVALID_ADDRESS');
  }
  return {
    chainId: params.id,
    version,
    scanPublicKey: parseCompressedPoint(data.subarray(0, 33)),
    spendPublicKey: parseCompressedPoint(data.subarray(33, PAYLOAD_BYTES)),
  };
}
