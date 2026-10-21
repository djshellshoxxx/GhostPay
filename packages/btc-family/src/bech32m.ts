import { bech32m } from '@scure/base';
import { fail } from './errors.js';

/** BIP-352 suggested maximum address length (BIP-352, "Address encoding"). */
export const SP_MAX_LENGTH = 1023;

/** Decoded Bech32m string. */
export interface Bech32mDecoded {
  readonly hrp: string;
  readonly words: readonly number[];
}

/**
 * Encodes 5-bit `words` as a Bech32m string (BIP-350) with the given length limit.
 *
 * @param hrp Human-readable part.
 * @param words 5-bit values.
 * @param limit Maximum total length (BIP-350 segwit uses 90; BIP-352 suggests 1023).
 * @returns Lowercase Bech32m string.
 * @throws {BtcFamilyError} `INVALID_ADDRESS` on any malformed input.
 */
export function bech32mEncode(hrp: string, words: readonly number[], limit: number): string {
  try {
    return bech32m.encode(hrp, [...words], limit);
  } catch {
    return fail('INVALID_ADDRESS');
  }
}

/**
 * Strictly decodes a Bech32m string: valid checksum (Bech32m constant, not Bech32),
 * a single case, length within `limit`, non-empty HRP, printable-ASCII HRP.
 *
 * @param str Candidate string.
 * @param limit Maximum total length.
 * @returns Lowercased HRP and the 5-bit data words (checksum removed).
 * @throws {BtcFamilyError} `INVALID_ADDRESS`.
 */
export function bech32mDecode(str: string, limit: number): Bech32mDecoded {
  if (typeof str !== 'string') return fail('INVALID_ADDRESS');
  try {
    const { prefix, words } = bech32m.decode(str as `${string}1${string}`, limit);
    return { hrp: prefix, words };
  } catch {
    return fail('INVALID_ADDRESS');
  }
}
