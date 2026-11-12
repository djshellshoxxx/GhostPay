/**
 * EXTRA-05 crypto review: invoice signature and envelope checks against implementations that share no code with
 * the package: a bigint ECDSA verifier (secp256k1-ref.testutil.ts), an own canonical-JSON writer, and node:crypto
 * scrypt + AES-256-GCM (OpenSSL) as a third AEAD/KDF implementation next to the existing @noble/ciphers checks.
 */
import { createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { describe, expect, it } from 'vitest';
import {
  FRAGMENT_PREFIX,
  InvoiceError,
  PASSPHRASE_ALG,
  canonicalInvoiceBytes,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  invoiceDigest,
  parseFragment,
  verifyInvoiceSignature,
  type Invoice,
  type SignedInvoice,
} from './index.js';
import { SIGNER, sampleSigned, seededRng } from './fixtures.testutil.js';
import { G, N, be, decompress, fromHex, int, mul, refEcdsaVerify, toHex } from './secp256k1-ref.testutil.js';

const PASS = 'correct horse battery staple';
const N15 = 1 << 15;
const te = new TextEncoder();

/** Own canonical JSON: sorted keys (UTF-16 order), no whitespace, integers and strings only. */
function refCanon(v: unknown): string {
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')
    return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(refCanon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${refCanon(o[k])}`)
    .join(',')}}`;
}
const refDigest = (inv: Invoice): Uint8Array =>
  keccak_256(new Uint8Array([...te.encode('GhostPay.Invoice.v1\0'), ...te.encode(refCanon(inv))]));
const refVerify = (s: SignedInvoice, inv: Invoice = s.invoice, lowS = true): boolean =>
  refEcdsaVerify(fromHex(s.signature), refDigest(inv), decompress(fromHex(inv.signer)) ?? null, lowS);

async function errName(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvoiceError) return e.constructor.name;
    throw e;
  }
  return 'NO_THROW';
}
const frag = (o: unknown): string => FRAGMENT_PREFIX + encodeBase64Url(te.encode(refCanon(o)));
const envOf = (f: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(f.slice(FRAGMENT_PREFIX.length)))) as Record<
    string,
    unknown
  >;

function pwAad(chainId: number, signer: string, N: number, r: number, p: number, salt: Uint8Array): Buffer {
  const b = Buffer.alloc(8 + 8 + 33 + 12 + 16);
  b.write('GPI1-PW\0', 0, 'latin1');
  b.writeBigUInt64BE(BigInt(chainId), 8);
  Buffer.from(signer, 'hex').copy(b, 16);
  b.writeUInt32BE(N, 49);
  b.writeUInt32BE(r, 53);
  b.writeUInt32BE(p, 57);
  Buffer.from(salt).copy(b, 61);
  return b;
}
const nodeScrypt = (pass: string, salt: Uint8Array, N: number): Buffer =>
  scryptSync(Buffer.from(pass.normalize('NFKC'), 'utf8'), salt, 32, {
    N,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });

describe('invoice signature vs a curve-independent ECDSA verifier', () => {
  it('signer key, canonical bytes and digest are reproduced independently', () => {
    const s = sampleSigned();
    expect(toHex(fromHex(SIGNER))).toBe(toHex(new Uint8Array(fromHex(s.invoice.signer))));
    expect(decompress(fromHex(SIGNER))).toEqual(mul(7n, G));
    expect(new TextDecoder().decode(canonicalInvoiceBytes(s.invoice))).toBe(refCanon(s.invoice));
    expect(toHex(invoiceDigest(s.invoice))).toBe(toHex(refDigest(s.invoice)));
  });

  it('20 package signatures verify under the reference (low-s, 64-byte r||s)', () => {
    for (let i = 0; i < 20; i++) {
      const s = sampleSigned({ memo: `memo ${i}` }, `seed-${i}`);
      expect(refVerify(s)).toBe(true);
      expect(int(fromHex(s.signature).subarray(32))).toBeLessThanOrEqual(N >> 1n);
    }
  });

  it('cross-chain replay: the signature binds chainId (verification for another chain fails in both)', () => {
    const s = sampleSigned();
    for (const chainId of [1, 10, 137, 8454, 84532]) {
      const moved = { ...s.invoice, chainId };
      expect(refVerify(s, moved)).toBe(false);
      expect(verifyInvoiceSignature({ invoice: moved, signature: s.signature })).toBe(false);
    }
  });

  it('high-s twin is valid textbook ECDSA but rejected by the package; r/s out of range rejected', () => {
    const s = sampleSigned();
    const sig = fromHex(s.signature);
    const r = int(sig.subarray(0, 32));
    const sv = int(sig.subarray(32));
    const twin = toHex(new Uint8Array([...be(r, 32), ...be(N - sv, 32)]));
    expect(refVerify({ ...s, signature: twin }, s.invoice, false)).toBe(true);
    expect(refVerify({ ...s, signature: twin })).toBe(false);
    expect(verifyInvoiceSignature({ ...s, signature: twin })).toBe(false);
    const bad: [bigint, bigint][] = [
      [0n, sv],
      [r, 0n],
      [N, sv],
      [r, N],
      [r + N < 1n << 256n ? r + N : r, sv],
    ];
    for (const [br, bs] of bad) {
      const sigHex = toHex(new Uint8Array([...be(br, 32), ...be(bs, 32)]));
      if (sigHex === s.signature) continue;
      expect(verifyInvoiceSignature({ ...s, signature: sigHex })).toBe(false);
    }
  });
});

