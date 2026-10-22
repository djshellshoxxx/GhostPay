import { gcm } from '@noble/ciphers/aes.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FRAGMENT_PREFIX,
  FragmentTooLargeError,
  InvoiceError,
  MAX_PASSPHRASE_BYTES,
  PASSPHRASE_ALG,
  PassphrasePolicyError,
  PassphraseRequiredError,
  PassphraseUnexpectedError,
  SCRYPT_ALLOWED_N,
  SchemaError,
  WrongPassphraseError,
  canonicalize,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  openFragment,
  parseFragment,
  signInvoice,
  type SignedInvoice,
} from './index.js';
import { passphraseToBytes } from './passphrase.js';
import {
  OTHER_SIGNER,
  OTHER_SIGNING_KEY,
  SIGNER,
  sampleInvoice,
  sampleSigned,
  seededRng,
} from './fixtures.testutil.js';

const N15 = 1 << 15;
const PASS = 'correct horse battery staple';
const enc = (s: string): Uint8Array => utf8ToBytes(s);
const frag = (o: unknown): string => FRAGMENT_PREFIX + encodeBase64Url(enc(canonicalize(o)));
const decodeEnvelope = (f: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(f.slice(FRAGMENT_PREFIX.length)))) as Record<
    string,
    unknown
  >;
const rec = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

async function errName(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvoiceError) return e.constructor.name;
    throw e;
  }
  return 'NO_THROW';
}

const pwEncode = (s: SignedInvoice, passphrase = PASS, seed = 'pw'): Promise<string> =>
  encodeFragment(s, { passphrase, scryptN: N15, rng: seededRng(seed) });

/** Independent reference (noble scrypt sync + noble AES-GCM) of the documented ADR-0020 construction. */
function refAad(
  chainId: number,
  signer: string,
  N: number,
  r: number,
  p: number,
  salt: Uint8Array,
): Uint8Array {
  const chain = new Uint8Array(8);
  new DataView(chain.buffer).setBigUint64(0, BigInt(chainId));
  const kdf = new Uint8Array(12);
  const dv = new DataView(kdf.buffer);
  dv.setUint32(0, N);
  dv.setUint32(4, r);
  dv.setUint32(8, p);
  return concatBytes(enc('GPI1-PW\0'), chain, hexToBytes(signer), kdf, salt);
}

interface Craft {
  readonly plaintext: Uint8Array;
  readonly chainId?: number;
  readonly signer?: string;
  readonly passphrase?: string;
}
/** Builds an authentic A256GCM-PW envelope around arbitrary plaintext (only post-decrypt checks can fail). */
function craft(c: Craft): string {
  const chainId = c.chainId ?? 8453;
  const signer = c.signer ?? SIGNER;
  const salt = new Uint8Array(16).fill(3);
  const nonce = new Uint8Array(12).fill(4);
  const key = scrypt(enc((c.passphrase ?? PASS).normalize('NFKC')), salt, { N: N15, r: 8, p: 1, dkLen: 32 });
  const ct = gcm(key, nonce, refAad(chainId, signer, N15, 8, 1, salt)).encrypt(c.plaintext);
  return frag({
    alg: PASSPHRASE_ALG,
    chainId,
    signer,
    kdf: { N: N15, r: 8, p: 1, s: encodeBase64Url(salt) },
    enc: { n: encodeBase64Url(nonce), c: encodeBase64Url(ct) },
  });
}

