import { describe, expect, it } from 'vitest';
import { resolveKey, type CryptoLike } from './seal.js';

const c = globalThis.crypto as CryptoLike;

/** Regression: a record with key-looking fields is not a WebCrypto CryptoKey. */
describe('resolveKey native CryptoKey boundary', () => {
  it('rejects an ordinary object with copied AES-GCM key metadata', async () => {
    const fake = {
      type: 'secret',
      algorithm: { name: 'AES-GCM', length: 256 },
      usages: ['encrypt', 'decrypt'],
    };
    expect(await resolveKey(fake as never, c)).toMatchObject({
      ok: false,
      error: { code: 'bad-key' },
    });
  });

  it('rejects a key-shaped object with a spoofed toStringTag', async () => {
    const fake = {
      type: 'secret',
      algorithm: { name: 'AES-GCM', length: 256 },
      usages: ['encrypt', 'decrypt'],
      [Symbol.toStringTag]: 'CryptoKey',
    };
    expect(await resolveKey(fake as never, c)).toMatchObject({
      ok: false,
      error: { code: 'bad-key' },
    });
  });

  it('rejects a forged CryptoKey-prototype object without native key slots', async () => {
    const fake = Object.create(CryptoKey.prototype) as Record<string, unknown>;
    Object.defineProperties(fake, {
      type: { value: 'secret' },
      algorithm: { value: { name: 'AES-GCM', length: 256 } },
      usages: { value: ['encrypt', 'decrypt'] },
    });
    expect(fake instanceof CryptoKey).toBe(true); // instanceof alone is insufficient.
    expect(await resolveKey(fake as never, c)).toMatchObject({
      ok: false,
      error: { code: 'bad-key' },
    });
  });

  it('preserves genuine non-extractable AES-GCM-256 keys', async () => {
    const key = await c.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    expect(await resolveKey(key, c)).toEqual({ ok: true, value: key });
  });
});