describe('A256GCM and A256GCM-PW envelopes vs node:crypto (OpenSSL)', () => {
  it('A256GCM: package ciphertext opens with OpenSSL under AAD "GPI1"||u64 chainId||signer', async () => {
    const s = sampleSigned();
    const env = envOf(await encodeFragment(s, { encrypt: true, rng: seededRng('o1') }));
    const enc = env['enc'] as Record<string, string>;
    const ct = Buffer.from(enc['c'] as string, 'hex');
    const aad = Buffer.concat([Buffer.from('GPI1'), Buffer.alloc(8), Buffer.from(SIGNER, 'hex')]);
    aad.writeBigUInt64BE(8453n, 4);
    const d = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(enc['k'] as string, 'hex'),
      Buffer.from(enc['n'] as string, 'hex'),
    );
    d.setAAD(aad);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8');
    expect(plain).toBe(refCanon({ lineItems: s.invoice.lineItems, memo: s.invoice.memo }));
  });

  it('A256GCM-PW: package output opens with OpenSSL scrypt + AES-GCM', async () => {
    const s = sampleSigned();
    const env = envOf(await encodeFragment(s, { passphrase: PASS, scryptN: N15, rng: seededRng('o2') }));
    const kdf = env['kdf'] as Record<string, unknown>;
    const enc = env['enc'] as Record<string, string>;
    const salt = decodeBase64Url(kdf['s'] as string);
    const ct = Buffer.from(decodeBase64Url(enc['c'] as string));
    const d = createDecipheriv(
      'aes-256-gcm',
      nodeScrypt(PASS, salt, N15),
      decodeBase64Url(enc['n'] as string),
    );
    d.setAAD(pwAad(8453, SIGNER, N15, 8, 1, salt));
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8');
    expect(plain).toBe(refCanon({ inv: s.invoice, sig: s.signature }));
  });

  it('A256GCM-PW: an OpenSSL-made envelope parses; every single-byte AAD, tag or ciphertext change fails closed', async () => {
    const s = sampleSigned();
    const salt = new Uint8Array(16).fill(9);
    const nonce = new Uint8Array(12).fill(5);
    const key = nodeScrypt(PASS, salt, N15);
    const seal = (aad: Buffer, plain: Buffer): Buffer => {
      const c = createCipheriv('aes-256-gcm', key, nonce);
      c.setAAD(aad);
      return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
    };
    const plain = Buffer.from(refCanon({ inv: s.invoice, sig: s.signature }), 'utf8');
    const ct = seal(pwAad(8453, SIGNER, N15, 8, 1, salt), plain);
    const mk = (c: Uint8Array, chainId = 8453, n: Uint8Array = nonce, sl: Uint8Array = salt): string =>
      frag({
        alg: PASSPHRASE_ALG,
        chainId,
        signer: SIGNER,
        kdf: { N: N15, r: 8, p: 1, s: encodeBase64Url(sl) },
        enc: { n: encodeBase64Url(n), c: encodeBase64Url(c) },
      });
    const ok = await parseFragment(mk(ct), { passphrase: PASS });
    expect(ok.verification.signatureValid).toBe(true);
    expect(ok.passphraseProtected).toBe(true);

    // AAD built for another chain: authentic ciphertext, wrong header -> wrong-passphrase class, no oracle.
    expect(await errName(parseFragment(mk(ct, 1), { passphrase: PASS }))).toBe('WrongPassphraseError');
    // Sealed under an AAD for chain 1 but with plaintext saying 8453: header says 1 -> decrypts -> mismatch.
    const ct1 = seal(pwAad(1, SIGNER, N15, 8, 1, salt), plain);
    expect(await errName(parseFragment(mk(ct1, 1), { passphrase: PASS }))).toBe('SchemaError');
    // Nonce and salt changes.
    expect(await errName(parseFragment(mk(ct, 8453, new Uint8Array(12).fill(6)), { passphrase: PASS }))).toBe(
      'WrongPassphraseError',
    );
    expect(
      await errName(parseFragment(mk(ct, 8453, nonce, new Uint8Array(16).fill(8)), { passphrase: PASS })),
    ).toBe('WrongPassphraseError');
    // Sampled byte flips across ciphertext body and the 16-byte tag (KDF is the cost, so sample ~24 positions).
    const positions = new Set<number>([0, 1, ct.length - 17, ct.length - 16, ct.length - 8, ct.length - 1]);
    for (let i = 0; i < 18; i++) positions.add(Math.floor((i * ct.length) / 18));
    for (const pos of positions) {
      const t = Buffer.from(ct);
      t[pos] = (t[pos] as number) ^ 0x01;
      expect(await errName(parseFragment(mk(t), { passphrase: PASS })), `byte ${pos}`).toBe(
        'WrongPassphraseError',
      );
    }
    // Truncation: dropping tag bytes or appending bytes.
    expect(await errName(parseFragment(mk(ct.subarray(0, ct.length - 4)), { passphrase: PASS }))).toBe(
      'WrongPassphraseError',
    );
    expect(await errName(parseFragment(mk(Buffer.concat([ct, Buffer.of(0)])), { passphrase: PASS }))).toBe(
      'WrongPassphraseError',
    );
    // ~28 scrypt(N=2^15) derivations through parseFragment: ~150 ms each locally but ~2 s each on hosted runners
    // (CI run 43298468905 timed out at the 60 s default), so this test gets an explicit budget like envelope.test.ts.
  }, 180_000);
});

