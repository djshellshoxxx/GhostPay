import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRYPT, decryptKeystore, encryptKeystore, passphraseProblem } from './keystore';

const META = { metaAddress: 'st:eth:0xabc', signer: '02' + 'ab'.repeat(32) };
const secrets = () => ({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) });
const FAST = { N: 1 << 14 };

describe('keystore', () => {
  it('pins the documented scrypt parameters', () => {
    expect(DEFAULT_SCRYPT).toEqual({ N: 131072, r: 8, p: 1 });
  });

  it('round-trips and writes versioned JSON without plaintext keys', async () => {
    const text = await encryptKeystore(secrets(), META, 'correct horse battery', FAST);
    const file = JSON.parse(text) as Record<string, unknown>;
    expect(file['v']).toBe(1);
    expect(file['cipher']).toBe('AES-256-GCM');
    expect(text).not.toContain('0101010101');
    const back = await decryptKeystore(text, 'correct horse battery');
    expect(Array.from(back.spendingKey)).toEqual(Array.from(secrets().spendingKey));
    expect(Array.from(back.viewingKey)).toEqual(Array.from(secrets().viewingKey));
    expect(Array.from(back.signingKey)).toEqual(Array.from(secrets().signingKey));
  });

  it('uses the production cost by default', async () => {
    const text = await encryptKeystore(secrets(), META, 'correct horse battery');
    expect((JSON.parse(text) as { kdfParams: { N: number } }).kdfParams.N).toBe(1 << 17);
    expect((await decryptKeystore(text, 'correct horse battery')).spendingKey[0]).toBe(1);
  }, 120_000);

  it('produces different ciphertext each time (fresh salt and IV)', async () => {
    const a = await encryptKeystore(secrets(), META, 'correct horse battery', FAST);
    const b = await encryptKeystore(secrets(), META, 'correct horse battery', FAST);
    expect(a).not.toBe(b);
  });

  it('rejects a wrong passphrase', async () => {
    const text = await encryptKeystore(secrets(), META, 'correct horse battery', FAST);
    await expect(decryptKeystore(text, 'wrong passphrase!!')).rejects.toThrow(/Wrong passphrase/);
  });

  it('rejects tampered public metadata (it is authenticated)', async () => {
    const f = JSON.parse(await encryptKeystore(secrets(), META, 'correct horse battery', FAST)) as { meta: { metaAddress: string } };
    f.meta.metaAddress = 'st:eth:0xdef';
    await expect(decryptKeystore(JSON.stringify(f), 'correct horse battery')).rejects.toThrow(/Wrong passphrase|modified/);
  });

  it('rejects tampered ciphertext', async () => {
    const f = JSON.parse(await encryptKeystore(secrets(), META, 'correct horse battery', FAST)) as { ciphertext: string };
    f.ciphertext = (f.ciphertext.startsWith('0') ? '1' : '0') + f.ciphertext.slice(1);
    await expect(decryptKeystore(JSON.stringify(f), 'correct horse battery')).rejects.toThrow();
  });

  it('refuses short passphrases and bad costs on export', async () => {
    expect(passphraseProblem('short')).toMatch(/at least/);
    expect(passphraseProblem('long enough passphrase')).toBeUndefined();
    await expect(encryptKeystore(secrets(), META, 'short')).rejects.toThrow(/at least/);
    await expect(encryptKeystore(secrets(), META, 'long enough passphrase', { N: 1000 })).rejects.toThrow(/scrypt cost/);
    await expect(encryptKeystore(secrets(), META, 'long enough passphrase', { N: 1 << 21 })).rejects.toThrow(/scrypt cost/);
  });

  it('validates structure strictly on import (no attacker-chosen cost)', async () => {
    const good = JSON.parse(await encryptKeystore(secrets(), META, 'correct horse battery', FAST)) as Record<string, unknown>;
    const kp = (f: Record<string, unknown>): Record<string, unknown> => f['kdfParams'] as Record<string, unknown>;
    const meta = (f: Record<string, unknown>): Record<string, unknown> => f['meta'] as Record<string, unknown>;
    const bad = (mut: (f: Record<string, unknown>) => void): Promise<unknown> => {
      const f = structuredClone(good);
      mut(f);
      return decryptKeystore(JSON.stringify(f), 'correct horse battery');
    };
    await expect(decryptKeystore('not json', 'x')).rejects.toThrow(/not a valid/);
    await expect(decryptKeystore('x'.repeat(9000), 'x')).rejects.toThrow(/not a valid/);
    await expect(decryptKeystore('[]', 'x')).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { f['v'] = 2; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { f['kdf'] = 'pbkdf2'; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { kp(f)['N'] = 1 << 30; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { kp(f)['N'] = 3; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { kp(f)['r'] = 0; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { kp(f)['p'] = 99; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { kp(f)['salt'] = 'zz'; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { f['iv'] = 'aa'; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { f['meta'] = 5; })).rejects.toThrow(/not a valid/);
    await expect(bad((f) => { meta(f)['signer'] = 5; })).rejects.toThrow(/not a valid/);
  });

  it('rejects a decrypted body with malformed keys', async () => {
    const text = await encryptKeystore({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(31) }, META, 'correct horse battery', FAST);
    await expect(decryptKeystore(text, 'correct horse battery')).rejects.toThrow(/not a valid|different length/i);
  });
});

describe('keystore import hardening (round 4)', () => {
  const good = async (): Promise<Record<string, unknown>> => JSON.parse(await encryptKeystore(secrets(), META, 'correct horse battery', FAST)) as Record<string, unknown>;
  const kp = (f: Record<string, unknown>): Record<string, unknown> => f['kdfParams'] as Record<string, unknown>;

  it('rejects scrypt parameters outside the allowlist before running scrypt (KL-13, S3-13, F9)', async () => {
    const f = await good();
    for (const mut of [
      (x: Record<string, unknown>) => { kp(x)['N'] = 1 << 20; },
      (x: Record<string, unknown>) => { kp(x)['N'] = 1 << 19; },
      (x: Record<string, unknown>) => { kp(x)['r'] = 16; },
      (x: Record<string, unknown>) => { kp(x)['r'] = 9; },
      (x: Record<string, unknown>) => { kp(x)['p'] = 2; },
    ]) {
      const c = structuredClone(f);
      mut(c);
      const t0 = Date.now();
      await expect(decryptKeystore(JSON.stringify(c), 'correct horse battery')).rejects.toThrow(/not a valid/);
      expect(Date.now() - t0).toBeLessThan(100);
    }
  });

  it('refuses to write a keystore above the import cost cap', async () => {
    await expect(encryptKeystore(secrets(), META, 'long enough passphrase', { N: 1 << 19 })).rejects.toThrow(/scrypt cost/);
  });

  it('accepts only the documented fields (allowlist), rejecting unknown keys at every level', async () => {
    const f = await good();
    for (const mut of [
      (x: Record<string, unknown>) => { x['extra'] = 1; },
      (x: Record<string, unknown>) => { kp(x)['dkLen'] = 64; },
      (x: Record<string, unknown>) => { (x['meta'] as Record<string, unknown>)['note'] = 'x'; },
      (x: Record<string, unknown>) => { (x['meta'] as Record<string, unknown>)['signer'] = '04' + 'ab'.repeat(32); },
      (x: Record<string, unknown>) => { (x['meta'] as Record<string, unknown>)['metaAddress'] = 'st:eth:0xabc|x'; },
    ]) {
      const c = structuredClone(f);
      mut(c);
      await expect(decryptKeystore(JSON.stringify(c), 'correct horse battery')).rejects.toThrow(/not a valid/);
    }
    expect((await decryptKeystore(JSON.stringify(f), 'correct horse battery')).viewingKey[0]).toBe(2);
  });

  it('requires at least 12 code points and some variety for a new passphrase (KL-14, L2)', () => {
    expect(passphraseProblem('elevenchars')).toMatch(/at least 12/);
    expect(passphraseProblem('twelve chars')).toBeUndefined();
    expect(passphraseProblem('\u{1F511}'.repeat(5) + 'abcdefg')).toBeUndefined();
    expect(passphraseProblem('\u{1F511}'.repeat(6))).toMatch(/at least 12/);
    expect(passphraseProblem('aaaaaaaaaaaaaaaa')).toMatch(/repetitive/);
    expect(passphraseProblem('abababababababab')).toMatch(/repetitive/);
  });

  it('still imports a keystore whose passphrase predates the 12-character rule', async () => {
    // The strength rule applies to new exports only; older files keep working.
    const f = await good();
    expect(f['v']).toBe(1);
    await expect(decryptKeystore(JSON.stringify(f), 'short')).rejects.toThrow(/Wrong passphrase/);
  });
});
