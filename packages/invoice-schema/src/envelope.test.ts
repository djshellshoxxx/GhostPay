import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  Base64UrlError,
  DecryptionError,
  FRAGMENT_PREFIX,
  FragmentFormatError,
  FragmentTooLargeError,
  InvoiceError,
  JsonParseError,
  MAX_DECODED_BYTES,
  NonCanonicalError,
  SchemaError,
  SigningError,
  UnsupportedError,
  Utf8Error,
  canonicalize,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  isSignatureVerified,
  isTrustedSeller,
  parseFragment,
  signInvoice,
  type Invoice,
  type SignedInvoice,
} from './index.js';
import { OTHER_SIGNER, SIGNER, sampleInvoice, sampleSigned, seededRng } from './fixtures.testutil.js';

const enc = (s: string): Uint8Array => utf8ToBytes(s);
const frag = (o: unknown): string => FRAGMENT_PREFIX + encodeBase64Url(enc(canonicalize(o)));
const fragText = (s: string): string => FRAGMENT_PREFIX + encodeBase64Url(enc(s));
const decodeEnvelope = (f: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(f.slice(FRAGMENT_PREFIX.length)))) as Record<
    string,
    unknown
  >;
const rec = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvoiceError) return `${e.constructor.name}`;
    throw e;
  }
  return 'NO_THROW';
}

function aad(chainId: number, signer: string): Uint8Array {
  const chain = new Uint8Array(8);
  new DataView(chain.buffer).setBigUint64(0, BigInt(chainId));
  return concatBytes(enc('GPI1'), chain, hexToBytes(signer));
}

/** Craft an encrypted envelope around arbitrary plaintext bytes (valid GCM, so only post-decrypt checks can fail). */
function craftEncrypted(
  signed: SignedInvoice,
  plaintext: Uint8Array,
  pubOverride?: Record<string, unknown>,
): string {
  const { lineItems: _l, memo: _m, ...pub } = signed.invoice as Invoice & { memo?: string };
  void _l;
  void _m;
  const key = new Uint8Array(32).fill(9);
  const nonce = new Uint8Array(12).fill(5);
  const ct = gcm(key, nonce, aad(signed.invoice.chainId, signed.invoice.signer)).encrypt(plaintext);
  return frag({
    alg: 'A256GCM',
    pub: pubOverride ?? pub,
    enc: { k: bytesToHex(key), n: bytesToHex(nonce), c: bytesToHex(ct) },
    sig: signed.signature,
  });
}

