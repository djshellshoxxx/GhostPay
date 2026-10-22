import { afterEach, describe, expect, it, vi } from 'vitest';

const passwords: Uint8Array[] = [];
const decoded: Uint8Array[] = [];
vi.mock('@noble/hashes/scrypt.js', async (orig) => {
  const m = await orig<typeof import('@noble/hashes/scrypt.js')>();
  return {
    ...m,
    scryptAsync: (pw: Uint8Array, ...rest: Parameters<typeof m.scryptAsync> extends [unknown, ...infer R] ? R : never) => {
      passwords.push(pw);
      return m.scryptAsync(pw, ...rest);
    },
  };
});
vi.mock('@noble/hashes/utils.js', async (orig) => {
  const m = await orig<typeof import('@noble/hashes/utils.js')>();
  return {
    ...m,
    hexToBytes: (h: string) => {
      const r = m.hexToBytes(h);
      decoded.push(r);
      return r;
    },
  };
});

import { decryptKeystore, encryptKeystore } from './keystore';

const META = { metaAddress: 'st:eth:0xabc', signer: '02' + 'ab'.repeat(32) };
const FAST = { N: 1 << 14 };

afterEach(() => {
  passwords.length = 0;
  decoded.length = 0;
});

describe('keystore zeroization (KL-24)', () => {
  it('wipes the passphrase bytes fed to scrypt on export and import', async () => {
    const text = await encryptKeystore({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) }, META, 'correct horse battery', FAST);
    await decryptKeystore(text, 'correct horse battery');
    expect(passwords).toHaveLength(2);
    for (const p of passwords) {
      expect(p.length).toBeGreaterThan(0);
      expect(p.every((b) => b === 0)).toBe(true);
    }
  });

  it('wipes the passphrase bytes when the passphrase is wrong', async () => {
    const text = await encryptKeystore({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) }, META, 'correct horse battery', FAST);
    passwords.length = 0;
    await expect(decryptKeystore(text, 'wrong passphrase!!')).rejects.toThrow(/Wrong passphrase/);
    expect(passwords).toHaveLength(1);
    expect(passwords[0]!.every((b) => b === 0)).toBe(true);
  });

  it('wipes keys already decoded when a later key in the body is malformed', async () => {
    const text = await encryptKeystore({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(31).fill(3) }, META, 'correct horse battery', FAST);
    decoded.length = 0;
    await expect(decryptKeystore(text, 'correct horse battery')).rejects.toThrow(/not a valid/);
    const keys = decoded.filter((b) => b.length === 32);
    expect(keys.length).toBe(2);
    for (const k of keys) expect(k.every((b) => b === 0)).toBe(true);
  });
});
