/**
 * Test-only (copy of packages/core-crypto/src/secp256k1-ref.testutil.ts), deliberately naive secp256k1 reference written from the SEC 2 curve constants with plain bigint
 * arithmetic. It shares NO code with @noble/curves (no Point class, no field helpers), so agreement with the
 * package under test is an independent check of point decoding, scalar multiplication, point addition and SEC1
 * serialisation. Not constant time, not for production. Only keccak256 (@noble/hashes) is shared.
 */
import { keccak_256 } from '@noble/hashes/sha3.js';

/** SEC 2 v2, section 2.4.1. */
export const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
export const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

/** Affine point; `null` is the point at infinity. */
export type RefPoint = { readonly x: bigint; readonly y: bigint } | null;
export const G: RefPoint = { x: GX, y: GY };

export const mod = (a: bigint, m: bigint = P): bigint => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};

export function powMod(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  let x = mod(b, m);
  let k = e;
  while (k > 0n) {
    if (k & 1n) r = (r * x) % m;
    x = (x * x) % m;
    k >>= 1n;
  }
  return r;
}

/** Modular inverse by the extended Euclidean algorithm (m prime). */
export const inv = (a: bigint, m: bigint = P): bigint => {
  let [r0, r1] = [mod(a, m), m];
  if (r0 === 0n) throw new Error('ref: inverse of zero');
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return mod(s0, m);
};

export function onCurve(p: RefPoint): boolean {
  if (p === null) return true;
  return p.x >= 0n && p.x < P && p.y >= 0n && p.y < P && mod(p.y * p.y - (p.x * p.x * p.x + 7n)) === 0n;
}

export function add(a: RefPoint, b: RefPoint): RefPoint {
  if (a === null) return b;
  if (b === null) return a;
  if (a.x === b.x) {
    if (mod(a.y + b.y) === 0n) return null;
    const l = mod(3n * a.x * a.x * inv(2n * a.y));
    const x = mod(l * l - 2n * a.x);
    return { x, y: mod(l * (a.x - x) - a.y) };
  }
  const l = mod((b.y - a.y) * inv(b.x - a.x));
  const x = mod(l * l - a.x - b.x);
  return { x, y: mod(l * (a.x - x) - a.y) };
}

/** Left-to-right double-and-add; k is used as an integer (no reduction). */
export function mul(k: bigint, p: RefPoint): RefPoint {
  let r: RefPoint = null;
  for (let i = BigInt(k.toString(2).length) - 1n; i >= 0n; i--) {
    r = add(r, r);
    if ((k >> i) & 1n) r = add(r, p);
  }
  return r;
}

export function be(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let v = n;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('ref: integer too large');
  return out;
}

export function int(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

export const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string): Uint8Array => {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
};

/** SEC1 compressed (33 bytes). */
export function compress(p: RefPoint): Uint8Array {
  if (p === null) throw new Error('ref: infinity has no compressed form');
  const out = new Uint8Array(33);
  out[0] = p.y & 1n ? 0x03 : 0x02;
  out.set(be(p.x, 32), 1);
  return out;
}

/** SEC1 uncompressed (65 bytes). */
export function uncompress(p: RefPoint): Uint8Array {
  if (p === null) throw new Error('ref: infinity has no uncompressed form');
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(be(p.x, 32), 1);
  out.set(be(p.y, 32), 33);
  return out;
}

/** SEC1 2.3.4 decompression; returns `undefined` for anything that is not a valid compressed point. */
export function decompress(bytes: Uint8Array): RefPoint | undefined {
  if (bytes.length !== 33 || (bytes[0] !== 0x02 && bytes[0] !== 0x03)) return undefined;
  const x = int(bytes.subarray(1));
  if (x >= P) return undefined;
  const rhs = mod(x * x * x + 7n);
  const y0 = powMod(rhs, (P + 1n) / 4n, P); // P = 3 mod 4
  if (mod(y0 * y0) !== rhs) return undefined;
  const odd = bytes[0] === 0x03;
  const y = (y0 & 1n) === (odd ? 1n : 0n) ? y0 : P - y0;
  return { x, y };
}

/** Ethereum address (lowercase, no checksum) = last 20 bytes of keccak256(X || Y). */
export function ethAddress(p: RefPoint): string {
  return `0x${toHex(keccak_256(uncompress(p).subarray(1)).subarray(12))}`;
}

/** EIP-55 mixed-case checksum, implemented from the EIP text. */
export function eip55(lower: string): string {
  const hex = lower.slice(2).toLowerCase();
  const h = toHex(keccak_256(new TextEncoder().encode(hex)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const c = hex[i] as string;
    out += parseInt(h[i] as string, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/**
 * ERC-5564 scheme 1 (ADR-0001 serialisation): S = r * P_view, s_h = keccak256(compressed S),
 * view tag = s_h[0], P_stealth = P_spend + (s_h mod n) * G, p_stealth = (p_spend + s_h) mod n.
 */
export function refScheme1(spendPub: RefPoint, viewPub: RefPoint, ephemeralSecret: bigint) {
  const S = mul(ephemeralSecret, viewPub);
  const sh = keccak_256(compress(S));
  const h = mod(int(sh), N);
  const stealthPub = add(spendPub, mul(h, G));
  return {
    R: compress(mul(ephemeralSecret, G)),
    tag: sh[0] as number,
    h,
    stealthPub,
    address: ethAddress(stealthPub),
  };
}

/** Plain textbook ECDSA verification over a 32-byte digest (no hashing), with optional low-s rule. */
export function refEcdsaVerify(sig64: Uint8Array, digest: Uint8Array, pub: RefPoint, lowS: boolean): boolean {
  if (sig64.length !== 64 || digest.length !== 32 || pub === null || !onCurve(pub)) return false;
  const r = int(sig64.subarray(0, 32));
  const s = int(sig64.subarray(32));
  if (r < 1n || r >= N || s < 1n || s >= N) return false;
  if (lowS && s > N >> 1n) return false;
  const z = mod(int(digest), N);
  const w = inv(s, N);
  const X = add(mul(mod(z * w, N), G), mul(mod(r * w, N), pub));
  if (X === null) return false;
  return mod(X.x, N) === r;
}
