import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { keyBytes } from './fixtures.testutil.js';
import {
  DECRYPT_FAILED_MESSAGE,
  FORMAT_VERSION,
  MAX_BLOB_CHARS,
  buildAad,
  fromBase64Url,
  open,
  resolveKey,
  seal,
  toBase64Url,
  type CryptoLike,
} from './seal.js';

const c = globalThis.crypto as CryptoLike;
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

async function key(fill = 7) {
  const k = await resolveKey(keyBytes(fill), c);
  if (!k.ok) throw new Error('key');
  return k.value;
}

describe('base64url', () => {
  it('matches known vectors', () => {
    expect(toBase64Url(enc('f'))).toBe('Zg');
    expect(toBase64Url(enc('fo'))).toBe('Zm8');
    expect(toBase64Url(enc('foo'))).toBe('Zm9v');
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(dec(fromBase64Url('Zm9vYg')!)).toBe('foob');
  });
  it('round trips and rejects non-canonical input', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (b) => {
        expect(fromBase64Url(toBase64Url(b))).toEqual(b);
      }),
    );
    for (const bad of ['Zh', 'Zm9=', 'Zg==', 'Z', 'Zm9v!', 'Zm 9', '+/8', 'Zm9vY', 'Zm9' + '\n']) {
      expect(fromBase64Url(bad), bad).toBeNull();
    }
    expect(fromBase64Url('')).toEqual(new Uint8Array(0));
  });
});

describe('resolveKey', () => {
  it('accepts 32 bytes and a proper CryptoKey; copies the bytes', async () => {
    const bytes = keyBytes(1);
    const k = await resolveKey(bytes, c);
    expect(k.ok && k.value.extractable).toBe(false);
    const ck = await c.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    expect(await resolveKey(ck, c)).toEqual({ ok: true, value: ck });
  });
  it('rejects wrong sizes and wrong key types', async () => {
    for (const n of [0, 16, 31, 33, 64])
      expect((await resolveKey(new Uint8Array(n), c)).ok, String(n)).toBe(false);
    const k128 = await c.subtle.generateKey({ name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);
    const encOnly = await c.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const cbc = await c.subtle.generateKey({ name: 'AES-CBC', length: 256 }, false, ['encrypt', 'decrypt']);
    const hmac = await c.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    for (const bad of [k128, encOnly, cbc, hmac, null, 'str', {}, 5]) {
      expect(await resolveKey(bad as never, c)).toMatchObject({ ok: false, error: { code: 'bad-key' } });
    }
  });
  it('maps import failures to bad-key', async () => {
    const broken = {
      ...c,
      subtle: { importKey: () => Promise.reject(new Error('x')) },
    } as unknown as CryptoLike;
    expect(await resolveKey(keyBytes(1), broken)).toMatchObject({ ok: false, error: { code: 'bad-key' } });
  });
});

describe('seal/open', () => {
  it('round trips; fresh IV each time; blob layout', async () => {
    const k = await key();
    const a = await seal(k, c, 'slot', enc('hello'));
    const b = await seal(k, c, 'slot', enc('hello'));
    expect(a).not.toBe(b);
    const raw = fromBase64Url(a)!;
    expect(raw[0]).toBe(FORMAT_VERSION);
    expect(raw.length).toBe(1 + 12 + 5 + 16);
    const r = await open(k, c, 'slot', a);
    expect(r.ok && dec(r.value)).toBe('hello');
  });
  it('known-answer: AAD binds version and slot', () => {
    expect(dec(buildAad(1, 'presets'))).toBe('ghostpay/ux-presets|v1|presets');
  });
  it('wrong key, wrong slot, version byte, any flipped bit, truncation, extension: identical failure', async () => {
    const k = await key(7);
    const blob = await seal(k, c, 'slot', enc('secret payload'));
    const raw = fromBase64Url(blob)!;
    const failures: unknown[] = [];
    failures.push(await open(await key(8), c, 'slot', blob));
    failures.push(await open(k, c, 'other', blob));
    for (let i = 0; i < raw.length; i++) {
      const t = raw.slice();
      t[i] = (t[i] ?? 0) ^ 1;
      failures.push(await open(k, c, 'slot', toBase64Url(t)));
    }
    failures.push(await open(k, c, 'slot', toBase64Url(raw.slice(0, raw.length - 1))));
    failures.push(await open(k, c, 'slot', toBase64Url(raw.slice(0, 20))));
    failures.push(await open(k, c, 'slot', toBase64Url(new Uint8Array([...raw, 0]))));
    failures.push(await open(k, c, 'slot', ''));
    failures.push(await open(k, c, 'slot', '!!!'));
    failures.push(await open(k, c, 'slot', 'x'.repeat(MAX_BLOB_CHARS + 1)));
    failures.push(await open(k, c, 'slot', 42 as never));
    const expected = { ok: false, error: { code: 'decrypt-failed', message: DECRYPT_FAILED_MESSAGE } };
    for (const f of failures) expect(f).toEqual(expected);
  });
  it('rejects blob sealed under an older/other version byte even with right key', async () => {
    const k = await key();
    const raw = fromBase64Url(await seal(k, c, 's', enc('x')))!;
    raw[0] = 2;
    expect((await open(k, c, 's', toBase64Url(raw))).ok).toBe(false);
  });
  it('property: round trip for arbitrary payloads, and any single-byte tamper fails', async () => {
    const k = await key();
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 200 }), fc.nat(), async (pt, pos) => {
        const blob = await seal(k, c, 's', pt);
        const r = await open(k, c, 's', blob);
        expect(r.ok && r.value).toEqual(pt);
        const raw = fromBase64Url(blob)!;
        raw[pos % raw.length] = (raw[pos % raw.length] ?? 0) ^ 0x80;
        expect((await open(k, c, 's', toBase64Url(raw))).ok).toBe(false);
      }),
      { numRuns: 40 },
    );
  });
});
