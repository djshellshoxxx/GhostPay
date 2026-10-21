import { fail } from './errors.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/** UTF-8 encode. */
export function utf8Encode(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(enc.encode(s));
}

/** Strict UTF-8 decode; throws CORRUPT on invalid sequences. */
export function utf8Decode(b: Uint8Array): string {
  try {
    return dec.decode(b);
  } catch {
    return fail('CORRUPT', 'invalid utf-8');
  }
}

/** Copy into a fresh ArrayBuffer-backed view (what WebCrypto accepts). */
export function toBuf(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(b);
}

/** Concatenate byte arrays. */
export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Big-endian uint32. */
export function u32be(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

/** Lowercase hex. */
export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** Strict lowercase-hex decode. */
export function fromHex(h: string): Uint8Array<ArrayBuffer> {
  if (h.length % 2 !== 0 || !/^[0-9a-f]*$/.test(h)) return fail('INVALID_INPUT', 'bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** base64url (no padding) encode. */
export function toBase64Url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strict base64url decode (rejects padding, whitespace, other alphabets). */
export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return fail('INVALID_INPUT', 'bad base64url');
  const std = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
