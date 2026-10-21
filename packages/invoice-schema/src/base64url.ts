import { Base64UrlError } from './errors.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/**
 * Encodes bytes as unpadded base64url (RFC 4648 section 5).
 *
 * @remarks Pure JavaScript, no `btoa`/`Buffer`, deterministic.
 *
 * @param bytes Input bytes.
 * @returns Unpadded base64url string.
 * @security Output is not encrypted; do not log it when it carries an invoice fragment.
 * @testVector base64url-roundtrip
 */
export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out +=
      ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/**
 * Strictly decodes unpadded, canonical base64url.
 *
 * @remarks Rejects `=` padding, `+` and `/`, whitespace, any other character,
 * length mod 4 == 1, and non-canonical encodings (non-zero trailing bits), so
 * each byte string has exactly one accepted encoding.
 *
 * @param text Candidate base64url text.
 * @returns Decoded bytes.
 * @throws {Base64UrlError} On any violation.
 * @security Never include `text` in error output; it may be a bearer secret.
 * @testVector base64url-roundtrip
 */
export function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const len = text.length;
  if (len % 4 === 1) throw new Base64UrlError();
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? (LOOKUP[c] as number) : -1;
    if (v < 0) throw new Base64UrlError();
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) throw new Base64UrlError(); // non-zero padding bits: non-canonical
  return out;
}
