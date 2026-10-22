/**
 * Second, independent implementation of the scheme for tests ONLY: plain BigInt edwards25519
 * arithmetic (RFC 8032 section 5.1 formulas), `node:crypto` SHA-512/SHA-256, and a BigInt
 * base58. No @noble or @scure code is used here. Slow and NOT constant time.
 */
import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';

const P = 2n ** 255n - 19n;
export const REF_L = 2n ** 252n + 27742317777372353535851937790883648493n;

const mod = (a: bigint, m = P): bigint => ((a % m) + m) % m;
function pow(b: bigint, e: bigint, m = P): bigint {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
const inv = (a: bigint): bigint => pow(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

type Ext = readonly [bigint, bigint, bigint, bigint]; // X, Y, Z, T

function recoverX(y: bigint, sign: number): bigint {
  const x2 = mod((y * y - 1n) * inv(D * y * y + 1n));
  let x = pow(x2, (P + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = mod(x * SQRT_M1);
  if (mod(x * x - x2) !== 0n) throw new Error('not on curve');
  if (Number(x & 1n) !== sign) x = mod(-x);
  return x;
}

const By = mod(4n * inv(5n));
const BASE: Ext = (() => {
  const x = recoverX(By, 0);
  return [x, By, 1n, mod(x * By)] as const;
})();
const ZERO: Ext = [0n, 1n, 1n, 0n];

/** RFC 8032 5.1.4 point addition. */
function add(p: Ext, q: Ext): Ext {
  const A = mod((p[1] - p[0]) * (q[1] - q[0]));
  const B = mod((p[1] + p[0]) * (q[1] + q[0]));
  const C = mod(2n * p[3] * q[3] * D);
  const Dd = mod(2n * p[2] * q[2]);
  const E = B - A;
  const F = Dd - C;
  const G = Dd + C;
  const H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
}

export function refMul(k: bigint, p: Ext = BASE): Ext {
  let r = ZERO;
  let q = p;
  while (k > 0n) {
    if (k & 1n) r = add(r, q);
    q = add(q, q);
    k >>= 1n;
  }
  return r;
}

export function refEncode(p: Ext): Uint8Array {
  const zi = inv(p[2]);
  const x = mod(p[0] * zi);
  const y = mod(p[1] * zi);
  const out = leBytes(y, 32);
  out[31] = (out[31] as number) | (Number(x & 1n) << 7);
  return out;
}

export function refDecode(b: Uint8Array): Ext {
  const yb = Uint8Array.from(b);
  const sign = (yb[31] as number) >> 7;
  yb[31] = (yb[31] as number) & 0x7f;
  const y = leInt(yb);
  const x = recoverX(y, sign);
  return [x, y, 1n, mod(x * y)];
}

export function leBytes(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

export function leInt(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i] as number);
  return n;
}

const sha = (alg: 'sha256' | 'sha512', ...parts: Uint8Array[]): Uint8Array => {
  const h = createHash(alg);
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
};
export const refSha512 = (...parts: Uint8Array[]): Uint8Array => sha('sha512', ...parts);
const tagged = (tag: string, ...parts: Uint8Array[]): Uint8Array => {
  const t = new TextEncoder().encode(tag);
  return refSha512(Uint8Array.of(t.length), t, ...parts);
};

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function refBase58(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = '';
  while (n > 0n) {
    s = (ALPHABET[Number(n % 58n)] as string) + s;
    n /= 58n;
  }
  for (const x of b) {
    if (x !== 0) break;
    s = '1' + s;
  }
  return s;
}

export function refBase58check(payload: Uint8Array): string {
  const c = sha('sha256', sha('sha256', payload)).subarray(0, 4);
  const all = new Uint8Array(payload.length + 4);
  all.set(payload);
  all.set(c, payload.length);
  return refBase58(all);
}

/** Full scheme from scalars, as specified in DEVIATIONS.md / solana-impl.md. */
export function refDerive(s: bigint, v: bigint, r: bigint) {
  const S = refEncode(refMul(s));
  const Vp = refMul(v);
  const V = refEncode(Vp);
  const R = refEncode(refMul(r));
  const K = refEncode(refMul(8n, refMul(r, refDecode(V))));
  const Krecv = refEncode(refMul(8n, refMul(v, refDecode(R))));
  const h = leInt(tagged('GhostPay/solana-stealth/v1/tweak', K, R, S)) % REF_L;
  const viewTag = tagged('GhostPay/solana-stealth/v1/view-tag', K)[0] as number;
  const Pt = refEncode(add(refDecode(S), refMul(h)));
  const x = (s + h) % REF_L;
  const meta = new Uint8Array(65);
  meta[0] = 1;
  meta.set(S, 1);
  meta.set(V, 33);
  const ann = new Uint8Array(34);
  ann[0] = 1;
  ann.set(R, 1);
  ann[33] = viewTag;
  return {
    S,
    V,
    R,
    K,
    Krecv,
    h,
    viewTag,
    P: Pt,
    x,
    xB: refEncode(refMul(x)),
    meta: 'gpsol:' + refBase58check(meta),
    memo: 'gpst1:' + Buffer.from(ann).toString('base64url'),
    address: refBase58(Pt),
  };
}

/** Verify an Ed25519 signature with node:crypto (OpenSSL), independent of noble. */
export function nodeVerifyEd25519(sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean {
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pub).toString('base64url') },
    format: 'jwk',
  });
  return nodeVerify(null, msg, key, sig);
}
