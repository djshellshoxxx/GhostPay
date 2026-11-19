import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSeedEncrypted, importSeedEncrypted } from './store.js';

// Observe KDF admission without allocating an attacker-requested gigabyte in the regression itself.
const observed = vi.hoisted(() => ({ calls: [] as { password: string; N: number; maxmem?: number; raw: Uint8Array }[] }));
vi.mock('@noble/hashes/scrypt.js', async (original) => {
  const real = await original<typeof import('@noble/hashes/scrypt.js')>();
  const derive = (password: Uint8Array, _salt: Uint8Array, options: { N: number; maxmem?: number }): Uint8Array => {
    const raw = new Uint8Array(32).fill(42);
    observed.calls.push({ password: new TextDecoder().decode(password), N: options.N, ...(options.maxmem === undefined ? {} : { maxmem: options.maxmem }), raw });
    return raw;
  };
  return { ...real, scrypt: derive, scryptAsync: (...args: Parameters<typeof derive>) => Promise.resolve(derive(...args)) };
});

const PASSWORD = 'quartz lantern velvet orbit 739!';
const seed = <T>(f: (bytes: Uint8Array) => T): T => f(new Uint8Array(32).fill(7));
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
async function legacy(length = 32): Promise<Record<string, unknown>> {
  const iv = new Uint8Array(12);
  const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(42), 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('ghostpay/pool-notes/v1') }, key, new Uint8Array(length).fill(7));
  return { v: 1, logN: 10, salt: b64(new Uint8Array(16)), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

beforeEach(() => { observed.calls.length = 0; });

describe('SEC-16 seed backup bounds and policy', () => {
  it.each(['12345678', 'abcdefghijklm', 'aaaaaaaaaaaaaa', 'GhostPay2026!!!'])('rejects a weak new export before KDF work', async (password) => {
    await expect(exportSeedEncrypted(seed, password)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(observed.calls).toHaveLength(0);
  });

  it('writes a versioned seed envelope using the keystore default and explicit memory cap', async () => {
    const backup = JSON.parse(await exportSeedEncrypted(seed, PASSWORD)) as Record<string, unknown>;
    expect(backup['v']).toBe(2);
    expect(backup['logN']).toBe(17);
    expect(observed.calls[0]).toMatchObject({ N: 1 << 17, maxmem: 2 ** 29 });
    expect(observed.calls[0]?.raw.every((byte) => byte === 0)).toBe(true);
  });

  it.each([9, 13, 19, 20, 14.5, NaN, Infinity])('refuses unsafe export cost %s before the KDF', async (logN) => {
    await expect(exportSeedEncrypted(seed, PASSWORD, { logN })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(observed.calls).toHaveLength(0);
  });

  it.each([19, 20, 10.5, -1])('refuses malicious legacy cost %s before the KDF', async (logN) => {
    await expect(importSeedEncrypted(JSON.stringify({ ...await legacy(), logN }), PASSWORD)).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    expect(observed.calls).toHaveLength(0);
  });

  it('rejects malformed or oversized fields before the KDF', async () => {
    const valid = await legacy();
    for (const delta of [{ salt: 'A'.repeat(4096) }, { salt: `${String(valid['salt'])}\n` }, { iv: b64(new Uint8Array(11)) }, { ct: b64(new Uint8Array(31)) }, { ct: b64(new Uint8Array(529)) }, { extra: true }]) {
      await expect(importSeedEncrypted(JSON.stringify({ ...valid, ...delta }), PASSWORD)).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
      expect(observed.calls).toHaveLength(0);
    }
  });

  it.each([0, 15, 513])('refuses legacy plaintext outside the seed bounds (%s bytes)', async (length) => {
    await expect(importSeedEncrypted(JSON.stringify(await legacy(length)), PASSWORD)).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    expect(observed.calls).toHaveLength(0);
  });

  it('normalizes only v2 password bytes and retains exact legacy behavior', async () => {
    const password = `Ｑ${PASSWORD}`;
    const current = await exportSeedEncrypted(seed, password, { logN: 14 });
    expect(observed.calls[0]?.password).toBe(password.normalize('NFKC'));
    const restored = await importSeedEncrypted(current, password);
    restored.dispose();
    expect(observed.calls[1]?.password).toBe(password.normalize('NFKC'));
    const old = await importSeedEncrypted(JSON.stringify(await legacy()), password);
    old.dispose();
    expect(observed.calls[2]?.password).toBe(password);
  });

  it('authenticates version, cost and salt even if the KDF returns the same key', async () => {
    const backup = JSON.parse(await exportSeedEncrypted(seed, PASSWORD, { logN: 14 })) as Record<string, unknown>;
    for (const delta of [{ v: 1 }, { logN: 15 }, { salt: b64(new Uint8Array(16).fill(1)) }]) {
      await expect(importSeedEncrypted(JSON.stringify({ ...backup, ...delta }), PASSWORD)).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
    }
  });
});