describe('passphrase-protected links (A256GCM-PW, ADR-0020)', () => {
  it('round trips; only alg, chainId, signer and KDF header are in clear', async () => {
    const s = sampleSigned();
    const f = await pwEncode(s);
    expect(f).toMatch(/^#gpi=v1\.[A-Za-z0-9_-]+$/);
    const env = decodeEnvelope(f);
    expect(Object.keys(env).sort()).toEqual(['alg', 'chainId', 'enc', 'kdf', 'signer']);
    expect(env['alg']).toBe('A256GCM-PW');
    expect(env['chainId']).toBe(8453);
    expect(env['signer']).toBe(SIGNER);
    expect(rec(env['kdf'])).toMatchObject({ N: N15, r: 8, p: 1 });
    const text = new TextDecoder().decode(decodeBase64Url(f.slice(FRAGMENT_PREFIX.length)));
    for (const secret of [
      '12345',
      'st:eth',
      'Consulting',
      'Thanks!',
      'a0b86991',
      s.signature,
      s.invoice.nonce,
    ]) {
      expect(text).not.toContain(secret);
    }
    const p = await parseFragment(f, { passphrase: PASS });
    expect(p.invoice).toEqual(s.invoice);
    expect(p.signature).toBe(s.signature);
    expect(p.encrypted).toBe(true);
    expect(p.passphraseProtected).toBe(true);
    expect(p.verification).toEqual({ signatureValid: true, signerPinned: false });
    expect(p.trust).toBe('valid-signature');
    const pinned = await parseFragment(f, { passphrase: PASS, pinnedSigners: [SIGNER] });
    expect(pinned.trust).toBe('trusted-seller');
  });

  it('matches an independent scrypt + AES-GCM implementation with the documented AAD', async () => {
    const s = sampleSigned();
    const env = decodeEnvelope(await pwEncode(s));
    const kdf = rec(env['kdf']);
    const e = rec(env['enc']);
    const salt = decodeBase64Url(kdf['s'] as string);
    const nonce = decodeBase64Url(e['n'] as string);
    expect(salt.length).toBe(16);
    expect(nonce.length).toBe(12);
    const key = scrypt(enc(PASS), salt, { N: N15, r: 8, p: 1, dkLen: 32 });
    const aad = refAad(8453, SIGNER, N15, 8, 1, salt);
    const plain = gcm(key, nonce, aad).decrypt(decodeBase64Url(e['c'] as string));
    expect(new TextDecoder().decode(plain)).toBe(canonicalize({ inv: s.invoice, sig: s.signature }));
  });

  it('default cost is 2^17 and round trips', async () => {
    const f = await encodeFragment(sampleSigned(), { passphrase: PASS });
    expect(rec(decodeEnvelope(f)['kdf'])['N']).toBe(1 << 17);
    expect((await parseFragment(f, { passphrase: PASS })).passphraseProtected).toBe(true);
  });

  it('salt and nonce are fresh per encode', async () => {
    const s = sampleSigned();
    const a = decodeEnvelope(await encodeFragment(s, { passphrase: PASS, scryptN: N15 }));
    const b = decodeEnvelope(await encodeFragment(s, { passphrase: PASS, scryptN: N15 }));
    expect(rec(a['kdf'])['s']).not.toBe(rec(b['kdf'])['s']);
    expect(rec(a['enc'])['n']).not.toBe(rec(b['enc'])['n']);
  });

  it('openFragment reports needsPassphrase without KDF work, then opens with it', async () => {
    const f = await pwEncode(sampleSigned());
    const r = await openFragment(f);
    expect(r).toEqual({
      status: 'needsPassphrase',
      header: { chainId: 8453, signer: SIGNER, kdf: { N: N15, r: 8, p: 1 } },
    });
    const ok = await openFragment(f, { passphrase: PASS });
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.parsed.passphraseProtected).toBe(true);
    const plain = await openFragment(await encodeFragment(sampleSigned()));
    expect(plain.status).toBe('ok');
    if (plain.status === 'ok') expect(plain.parsed.passphraseProtected).toBe(false);
  });

  it('parseFragment without a passphrase throws PassphraseRequiredError', async () => {
    const f = await pwEncode(sampleSigned());
    expect(await errName(parseFragment(f))).toBe('PassphraseRequiredError');
    await expect(parseFragment(f)).rejects.toBeInstanceOf(PassphraseRequiredError);
  });

  it('wrong passphrase yields one generic typed error', async () => {
    const f = await pwEncode(sampleSigned());
    const err = await parseFragment(f, { passphrase: 'correct horse battery stapler' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(WrongPassphraseError);
    expect((err as InvoiceError).code).toBe('PASSPHRASE');
    expect((err as Error).message).toBe('wrong passphrase or damaged invoice link');
    expect((err as Error).message).not.toContain('correct');
  });

  it('tampering any authenticated field gives the same WrongPassphraseError (no oracle)', async () => {
    const s = sampleSigned();
    const f = await pwEncode(s);
    const env = decodeEnvelope(f);
    const kdf = rec(env['kdf']);
    const e = rec(env['enc']);
    const flip = (b64: string, i: number): string => {
      const b = decodeBase64Url(b64);
      b[i] = (b[i] as number) ^ 1;
      return encodeBase64Url(b);
    };
    const variants: Record<string, unknown>[] = [
      { ...env, chainId: 1 },
      { ...env, chainId: 8454 },
      { ...env, signer: OTHER_SIGNER },
      { ...env, kdf: { ...kdf, N: 1 << 16 } }, // param swap within the allow-list
      { ...env, kdf: { ...kdf, N: 1 << 17 } },
      { ...env, kdf: { ...kdf, s: flip(kdf['s'] as string, 0) } },
      { ...env, enc: { ...e, n: flip(e['n'] as string, 11) } },
      { ...env, enc: { ...e, c: flip(e['c'] as string, 0) } },
      { ...env, enc: { ...e, c: flip(e['c'] as string, decodeBase64Url(e['c'] as string).length - 1) } },
    ];
    const messages = new Set<string>();
    for (const v of variants) {
      const err = await parseFragment(frag(v), { passphrase: PASS }).catch((x: unknown) => x);
      expect(err).toBeInstanceOf(WrongPassphraseError);
      messages.add((err as Error).message);
    }
    expect(messages.size).toBe(1);
  });

  it('truncated ciphertext fails closed', async () => {
    const env = decodeEnvelope(await pwEncode(sampleSigned()));
    const e = rec(env['enc']);
    const ct = decodeBase64Url(e['c'] as string);
    const short = { ...env, enc: { ...e, c: encodeBase64Url(ct.subarray(0, ct.length - 1)) } };
    expect(await errName(parseFragment(frag(short), { passphrase: PASS }))).toBe('WrongPassphraseError');
    const tiny = { ...env, enc: { ...e, c: encodeBase64Url(ct.subarray(0, 16)) } };
    expect(await errName(parseFragment(frag(tiny), { passphrase: PASS }))).toBe('SchemaError');
  });

  it('KDF parameters outside the allow-list are refused before any derivation (no DoS)', async () => {
    const env = decodeEnvelope(await pwEncode(sampleSigned()));
    const kdf = rec(env['kdf']);
    const bad: unknown[] = [
      { ...kdf, N: 2 ** 30 },
      { ...kdf, N: 2 ** 18 },
      { ...kdf, N: 2 ** 14 },
      { ...kdf, N: 2 ** 17 + 1 },
      { ...kdf, N: 0 },
      { ...kdf, N: '32768' },
      { ...kdf, r: 16 },
      { ...kdf, r: 1 },
      { ...kdf, p: 2 },
      { ...kdf, p: 0 },
    ];
    const t0 = Date.now();
    for (const k of bad) {
      expect(await errName(parseFragment(frag({ ...env, kdf: k }), { passphrase: PASS }))).toBe(
        'UnsupportedError',
      );
      expect(await errName(openFragment(frag({ ...env, kdf: k })))).toBe('UnsupportedError');
    }
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(SCRYPT_ALLOWED_N).toEqual([32768, 65536, 131072]);
  });

  it('structural problems are typed schema/base64 errors', async () => {
    const env = decodeEnvelope(await pwEncode(sampleSigned()));
    const kdf = rec(env['kdf']);
    const e = rec(env['enc']);
    const cases: [unknown, string][] = [
      [{ ...env, extra: 1 }, 'SchemaError'],
      [{ alg: env['alg'], chainId: env['chainId'], signer: env['signer'], kdf }, 'SchemaError'],
      [{ ...env, chainId: 0 }, 'SchemaError'],
      [{ ...env, chainId: '8453' }, 'SchemaError'],
      [{ ...env, signer: SIGNER.toUpperCase() }, 'SchemaError'],
      [{ ...env, signer: '04' + SIGNER.slice(2) }, 'SchemaError'],
      [{ ...env, kdf: { ...kdf, extra: 1 } }, 'SchemaError'],
      [{ ...env, kdf: [] }, 'SchemaError'],
      [{ ...env, kdf: { ...kdf, s: 'AAAA' } }, 'SchemaError'],
      [{ ...env, kdf: { ...kdf, s: (kdf['s'] as string).slice(0, 21) + '=' } }, 'SchemaError'],
      [{ ...env, kdf: { ...kdf, s: (kdf['s'] as string).slice(0, 21) + 'B' } }, 'Base64UrlError'],
      [{ ...env, enc: { ...e, n: 'A'.repeat(12) } }, 'SchemaError'],
      [{ ...env, enc: { ...e, c: 1 } }, 'SchemaError'],
      [{ ...env, enc: { ...e, k: '00' } }, 'SchemaError'],
    ];
    for (const [v, want] of cases) {
      expect(await errName(openFragment(frag(v)))).toBe(want);
    }
  });

  it('downgrade: re-labelling a PW envelope as A256GCM or none is rejected', async () => {
    const env = decodeEnvelope(await pwEncode(sampleSigned()));
    for (const alg of ['A256GCM', 'none']) {
      expect(await errName(parseFragment(frag({ ...env, alg })))).toBe('SchemaError');
      // With a passphrase the relabelled link is refused as a possible substitution.
      expect(await errName(parseFragment(frag({ ...env, alg }), { passphrase: PASS }))).toBe(
        'PassphraseUnexpectedError',
      );
    }
    expect(await errName(parseFragment(frag({ ...env, alg: 'A256GCM-PW2' }), { passphrase: PASS }))).toBe(
      'UnsupportedError',
    );
  });

  it('link substitution: a passphrase supplied for a non-passphrase link is refused', async () => {
    const s = sampleSigned();
    for (const encrypt of [false, true]) {
      const f = await encodeFragment(s, { encrypt });
      await expect(parseFragment(f, { passphrase: PASS })).rejects.toBeInstanceOf(PassphraseUnexpectedError);
      await expect(openFragment(f, { passphrase: PASS })).rejects.toBeInstanceOf(PassphraseUnexpectedError);
    }
  });

  it('signature still covers the plaintext: a re-encrypted altered invoice is invalid-signature', async () => {
    const s = sampleSigned();
    const altered = { ...s.invoice, fiat: { currency: 'USD', minorUnits: '99999' } };
    const f = craft({ plaintext: enc(canonicalize({ inv: altered, sig: s.signature })) });
    const p = await parseFragment(f, { passphrase: PASS, pinnedSigners: [SIGNER] });
    expect(p.verification).toEqual({ signatureValid: false, signerPinned: false });
    expect(p.trust).toBe('invalid-signature');
    // and the honest crafted one verifies
    const ok = await parseFragment(
      craft({ plaintext: enc(canonicalize({ inv: s.invoice, sig: s.signature })) }),
      {
        passphrase: PASS,
      },
    );
    expect(ok.verification.signatureValid).toBe(true);
  });

  it('authentic but malformed plaintext gives typed errors (reachable only with the passphrase)', async () => {
    const s = sampleSigned();
    const body = { inv: s.invoice, sig: s.signature };
    const other = signInvoice(sampleInvoice({ signer: OTHER_SIGNER }), OTHER_SIGNING_KEY);
    const cases: [Craft, string][] = [
      [{ plaintext: enc(JSON.stringify(body, null, 1)) }, 'NonCanonicalError'],
      [{ plaintext: new Uint8Array([0xff, 0xfe, 0x7b]) }, 'Utf8Error'],
      [{ plaintext: enc('{"inv":1') }, 'JsonParseError'],
      [{ plaintext: enc(canonicalize({ ...body, x: 1 })) }, 'SchemaError'],
      [{ plaintext: enc(canonicalize({ inv: s.invoice, sig: 'zz' })) }, 'SchemaError'],
      [{ plaintext: enc(canonicalize({ inv: { ...s.invoice, v: 2 }, sig: s.signature })) }, 'SchemaError'],
      [{ plaintext: enc(canonicalize(body)), chainId: 1 }, 'SchemaError'],
      [{ plaintext: enc(canonicalize({ inv: other.invoice, sig: other.signature })) }, 'SchemaError'],
    ];
    for (const [c, want] of cases) {
      expect(await errName(parseFragment(craft(c), { passphrase: PASS }))).toBe(want);
    }
    const chainErr = await parseFragment(craft({ plaintext: enc(canonicalize(body)), chainId: 1 }), {
      passphrase: PASS,
    }).catch((e: unknown) => e);
    expect((chainErr as SchemaError).path).toBe('chainId');
    const signerErr = await parseFragment(
      craft({ plaintext: enc(canonicalize({ inv: other.invoice, sig: other.signature })) }),
      { passphrase: PASS },
    ).catch((e: unknown) => e);
    expect((signerErr as SchemaError).path).toBe('signer');
  });

  it('unicode: NFKC-equivalent passphrases open the same link', async () => {
    const pairs: [string, string][] = [
      ['café au lait!', 'café au lait!'], // composed vs decomposed
      ['ＡＢＣＤＥＦＧＨＩＪ', 'ABCDEFGHIJ'], // full-width
      ['ﬁnance-pass-1', 'finance-pass-1'], // ligature
    ];
    for (const [a, b] of pairs) {
      const f = await pwEncode(sampleSigned(), a);
      expect((await parseFragment(f, { passphrase: b })).passphraseProtected).toBe(true);
    }
    // case is not folded
    const f = await pwEncode(sampleSigned(), 'ABCDEFGHIJ');
    expect(await errName(parseFragment(f, { passphrase: 'abcdefghij' }))).toBe('WrongPassphraseError');
  });

  it('passphrase policy: length in code points, byte cap, lone surrogates, type', async () => {
    const s = sampleSigned();
    const f = await pwEncode(s);
    const bad: unknown[] = [
      '',
      '123456789',
      '\u{1F600}'.repeat(9), // 18 UTF-16 units but 9 code points
      'a'.repeat(9) + '\ud800',
      '\udc00' + 'a'.repeat(12),
      'a'.repeat(MAX_PASSPHRASE_BYTES + 1),
      'é'.repeat(600), // 1200 UTF-8 bytes
      42,
      null,
    ];
    for (const p of bad) {
      expect(await errName(encodeFragment(s, { passphrase: p as string, scryptN: N15 }))).toBe(
        'PassphrasePolicyError',
      );
      expect(await errName(parseFragment(f, { passphrase: p as string }))).toBe('PassphrasePolicyError');
    }
    expect(() => passphraseToBytes('\u{1F600}'.repeat(10))).not.toThrow();
    expect(() => passphraseToBytes('a'.repeat(MAX_PASSPHRASE_BYTES))).not.toThrow();
    await expect(parseFragment(f, { passphrase: 'short' })).rejects.toBeInstanceOf(PassphrasePolicyError);
  });

  it('encode option conflicts are refused', async () => {
    const s = sampleSigned();
    const cases: Parameters<typeof encodeFragment>[1][] = [
      { passphrase: PASS, encrypt: false },
      { scryptN: N15 },
      { encrypt: true, scryptN: N15 },
      { passphrase: PASS, scryptN: 1 << 14 },
      { passphrase: PASS, scryptN: 1 << 18 },
      { passphrase: PASS, scryptN: 40000 },
    ];
    for (const o of cases) expect(await errName(encodeFragment(s, o))).toBe('UnsupportedError');
    expect(
      (
        await parseFragment(await encodeFragment(s, { passphrase: PASS, encrypt: true, scryptN: N15 }), {
          passphrase: PASS,
        })
      ).passphraseProtected,
    ).toBe(true);
  });

  it('refuses an invalid signature and oversize invoices at encode', async () => {
    const s = sampleSigned();
    expect(await errName(pwEncode({ ...s, signature: '0'.repeat(128) }))).toBe('SigningError');
    const many = sampleSigned({
      lineItems: Array.from({ length: 50 }, () => ({
        description: 'x'.repeat(200),
        quantity: '1',
        unitMinorUnits: '1',
      })),
      memo: 'm'.repeat(500),
    });
    await expect(pwEncode(many)).rejects.toBeInstanceOf(FragmentTooLargeError);
  });

  it('old v1 links are unaffected and report passphraseProtected=false', async () => {
    const s = sampleSigned();
    for (const encrypt of [false, true]) {
      const f = await encodeFragment(s, { encrypt });
      expect(decodeEnvelope(f)['alg']).toBe(encrypt ? 'A256GCM' : 'none');
      const p = await parseFragment(f);
      expect(p.passphraseProtected).toBe(false);
      expect(p.invoice).toEqual(s.invoice);
    }
  });

  it('missing Web Crypto is UnsupportedError, not a wrong-passphrase error', async () => {
    const f = await pwEncode(sampleSigned());
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(await errName(parseFragment(f, { passphrase: PASS }))).toBe('UnsupportedError');
    } finally {
      if (desc !== undefined) Object.defineProperty(globalThis, 'crypto', desc);
    }
  });
});

describe('passphrase fuzzing', () => {
  it('passphraseToBytes: policy error or NFKC UTF-8 bytes; NFKC-idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (s) => {
        let out: Uint8Array;
        try {
          out = passphraseToBytes(s);
        } catch (e) {
          expect(e).toBeInstanceOf(PassphrasePolicyError);
          return;
        }
        expect(out).toEqual(enc(s.normalize('NFKC')));
        expect(passphraseToBytes(s.normalize('NFKC'))).toEqual(out);
      }),
      { numRuns: 1000 },
    );
  });

  it('structurally mutated PW envelopes fail closed with typed errors', async () => {
    const env = decodeEnvelope(await pwEncode(sampleSigned()));
    const keys = [
      'alg',
      'chainId',
      'signer',
      'kdf',
      'enc',
      'kdf.N',
      'kdf.r',
      'kdf.p',
      'kdf.s',
      'enc.n',
      'enc.c',
    ];
    const value = fc.oneof(
      fc.integer(),
      fc.string({ maxLength: 40 }),
      fc.constant(null),
      fc.boolean(),
      fc.constantFrom(...SCRYPT_ALLOWED_N),
      fc.dictionary(fc.string({ maxLength: 3 }), fc.integer(), { maxKeys: 3 }),
    );
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...keys), value, async (k, v) => {
        const copy = JSON.parse(JSON.stringify(env)) as Record<string, Record<string, unknown>>;
        const [a, b] = k.split('.') as [string, string | undefined];
        if (b === undefined) (copy as Record<string, unknown>)[a] = v;
        else (copy[a] as Record<string, unknown>)[b] = v;
        try {
          // No passphrase: exercises every structural check without KDF work.
          const r = await openFragment(frag(copy));
          expect(r.status).toBe('needsPassphrase');
        } catch (e) {
          expect(e).toBeInstanceOf(InvoiceError);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('random ciphertext bytes never open and never throw untyped errors', async () => {
    const env = decodeEnvelope(await pwEncode(sampleSigned()));
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 64 }), async (bytes) => {
        const copy = { ...env, enc: { ...rec(env['enc']), c: encodeBase64Url(bytes) } };
        const e = await openFragment(frag(copy), { passphrase: PASS }).catch((x: unknown) => x);
        expect(e).toBeInstanceOf(InvoiceError);
      }),
      { numRuns: 8 },
    );
  });
});
