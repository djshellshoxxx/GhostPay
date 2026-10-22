import { sha256 } from '@noble/hashes/sha2.js';
import type { OhttpHpke } from './ohttp.js';

/**
 * INSECURE FAKE HPKE for tests only. It has the same call shape as an HPKE implementation so message
 * framing can be tested end to end, but it provides NO confidentiality or authenticity guarantees. The
 * "private key" of the gateway is simply the public key. Never use outside tests.
 */
function cat(...p: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of p) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

const te = (s: string): Uint8Array => new TextEncoder().encode(s);

function stream(key: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i * 32 < n; i++) {
    const block = sha256(cat(key, Uint8Array.of(i & 0xff, i >> 8)));
    out.set(block.subarray(0, Math.min(32, n - i * 32)), i * 32);
  }
  return out;
}

function seal(key: Uint8Array, pt: Uint8Array): Uint8Array {
  const ks = stream(key, pt.length);
  const ct = pt.map((b, i) => b ^ (ks[i] as number));
  return cat(ct, sha256(cat(key, ct)).subarray(0, 8));
}

function open(key: Uint8Array, ct: Uint8Array): Uint8Array {
  if (ct.length < 8) throw new Error('short');
  const body = ct.subarray(0, ct.length - 8);
  const tag = ct.subarray(ct.length - 8);
  const want = sha256(cat(key, body)).subarray(0, 8);
  if (!want.every((b, i) => b === tag[i])) throw new Error('auth');
  const ks = stream(key, body.length);
  return body.map((b, i) => b ^ (ks[i] as number));
}

/** Deterministic counter RNG for tests. */
export function counterRandom(seed = 1): (n: number) => Uint8Array {
  let c = seed;
  return (n) => {
    c += 1;
    return stream(Uint8Array.of(c & 0xff, (c >> 8) & 0xff, 0x7e), n);
  };
}

/** Fake HPKE supporting KEM 0x0020, KDF 0x0001, AEAD 0x0001 and 0x0003. */
export function fakeHpke(rand: (n: number) => Uint8Array = counterRandom()): OhttpHpke {
  const ctxFrom = (shared: Uint8Array) => ({
    exportSecret: (context: Uint8Array, length: number): Promise<Uint8Array> => Promise.resolve(stream(cat(shared, context), length)),
  });
  return {
    supports: (kem, kdf, aead) => kem === 0x0020 && kdf === 0x0001 && (aead === 0x0001 || aead === 0x0003),
    randomBytes: rand,
    sealRequest(a) {
      const enc = rand(32);
      const shared = sha256(cat(a.recipientPublicKey, enc));
      const key = sha256(cat(shared, a.info));
      return Promise.resolve({ enc, ciphertext: seal(key, a.plaintext), ...ctxFrom(shared) });
    },
    openRequest(a) {
      const pk = a.recipient as Uint8Array; // fake: private key == public key
      const shared = sha256(cat(pk, a.enc));
      const key = sha256(cat(shared, a.info));
      try {
        return Promise.resolve({ plaintext: open(key, a.ciphertext), ...ctxFrom(shared) });
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error('fake hpke'));
      }
    },
    sealResponse(a) {
      return Promise.resolve(seal(sha256(cat(a.secret, a.salt, te('resp'))), a.plaintext));
    },
    openResponse(a) {
      try {
        return Promise.resolve(open(sha256(cat(a.secret, a.salt, te('resp'))), a.ciphertext));
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error('fake hpke'));
      }
    },
  };
}

/** A 32-byte fake gateway public key. */
export const FAKE_PUBLIC_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
