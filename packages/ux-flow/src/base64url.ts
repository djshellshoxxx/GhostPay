import { FlowError } from './errors.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charAt(i)] = i;

/** Encode bytes as unpadded base64url. */
export function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63);
    if (i + 1 < bytes.length) out += ALPHABET.charAt((n >> 6) & 63);
    if (i + 2 < bytes.length) out += ALPHABET.charAt(n & 63);
  }
  return out;
}

/**
 * Strict unpadded base64url decode. Rejects padding, other alphabets, impossible lengths and non-zero trailing bits
 * (so every byte string has exactly one accepted encoding).
 * @security Canonical-only decoding prevents malleable proof codes.
 */
export function b64urlDecode(s: string): Uint8Array {
  if (s.length % 4 === 1) throw new FlowError('PROOF_ENCODING');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const v = LOOKUP[s.charAt(i)];
    if (v === undefined) throw new FlowError('PROOF_ENCODING');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) throw new FlowError('PROOF_ENCODING');
  return out;
}
