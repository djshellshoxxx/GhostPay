import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url, toHex, utf8Decode } from './bytes.js';
import {
  type CryptoDeps,
  DEFAULT_KDF,
  MAX_BLOB_BYTES,
  MIN_BLOB_BYTES,
  checkPolicy,
  defaultCryptoDeps,
  newKeyContext,
  normalizeNewPassword,
  open,
  parseHeader,
  randomBytes,
  seal,
} from './envelope.js';
import { VaultError } from './errors.js';
import { TEST_KDF, seededRng } from './memory.testutil.js';

const deps = (seed = 1): CryptoDeps => ({ ...defaultCryptoDeps(TEST_KDF), rng: seededRng(seed) });
const ID = '00112233445566778899aabbccddeeff';
const PW = 'correct horse battery';

async function sealed(d = deps(), text = 'hello vault'): Promise<Uint8Array> {
  const ctx = await newKeyContext(d, PW, ID, 'profile');
  return seal(d, ctx, new TextEncoder().encode(text));
}
const code = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof VaultError ? `${e.code}:${e.message}` : 'other';
  }
};

describe('envelope', () => {
  it('round-trips and has the documented layout', async () => {
    const d = deps();
    const blob = await sealed(d);
    expect(new TextDecoder().decode(blob.slice(0, 4))).toBe('GPVT');
    expect(blob[4]).toBe(1);
    expect(blob[5]).toBe(1);
    expect(new DataView(blob.buffer).getUint32(6, false)).toBe(1000);
    expect(toHex(blob.slice(10, 26))).toBe(ID);
    expect(blob.length).toBe(54 + 'hello vault'.length + 16);
    const r = await open(d, blob, PW, 'profile');
    expect(utf8Decode(r.plaintext)).toBe('hello vault');
    expect(r.header.profileId).toBe(ID);
  });

  it('uses fresh salt and nonce per context / seal', async () => {
    const d = deps(5);
    const c1 = await newKeyContext(d, PW, ID, 'profile');
    const c2 = await newKeyContext(d, PW, ID, 'profile');
    expect(toHex(c1.salt)).not.toBe(toHex(c2.salt));
    const a = await seal(d, c1, new Uint8Array([1]));
    const b = await seal(d, c1, new Uint8Array([1]));
    expect(toHex(a.slice(42, 54))).not.toBe(toHex(b.slice(42, 54)));
  });

  it('wrong password and every single-byte tamper fail with the identical error', async () => {
    const d = deps();
    const blob = await sealed(d);
    const wrong = await code(open(d, blob, 'wrong password!!', 'profile'));
    expect(wrong).toBe('DECRYPT_FAILED:unable to decrypt: wrong password or data was modified');
    // flip a bit in salt/nonce/ciphertext/tag/profile-id region (header structure bytes 0..9 are CORRUPT instead)
    for (let i = 10; i < blob.length; i++) {
      const t = new Uint8Array(blob);
      t[i] = (t[i] ?? 0) ^ 0x01;
      expect(await code(open(d, t, PW, 'profile'))).toBe(wrong);
    }
  });

  it('rejects structural problems distinctly and before the KDF', async () => {
    const d = deps();
    const blob = await sealed(d);
    expect(await code(open(d, blob.slice(0, MIN_BLOB_BYTES - 1), PW, 'profile'))).toMatch(/^CORRUPT/);
    expect(await code(open(d, new Uint8Array(MIN_BLOB_BYTES + 1), PW, 'profile'))).toMatch(
      /^CORRUPT:bad magic/,
    );
    const ver = new Uint8Array(blob);
    ver[4] = 2;
    expect(await code(open(d, ver, PW, 'profile'))).toMatch(/^UNSUPPORTED_VERSION/);
    ver[4] = 0;
    expect(await code(open(d, ver, PW, 'profile'))).toMatch(/^CORRUPT/);
    expect(await code(open(d, blob, PW, 'backup'))).toMatch(/^CORRUPT:unexpected envelope purpose/);
    const lowIter = new Uint8Array(blob);
    new DataView(lowIter.buffer).setUint32(6, 999, false);
    expect(await code(open(d, lowIter, PW, 'profile'))).toMatch(/^CORRUPT:kdf/);
    const hugeIter = new Uint8Array(blob);
    new DataView(hugeIter.buffer).setUint32(6, 4_000_000_000, false);
    expect(await code(open(d, hugeIter, PW, 'profile'))).toMatch(/^CORRUPT:kdf/);
    expect(await code(open(d, 'x' as unknown as Uint8Array, PW, 'profile'))).toMatch(/^INVALID_INPUT/);
    expect(
      await code(open(d, { length: MAX_BLOB_BYTES + 1 } as unknown as Uint8Array, PW, 'profile')),
    ).toMatch(/^INVALID_INPUT|^LIMIT/);
    expect(() => parseHeader(d, new Uint8Array(MAX_BLOB_BYTES + 1), 'profile')).toThrow(/too large/);
  });

  it('header iteration count is authenticated (downgrade within policy still fails)', async () => {
    const d: CryptoDeps = { ...deps(), kdf: { iterations: 1000, minIterations: 1 } };
    const blob = await sealed(d);
    const t = new Uint8Array(blob);
    new DataView(t.buffer).setUint32(6, 500, false);
    expect(await code(open(d, t, PW, 'profile'))).toMatch(/^DECRYPT_FAILED/);
  });

  it('derived keys are not extractable', async () => {
    const ctx = await newKeyContext(deps(), PW, ID, 'profile');
    await expect(globalThis.crypto.subtle.exportKey('raw', ctx.key)).rejects.toThrow();
    expect(ctx.key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  });

  it('matches a known PBKDF2/AES-GCM vector computed independently with node:crypto', async () => {
    const { pbkdf2Sync, createDecipheriv } = await import('node:crypto');
    const d = deps(9);
    const blob = await sealed(d, 'vector');
    const key = pbkdf2Sync(Buffer.from(PW), Buffer.from(blob.slice(26, 42)), 1000, 32, 'sha256');
    const dec = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.slice(42, 54)));
    dec.setAAD(Buffer.from(blob.slice(0, 42)));
    dec.setAuthTag(Buffer.from(blob.slice(blob.length - 16)));
    const pt = Buffer.concat([dec.update(Buffer.from(blob.slice(54, blob.length - 16))), dec.final()]);
    expect(pt.toString()).toBe('vector');
  });

  it('password rules and policy validation', () => {
    expect(() => normalizeNewPassword('short')).toThrow(/at least 10/);
    expect(() => normalizeNewPassword('')).toThrow(/invalid length/);
    expect(() => normalizeNewPassword('a'.repeat(1025))).toThrow(/invalid length/);
    expect(normalizeNewPassword('ｐａｓｓｗｏｒｄ１２３')).toBe('password123');
    expect(() => checkPolicy({ iterations: 0, minIterations: 0 })).toThrow();
    expect(() => checkPolicy({ iterations: 10, minIterations: 20 })).toThrow();
    expect(() => checkPolicy({ iterations: 20_000_000, minIterations: 1 })).toThrow();
    expect(() => checkPolicy(DEFAULT_KDF)).not.toThrow();
    expect(DEFAULT_KDF.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it('rejects a misbehaving rng and bad profile ids', async () => {
    const bad: CryptoDeps = { ...deps(), rng: () => new Uint8Array(3) };
    expect(() => randomBytes(bad, 16)).toThrow(/wrong length/);
    await expect(newKeyContext(bad, PW, ID, 'profile')).rejects.toThrow();
    await expect(newKeyContext(deps(), PW, 'zz', 'profile')).rejects.toThrow();
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('AB')).toThrow();
  });

  it('default deps use real randomness', () => {
    const d = defaultCryptoDeps();
    expect(toHex(d.rng(16))).not.toBe(toHex(d.rng(16)));
    expect(d.kdf).toBe(DEFAULT_KDF);
  });

  it('property: arbitrary plaintext round-trips; arbitrary wrong password never opens', async () => {
    const d = deps(3);
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 300 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (pt, pw) => {
          const ctx = await newKeyContext(d, 'base-password-1', ID, 'profile');
          const blob = await seal(d, ctx, pt);
          expect([...(await open(d, blob, 'base-password-1', 'profile')).plaintext]).toEqual([...pt]);
          if (pw.normalize('NFKC') !== 'base-password-1') {
            await expect(open(d, blob, pw.normalize('NFKC'), 'profile')).rejects.toMatchObject({
              code: 'DECRYPT_FAILED',
            });
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('property: base64url round-trips and rejects junk', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), (b) => {
        expect([...fromBase64Url(toBase64Url(b))]).toEqual([...b]);
      }),
    );
    expect(() => fromBase64Url('ab=')).toThrow();
    expect(() => fromBase64Url('a')).toThrow();
    expect(() => fromBase64Url('a b')).toThrow();
    expect(() => utf8Decode(new Uint8Array([0xff, 0xfe]))).toThrow(/utf-8/);
  });
});