describe('plain fragments', () => {
  it('round trips and verifies', async () => {
    const s = sampleSigned();
    const f = await encodeFragment(s);
    expect(f.startsWith('#gpi=v1.')).toBe(true);
    expect(f).toMatch(/^#gpi=v1\.[A-Za-z0-9_-]+$/);
    const p = await parseFragment(f);
    expect(p.invoice).toEqual(s.invoice);
    expect(p.signature).toBe(s.signature);
    expect(p.encrypted).toBe(false);
    expect(p.verification).toEqual({ signatureValid: true, signerPinned: false });
    expect(p.trust).toBe('valid-signature');
  });
  it('encoding is deterministic', async () => {
    const s = sampleSigned();
    expect(await encodeFragment(s)).toBe(await encodeFragment(s));
  });
  it('a valid signature is not a trusted seller until the signer is pinned', async () => {
    const f = await encodeFragment(sampleSigned());
    const unpinned = await parseFragment(f);
    expect(isSignatureVerified(unpinned)).toBe(true);
    expect(isTrustedSeller(unpinned)).toBe(false);
    const pinned = await parseFragment(f, { pinnedSigners: [OTHER_SIGNER, SIGNER.toUpperCase()] });
    expect(pinned.verification).toEqual({ signatureValid: true, signerPinned: true });
    expect(pinned.trust).toBe('trusted-seller');
    expect(isTrustedSeller(pinned)).toBe(true);
    const wrongPin = await parseFragment(f, { pinnedSigners: [OTHER_SIGNER] });
    expect(wrongPin.trust).toBe('valid-signature');
  });
  it('an invalid signature is reported, never pinned', async () => {
    const f = await encodeFragment(sampleSigned());
    const env = decodeEnvelope(f);
    env['sig'] = '1'.repeat(128);
    const p = await parseFragment(frag(env), { pinnedSigners: [SIGNER] });
    expect(p.verification).toEqual({ signatureValid: false, signerPinned: false });
    expect(p.trust).toBe('invalid-signature');
    expect(isSignatureVerified(p)).toBe(false);
    expect(isTrustedSeller(p)).toBe(false);
  });
  it('swapping the signer key (attacker re-signs with own key) is valid but not pinned', async () => {
    const attacker = signInvoice(
      sampleInvoice({ signer: OTHER_SIGNER, memo: 'pay me' }),
      new Uint8Array(32).fill(0).map((_, i) => (i === 31 ? 8 : 0)),
    );
    const p = await parseFragment(await encodeFragment(attacker), { pinnedSigners: [SIGNER] });
    expect(p.verification).toEqual({ signatureValid: true, signerPinned: false });
  });
  it('tampering with any field of a plain envelope never yields a valid signature on altered data', async () => {
    const f = await encodeFragment(sampleSigned());
    const env = decodeEnvelope(f);
    const inv = rec(env['inv']);
    for (const [k, v] of [
      ['chainId', 1],
      ['expiresAt', 1],
      ['memo', 'evil'],
      ['nonce', 'a'.repeat(32)],
    ] as const) {
      const e2 = { ...env, inv: { ...inv, [k]: v } };
      const p = await parseFragment(frag(e2));
      expect(p.verification.signatureValid).toBe(false);
    }
  });
  it('inert strings: XSS payloads come back as plain data', async () => {
    const xss = '<img src=x onerror=alert(1)></script><script>alert(1)</script> javascript:alert(1)';
    const s = sampleSigned({
      memo: xss,
      lineItems: [{ description: `"><svg/onload=alert(1)> ${xss}`, quantity: '1', unitMinorUnits: '1' }],
    });
    for (const encrypt of [false, true]) {
      const p = await parseFragment(await encodeFragment(s, { encrypt }));
      expect(p.invoice.memo).toBe(xss);
      expect(p.invoice.lineItems[0]?.description).toContain('onload=alert(1)');
      expect(p.verification.signatureValid).toBe(true);
    }
  });
  it('invalid signature at encode time is refused', async () => {
    const s = sampleSigned();
    await expect(encodeFragment({ ...s, signature: '0'.repeat(128) })).rejects.toBeInstanceOf(SigningError);
    await expect(encodeFragment({ ...s, invoice: { ...s.invoice, expiresAt: 5 } })).rejects.toBeInstanceOf(
      SigningError,
    );
  });
});

describe('encrypted fragments (AES-256-GCM, ADR-0005)', () => {
  it('round trips; private part is not visible in the fragment', async () => {
    const s = sampleSigned();
    const f = await encodeFragment(s, { encrypt: true });
    const decoded = new TextDecoder().decode(decodeBase64Url(f.slice(FRAGMENT_PREFIX.length)));
    expect(decoded).not.toContain('Consulting');
    expect(decoded).not.toContain('Thanks!');
    expect(decoded).toContain('"alg":"A256GCM"');
    const p = await parseFragment(f);
    expect(p.encrypted).toBe(true);
    expect(p.invoice).toEqual(s.invoice);
    expect(p.trust).toBe('valid-signature');
  });
  it('works with no memo', async () => {
    const s = sampleSigned({ memo: undefined } as never);
    const p = await parseFragment(await encodeFragment(s, { encrypt: true }));
    expect('memo' in p.invoice).toBe(false);
    expect(p.verification.signatureValid).toBe(true);
  });
  it('is an independent-implementation-compatible AES-256-GCM with the documented AAD', async () => {
    const s = sampleSigned();
    const env = decodeEnvelope(await encodeFragment(s, { encrypt: true }));
    const e = rec(env['enc']);
    const key = hexToBytes(e['k'] as string);
    const nonce = hexToBytes(e['n'] as string);
    const ct = hexToBytes(e['c'] as string);
    expect(key.length).toBe(32);
    expect(nonce.length).toBe(12);
    const plain = gcm(key, nonce, aad(s.invoice.chainId, s.invoice.signer)).decrypt(ct);
    const { lineItems, memo } = s.invoice;
    expect(new TextDecoder().decode(plain)).toBe(canonicalize({ lineItems, memo }));
    // wrong AAD fails in the independent implementation too
    expect(() => gcm(key, nonce, aad(s.invoice.chainId + 1, s.invoice.signer)).decrypt(ct)).toThrow();
  });
  it('key and GCM nonce are unique per encryption (300 encodes)', async () => {
    const s = sampleSigned();
    const keys = new Set<string>();
    const nonces = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const e = rec(rec(decodeEnvelope(await encodeFragment(s, { encrypt: true })))['enc']);
      keys.add(e['k'] as string);
      nonces.add(e['n'] as string);
    }
    expect(keys.size).toBe(300);
    expect(nonces.size).toBe(300);
  });
  it('injected RNG makes encryption reproducible', async () => {
    const s = sampleSigned();
    const a = await encodeFragment(s, { encrypt: true, rng: seededRng('enc') });
    const b = await encodeFragment(s, { encrypt: true, rng: seededRng('enc') });
    const c = await encodeFragment(s, { encrypt: true, rng: seededRng('enc2') });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('ciphertext, tag, nonce and key tampering all fail authentication', async () => {
    const s = sampleSigned();
    const env = decodeEnvelope(await encodeFragment(s, { encrypt: true }));
    const e = rec(env['enc']);
    const ct = e['c'] as string;
    const flipNibble = (h: string, i: number): string =>
      h.slice(0, i) + (parseInt(h[i] as string, 16) ^ 1).toString(16) + h.slice(i + 1);
    const positions = [
      0,
      1,
      7,
      Math.floor(ct.length / 2),
      ct.length - 33,
      ct.length - 32,
      ct.length - 2,
      ct.length - 1,
    ];
    for (const i of positions) {
      expect(await code(parseFragment(frag({ ...env, enc: { ...e, c: flipNibble(ct, i) } })))).toBe(
        'DecryptionError',
      );
    }
    expect(
      await code(parseFragment(frag({ ...env, enc: { ...e, n: flipNibble(e['n'] as string, 3) } }))),
    ).toBe('DecryptionError');
    expect(
      await code(parseFragment(frag({ ...env, enc: { ...e, k: flipNibble(e['k'] as string, 3) } }))),
    ).toBe('DecryptionError');
    expect(await code(parseFragment(frag({ ...env, enc: { ...e, c: ct.slice(0, -2) } })))).toBe(
      'DecryptionError',
    );
    expect(await code(parseFragment(frag({ ...env, enc: { ...e, c: ct + '00' } })))).toBe('DecryptionError');
  });
  it('AAD mismatch (chainId or signer altered in the public part) fails authentication', async () => {
    const s = sampleSigned();
    const env = decodeEnvelope(await encodeFragment(s, { encrypt: true }));
    const pub = rec(env['pub']);
    expect(await code(parseFragment(frag({ ...env, pub: { ...pub, chainId: 1 } })))).toBe('DecryptionError');
    expect(await code(parseFragment(frag({ ...env, pub: { ...pub, signer: OTHER_SIGNER } })))).toBe(
      'DecryptionError',
    );
  });
  it('altering other public fields decrypts but fails the signature', async () => {
    const s = sampleSigned();
    const env = decodeEnvelope(await encodeFragment(s, { encrypt: true }));
    const pub = rec(env['pub']);
    const p = await parseFragment(frag({ ...env, pub: { ...pub, expiresAt: 1_900_000_000 } }));
    expect(p.verification.signatureValid).toBe(false);
  });
  it('rejects malformed encrypted envelopes', async () => {
    const s = sampleSigned();
    const env = decodeEnvelope(await encodeFragment(s, { encrypt: true }));
    const e = rec(env['enc']);
    const pub = rec(env['pub']);
    const bad: Array<[unknown, string]> = [
      [{ ...env, enc: { ...e, k: 'zz' } }, 'SchemaError'],
      [{ ...env, enc: { ...e, k: (e['k'] as string).toUpperCase() } }, 'SchemaError'],
      [{ ...env, enc: { ...e, n: '00' } }, 'SchemaError'],
      [{ ...env, enc: { ...e, c: '00' } }, 'SchemaError'],
      [{ ...env, enc: { ...e, c: (e['c'] as string) + '0' } }, 'SchemaError'],
      [{ ...env, enc: { ...e, extra: 1 } }, 'SchemaError'],
      [{ ...env, enc: [] }, 'SchemaError'],
      [{ ...env, enc: null }, 'SchemaError'],
      [{ ...env, sig: 'nope' }, 'SchemaError'],
      [{ ...env, pub: 'x' }, 'SchemaError'],
      [{ ...env, pub: [] }, 'SchemaError'],
      [{ ...env, pub: { ...pub, chainId: 1.5 } }, 'JsonParseError'],
      [{ ...env, pub: { ...pub, chainId: 0 } }, 'SchemaError'],
      [{ ...env, pub: { ...pub, chainId: '1' } }, 'SchemaError'],
      [{ ...env, pub: { ...pub, signer: 'abc' } }, 'SchemaError'],
      [{ alg: 'A256GCM', pub, sig: env['sig'] }, 'SchemaError'],
      [{ ...env, extra: 1 }, 'SchemaError'],
    ];
    for (const [value, expected] of bad) {
      let result: string;
      try {
        result = await code(parseFragment(frag(value)));
      } catch (err) {
        result = err instanceof JsonParseError ? 'JsonParseError' : 'unexpected';
      }
      expect(result).toBe(expected);
    }
  });
  it('post-decrypt checks: bad UTF-8, non-canonical, extra keys, private keys in public part', async () => {
    const s = sampleSigned();
    expect(await code(parseFragment(craftEncrypted(s, Uint8Array.of(0xff, 0xfe, 0xfd))))).toBe('Utf8Error');
    expect(await code(parseFragment(craftEncrypted(s, enc('{ "lineItems": [] }'))))).toBe(
      'NonCanonicalError',
    );
    expect(await code(parseFragment(craftEncrypted(s, enc('{"lineItems":[],"x":1}'))))).toBe('SchemaError');
    expect(await code(parseFragment(craftEncrypted(s, enc('{"lineItems":[],"lineItems":[]}'))))).toBe(
      'JsonParseError',
    );
    expect(await code(parseFragment(craftEncrypted(s, enc('[]'))))).toBe('SchemaError');
    const { lineItems: _l, memo: _m, ...pub } = s.invoice as Invoice & { memo?: string };
    void _l;
    void _m;
    expect(
      await code(parseFragment(craftEncrypted(s, enc('{"lineItems":[]}'), { ...pub, lineItems: [] }))),
    ).toBe('SchemaError');
    // sanity: the crafting helper itself produces a parseable fragment
    const ok = await parseFragment(
      craftEncrypted(s, enc(canonicalize({ lineItems: s.invoice.lineItems, memo: s.invoice.memo }))),
    );
    expect(ok.verification.signatureValid).toBe(true);
  });
  it('requires Web Crypto', async () => {
    const s = sampleSigned();
    const f = await encodeFragment(s, { encrypt: true });
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: crypto.getRandomValues.bind(crypto) },
      configurable: true,
    });
    try {
      expect(await code(encodeFragment(s, { encrypt: true }))).toBe('UnsupportedError');
      expect(await code(parseFragment(f))).toBe('UnsupportedError');
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
    }
  });
});

