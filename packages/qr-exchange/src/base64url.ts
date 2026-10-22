import { QrExchangeError } from './errors.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE: Int8Array = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/** Unpadded base64url. */
export function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/** Strict decoder: no padding, no whitespace, canonical trailing bits only (so encode(decode(x)) === x). */
export function b64urlDecode(text: string): Uint8Array {
  const len = text.length;
  if (len === 0 || len % 4 === 1) throw new QrExchangeError('BAD_CHUNK');
  const vals = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? (REVERSE[c] ?? -1) : -1;
    if (v < 0) throw new QrExchangeError('BAD_CHUNK');
    vals[i] = v;
  }
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  let i = 0;
  for (; i + 3 < len; i += 4) {
    const n = (vals[i]! << 18) | (vals[i + 1]! << 12) | (vals[i + 2]! << 6) | vals[i + 3]!;
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
  }
  const rest = len - i;
  if (rest === 2) {
    const n = (vals[i]! << 18) | (vals[i + 1]! << 12);
    if ((vals[i + 1]! & 15) !== 0) throw new QrExchangeError('BAD_CHUNK');
    out[o] = (n >> 16) & 255;
  } else if (rest === 3) {
    const n = (vals[i]! << 18) | (vals[i + 1]! << 12) | (vals[i + 2]! << 6);
    if ((vals[i + 2]! & 3) !== 0) throw new QrExchangeError('BAD_CHUNK');
    out[o] = (n >> 16) & 255;
    out[o + 1] = (n >> 8) & 255;
  }
  return out;
}
