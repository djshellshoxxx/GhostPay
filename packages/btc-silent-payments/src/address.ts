import { bech32m } from '@scure/base';
import { bech32mDecode, bech32mEncode, SP_MAX_LENGTH } from './bech32m.js';
import { fail } from './errors.js';
import { parseCompressedPoint, type CompressedPoint } from './secret.js';

/** Networks with a silent payment HRP: `sp` (mainnet) and `tsp` (testnet, signet, regtest). */
export type SilentPaymentNetwork = 'mainnet' | 'testnet';

const HRP: Readonly<Record<SilentPaymentNetwork, string>> = { mainnet: 'sp', testnet: 'tsp' };

/** A decoded silent payment address (`B_scan`, `B_m`). */
export interface SilentPaymentAddress {
  readonly network: SilentPaymentNetwork;
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
 * Encodes a version-0 silent payment address:
 * `bech32m(hrp, [0] || convertbits(ser_P(B_scan) || ser_P(B_m)))`.
 *
 * @param network `mainnet` -> `sp`, `testnet` -> `tsp`.
 * @param scanPublicKey `B_scan`, validated as a compressed point.
 * @param spendPublicKey `B_m`, validated as a compressed point.
 * @returns Lowercase address string (116 chars for `sp`, 117 for `tsp`).
 * @throws {SilentPaymentError} `INVALID_POINT`, `INVALID_ADDRESS`.
 * @security Public data only.
 */
export function encodeSilentPaymentAddress(
  network: SilentPaymentNetwork,
  scanPublicKey: Uint8Array,
  spendPublicKey: Uint8Array,
): string {
  const scan = parseCompressedPoint(scanPublicKey);
  const spend = parseCompressedPoint(spendPublicKey);
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload.set(scan, 0);
  payload.set(spend, 33);
  return bech32mEncode(HRP[network], [0, ...bech32m.toWords(payload)], SP_MAX_LENGTH);
}

/**
 * Strictly decodes a silent payment address.
 *
 * @remarks Rules (BIP-352 "Versions" and "Address encoding"): HRP must be `sp` or `tsp`;
 * only lowercase strings are accepted (a deliberate tightening of BIP-173, which also allows
 * all-uppercase); Bech32m checksum required; length at most 1023; version 0 requires exactly
 * 66 data bytes with zero padding; versions 1 to 30 are accepted for forward compatibility by
 * reading the first 66 bytes and discarding the rest (need at least 66); version 31 (`l`)
 * is rejected. Both keys must be valid compressed points.
 *
 * @param address Candidate string.
 * @param expectedNetwork When given, the address must be for this network.
 * @returns The decoded keys.
 * @throws {SilentPaymentError} `INVALID_ADDRESS`, `UNSUPPORTED_VERSION`, `INVALID_POINT`, `NETWORK_MISMATCH`.
 * @security Public data only.
 */
export function decodeSilentPaymentAddress(
  address: string,
  expectedNetwork?: SilentPaymentNetwork,
): SilentPaymentAddress {
  if (typeof address !== 'string' || address !== address.toLowerCase()) return fail('INVALID_ADDRESS');
  const { hrp, words } = bech32mDecode(address, SP_MAX_LENGTH);
  let network: SilentPaymentNetwork;
  if (hrp === 'sp') network = 'mainnet';
  else if (hrp === 'tsp') network = 'testnet';
  else return fail('INVALID_ADDRESS');
  if (expectedNetwork !== undefined && expectedNetwork !== network) return fail('NETWORK_MISMATCH');
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
    network,
    version,
    scanPublicKey: parseCompressedPoint(data.subarray(0, 33)),
    spendPublicKey: parseCompressedPoint(data.subarray(33, PAYLOAD_BYTES)),
  };
}