describe('size boundary (16 KiB decoded)', () => {
  /** Build a signed plain invoice whose envelope is exactly `target` bytes. */
  function sizedFragment(target: number): string {
    const make = (k: number, memoLen: number): { f: string; len: number } => {
      const items = Array.from({ length: 50 }, () => ({
        description: '€'.repeat(k),
        quantity: '1',
        unitMinorUnits: '1',
      }));
      const s = sampleSigned({ lineItems: items, memo: 'a'.repeat(memoLen) });
      const text = canonicalize({ alg: 'none', inv: s.invoice, sig: s.signature });
      return { f: fragText(text), len: enc(text).length };
    };
    let k = 1;
    while (make(k + 1, 1).len <= target) k++;
    const base = make(k, 1);
    const memoLen = 1 + (target - base.len);
    expect(memoLen).toBeGreaterThanOrEqual(1);
    expect(memoLen).toBeLessThanOrEqual(500);
    const out = make(k, memoLen);
    expect(out.len).toBe(target);
    return out.f;
  }

  it('exactly 16384 decoded bytes parses; 16385 fails closed', async () => {
    expect(MAX_DECODED_BYTES).toBe(16384);
    const at = sizedFragment(16384);
    expect(decodeBase64Url(at.slice(FRAGMENT_PREFIX.length)).length).toBe(16384);
    const p = await parseFragment(at);
    expect(p.verification.signatureValid).toBe(true);
    expect(p.invoice.lineItems).toHaveLength(50);

    const over = sizedFragment(16385);
    expect(decodeBase64Url(over.slice(FRAGMENT_PREFIX.length)).length).toBe(16385);
    await expect(parseFragment(over)).rejects.toBeInstanceOf(FragmentTooLargeError);
  }, 120_000);

  it('rejects absurd encoded lengths before decoding', async () => {
    await expect(parseFragment(FRAGMENT_PREFIX + 'A'.repeat(5_000_000))).rejects.toBeInstanceOf(
      FragmentTooLargeError,
    );
    await expect(parseFragment(FRAGMENT_PREFIX + 'A'.repeat(21_847))).rejects.toBeInstanceOf(
      FragmentTooLargeError,
    );
  });
  it('refuses to encode an oversize invoice', async () => {
    const items = Array.from({ length: 50 }, () => ({
      description: '😀'.repeat(200),
      quantity: '1',
      unitMinorUnits: '1',
    }));
    await expect(encodeFragment(sampleSigned({ lineItems: items }))).rejects.toBeInstanceOf(
      FragmentTooLargeError,
    );
  });
});

