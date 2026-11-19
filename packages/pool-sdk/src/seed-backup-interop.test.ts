import { createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { exportSeedEncrypted, importSeedEncrypted } from './store.js';

const PASSWORD = 'Ｑuartz lantern velvet orbit 739!';
const SEED = new Uint8Array(32).fill(7);

function legacyBackup(password: string, seed: Uint8Array = SEED): string {
  const salt = Buffer.alloc(16, 2);
  const iv = Buffer.alloc(12, 3);
  const key = scryptSync(password, salt, 32, { N: 1 << 10, r: 8, p: 1 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('ghostpay/pool-notes/v1'));
  const ct = Buffer.concat([cipher.update(seed), cipher.final(), cipher.getAuthTag()]);
  key.fill(0);
  return JSON.stringify({ v: 1, logN: 10, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') });
}

describe('seed backup independent cryptographic compatibility', () => {
  it.each([16, 31, 33, 64, 512])('preserves supported legacy seeds with %s bytes', async (length) => {
    const bytes = new Uint8Array(length).fill(7);
    const restored = await importSeedEncrypted(legacyBackup(PASSWORD, bytes), PASSWORD);
    try { expect(restored.use((seed) => Array.from(seed))).toEqual(Array.from(bytes)); } finally { restored.dispose(); }
  });

  it.each([16, 31, 33, 64, 512])('continues backing up supported seeds with %s bytes', async (length) => {
    const bytes = new Uint8Array(length).fill(7);
    const backup = await exportSeedEncrypted((f) => f(bytes), PASSWORD, { logN: 14 });
    const restored = await importSeedEncrypted(backup, PASSWORD);
    try { expect(restored.use((seed) => Array.from(seed))).toEqual(Array.from(bytes)); } finally { restored.dispose(); }
  });

  it('opens legacy node:crypto data with its exact original password and rejects a normalized substitute', async () => {
    const backup = legacyBackup(PASSWORD);
    const restored = await importSeedEncrypted(backup, PASSWORD);
    try { expect(restored.use((bytes) => Array.from(bytes))).toEqual(Array.from(SEED)); } finally { restored.dispose(); }
    await expect(importSeedEncrypted(backup, PASSWORD.normalize('NFKC'))).rejects.toMatchObject({ code: 'STORE_CORRUPT' });
  });

  it('retains recovery of legacy short passwords instead of applying new export strength policy to old data', async () => {
    const restored = await importSeedEncrypted(legacyBackup('old-pass'), 'old-pass');
    try { expect(restored.use((bytes) => Array.from(bytes))).toEqual(Array.from(SEED)); } finally { restored.dispose(); }
  });

  it('produces v2 data independently decryptable with node:crypto and normalized password bytes', async () => {
    const text = await exportSeedEncrypted((f) => f(SEED), PASSWORD, { logN: 14 });
    const envelope = JSON.parse(text) as { v: number; logN: number; salt: string; iv: string; ct: string };
    expect(envelope.v).toBe(2);
    const key = scryptSync(PASSWORD.normalize('NFKC'), Buffer.from(envelope.salt, 'base64'), 32, { N: 2 ** envelope.logN, r: 8, p: 1, maxmem: 2 ** 29 });
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(JSON.stringify(['ghostpay/pool-seed/v2', envelope.logN, envelope.salt, envelope.iv])));
    const ciphertext = Buffer.from(envelope.ct, 'base64');
    decipher.setAuthTag(ciphertext.subarray(-16));
    const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    try { expect(Array.from(plaintext)).toEqual(Array.from(SEED)); } finally { plaintext.fill(0); key.fill(0); }
    const restored = await importSeedEncrypted(text, PASSWORD.normalize('NFKC'));
    restored.dispose();
  });
});