describe('versioning and KDF bounds from untrusted links', () => {
  it('unknown fragment versions and algorithms fail closed before any crypto', async () => {
    const f = await encodeFragment(sampleSigned());
    const body = f.slice(FRAGMENT_PREFIX.length);
    for (const prefix of ['#gpi=v2.', '#gpi=v0.', '#gpi=V1.', '#GPI=v1.', '#gpi=v1', 'gpi=v1.']) {
      expect(await errName(parseFragment(prefix + body))).toBe('FragmentFormatError');
    }
    const env = envOf(f);
    for (const alg of ['A128GCM', 'A256GCM-PW2', 'a256gcm-pw', 'dir', 'NONE', '']) {
      expect(await errName(parseFragment(frag({ ...env, alg })))).toBe('UnsupportedError');
    }
    const inv = env['inv'] as Record<string, unknown>;
    expect(await errName(parseFragment(frag({ ...env, inv: { ...inv, v: 2 } })))).toBe('SchemaError');
  });

  it('absurd scrypt N/r/p are refused quickly (no KDF run), including max-safe-integer values', async () => {
    const env = envOf(
      await encodeFragment(sampleSigned(), { passphrase: PASS, scryptN: N15, rng: seededRng('b') }),
    );
    const kdf = env['kdf'] as Record<string, unknown>;
    const bad = [
      { N: Number.MAX_SAFE_INTEGER },
      { N: 2 ** 31 },
      { N: 2 ** 20 },
      { N: 3 * 2 ** 15 },
      { r: Number.MAX_SAFE_INTEGER },
      { r: 1024 },
      { p: Number.MAX_SAFE_INTEGER },
      { p: 16 },
      { N: true },
      { N: null },
      { r: '8' },
      { p: [1] },
    ];
    const t0 = Date.now();
    for (const b of bad) {
      expect(
        await errName(parseFragment(frag({ ...env, kdf: { ...kdf, ...b } }), { passphrase: PASS })),
      ).toBe('UnsupportedError');
    }
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