describe('parser failure classes', () => {
  const valid = async (): Promise<Record<string, unknown>> =>
    decodeEnvelope(await encodeFragment(sampleSigned()));

  it('format errors', async () => {
    for (const f of [
      '',
      '#',
      '#gpi=',
      '#gpi=v2.abc',
      'gpi=v1.abc',
      '#gpi=v1',
      '#GPI=v1.abc',
      ' #gpi=v1.abc',
      '#gpi=v1.abc&x=1',
      '#x=1&gpi=v1.abc',
    ]) {
      const r = await code(parseFragment(f));
      expect(['FragmentFormatError', 'Base64UrlError']).toContain(r);
    }
    expect(await code(parseFragment(undefined as never))).toBe('FragmentFormatError');
    expect(await code(parseFragment(5 as never))).toBe('FragmentFormatError');
    expect(await code(parseFragment('#gpi=v2.abc'))).toBe('FragmentFormatError');
  });
  it('base64url violations', async () => {
    const good = (await encodeFragment(sampleSigned())).slice(FRAGMENT_PREFIX.length);
    for (const bad of [
      good + '=',
      good + '==',
      '+' + good.slice(1),
      good + '\n',
      ' ' + good,
      good.slice(0, -1) + '$',
      'A',
    ]) {
      expect(await code(parseFragment(FRAGMENT_PREFIX + bad))).toBe('Base64UrlError');
    }
    expect(await code(parseFragment(FRAGMENT_PREFIX + 'AAAAA'))).toBe('Base64UrlError');
  });
  it('invalid UTF-8 and BOM', async () => {
    expect(
      await code(parseFragment(FRAGMENT_PREFIX + encodeBase64Url(Uint8Array.of(0x7b, 0xff, 0x7d)))),
    ).toBe('Utf8Error');
    expect(await code(parseFragment(FRAGMENT_PREFIX + encodeBase64Url(Uint8Array.of(0xc0, 0xaf))))).toBe(
      'Utf8Error',
    );
    expect(
      await code(parseFragment(FRAGMENT_PREFIX + encodeBase64Url(Uint8Array.of(0xed, 0xa0, 0x80)))),
    ).toBe('Utf8Error'); // encoded surrogate
    expect(
      await code(
        parseFragment(
          FRAGMENT_PREFIX + encodeBase64Url(concatBytes(Uint8Array.of(0xef, 0xbb, 0xbf), enc('{}'))),
        ),
      ),
    ).toBe('JsonParseError');
  });
  it('JSON violations', async () => {
    const env = await valid();
    const text = canonicalize(env);
    const cases = [
      '',
      '{',
      '{"alg":"none","alg":"none"}',
      text.replace('"alg":"none"', '"alg":"none","__proto__":{}'),
      text.replace('"chainId":8453', '"chainId":8453.5'),
      text.replace('"chainId":8453', '"chainId":1e3'),
      text.replace('"chainId":8453', '"chainId":-1'),
      text.replace('"chainId":8453', '"chainId":99999999999999999999999999'),
      text.replace('"chainId":8453', '"chainId":NaN'),
      '['.repeat(5000),
      '{"a":'.repeat(500) + '1' + '}'.repeat(500),
    ];
    for (const c of cases) expect(await code(parseFragment(fragText(c)))).toBe('JsonParseError');
  });
  it('non-canonical but valid JSON is refused', async () => {
    const env = await valid();
    const text = canonicalize(env);
    const variants = [
      ` ${text}`,
      `${text}\n`,
      JSON.stringify(env, null, 2),
      // keys out of order
      `{"sig":${JSON.stringify(env['sig'])},"inv":${canonicalize(env['inv'])},"alg":"none"}`,
      // needless escape
      text.replace('"alg":"none"', '"alg":"\\u006eone"'),
    ];
    for (const v of variants) expect(await code(parseFragment(fragText(v)))).toBe('NonCanonicalError');
  });
  it('schema, version and algorithm violations', async () => {
    const env = await valid();
    expect(await code(parseFragment(frag([])))).toBe('SchemaError');
    expect(await code(parseFragment(frag('str')))).toBe('SchemaError');
    expect(await code(parseFragment(frag({ ...env, alg: 'rot13' })))).toBe('UnsupportedError');
    expect(await code(parseFragment(frag({ ...env, alg: 5 })))).toBe('UnsupportedError');
    expect(await code(parseFragment(frag({ inv: env['inv'], sig: env['sig'] })))).toBe('UnsupportedError');
    expect(await code(parseFragment(frag({ ...env, extra: 1 })))).toBe('SchemaError');
    expect(await code(parseFragment(frag({ alg: 'none', inv: env['inv'] })))).toBe('SchemaError');
    expect(await code(parseFragment(frag({ ...env, sig: 'AB' })))).toBe('SchemaError');
    expect(await code(parseFragment(frag({ ...env, sig: (env['sig'] as string).toUpperCase() })))).toBe(
      'SchemaError',
    );
    expect(await code(parseFragment(frag({ ...env, inv: { ...rec(env['inv']), v: 2 } })))).toBe(
      'SchemaError',
    );
    expect(await code(parseFragment(frag({ ...env, inv: { ...rec(env['inv']), unknown: 1 } })))).toBe(
      'SchemaError',
    );
    expect(await code(parseFragment(frag({ ...env, inv: { ...rec(env['inv']), memo: 'é' } })))).toBe(
      'SchemaError',
    );
    expect(await code(parseFragment(frag({ ...env, inv: { ...rec(env['inv']), memo: '\ud800' } })))).toBe(
      'SchemaError',
    );
  });
  it('errors and their serialization never echo the input', async () => {
    const marker = 'TOPSECRETMARKER';
    const inputs = [
      fragText(`{"alg":"none","note":"${marker}"}`),
      fragText(`{"alg":"none","${marker}":1,"${marker}":2}`),
      `#gpi=v1.${marker}!`,
      `#gpi=v1.${encodeBase64Url(enc(marker))}`,
      frag({ alg: marker }),
    ];
    for (const i of inputs) {
      try {
        await parseFragment(i);
        throw new Error('expected failure');
      } catch (e) {
        expect(e).toBeInstanceOf(InvoiceError);
        const blob = [
          String((e as Error).message),
          String((e as Error).stack),
          JSON.stringify(e),
          JSON.stringify({ ...(e as object) }),
        ].join('|');
        expect(blob).not.toContain(marker);
        expect(blob).not.toContain(i.slice(FRAGMENT_PREFIX.length, 40));
      }
    }
  });
  it('typed class hierarchy', () => {
    expect(new SchemaError('x').path).toBe('x');
    for (const E of [
      FragmentFormatError,
      FragmentTooLargeError,
      Base64UrlError,
      Utf8Error,
      JsonParseError,
      NonCanonicalError,
      DecryptionError,
      SigningError,
      UnsupportedError,
    ]) {
      const e = new E();
      expect(e).toBeInstanceOf(InvoiceError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe(E.name);
    }
  });
});

describe('flipping any character of a fragment never produces a valid altered invoice', () => {
  for (const encrypt of [false, true]) {
    it(`${encrypt ? 'encrypted' : 'plain'}`, async () => {
      const s = sampleSigned({
        lineItems: [{ description: 'one', quantity: '1', unitMinorUnits: '1' }],
        memo: 'm',
      });
      const f = await encodeFragment(s, { encrypt });
      const body = f.slice(FRAGMENT_PREFIX.length);
      const step = encrypt ? 7 : 3;
      for (let i = 0; i < body.length; i += step) {
        const ch = body[i] as string;
        const repl = ch === 'A' ? 'B' : 'A';
        const mutated = FRAGMENT_PREFIX + body.slice(0, i) + repl + body.slice(i + 1);
        try {
          const p = await parseFragment(mutated, { pinnedSigners: [SIGNER] });
          // Parsed OK: it may only be accepted as untrusted (bad signature) - never as a verified, different invoice.
          if (p.verification.signatureValid) expect(p.invoice).toEqual(s.invoice);
          expect(p.verification.signerPinned).toBe(p.verification.signatureValid);
        } catch (e) {
          expect(e).toBeInstanceOf(InvoiceError);
        }
      }
    }, 120_000);
  }
});
