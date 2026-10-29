import { describe, expect, it, vi } from 'vitest';
import { encodeMetaAddress, parseCompressedPoint } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { DEFAULT_SCRYPT, decryptKeystore, encryptKeystore, generatePassphrase, GENERATED_PASSPHRASE_BITS, GENERATED_PASSPHRASE_WORDS, PASSPHRASE_WORDS, passphraseProblem, passphraseStrength } from './keystore';

const META = { metaAddress: encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(new Uint8Array(32).fill(1))), viewingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(new Uint8Array(32).fill(2))) }), signer: Buffer.from(secp256k1.getPublicKey(new Uint8Array(32).fill(3))).toString('hex') };
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
    f.meta.metaAddress = 'st:eth:0x' + META.metaAddress.slice(75) + META.metaAddress.slice(9, 75);
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

  it('rejects unknown envelope, KDF and metadata fields before derivation', async () => {
    const text = await encryptKeystore(secrets(), META, 'correct horse battery', FAST);
    for (const field of ['root', 'kdfParams', 'meta']) {
      const file = JSON.parse(text) as Record<string, unknown>;
      const target = field === 'root' ? file : file[field] as Record<string, unknown>;
      target['extra'] = 'not allowed';
      await expect(decryptKeystore(JSON.stringify(file), 'correct horse battery')).rejects.toThrow(/not a valid/);
    }
    await expect(decryptKeystore(text.replace('"v": 1', '"v": 1, "v": 1'), 'correct horse battery')).rejects.toThrow(/not a valid/);
  });

  it('rejects authenticated public metadata that differs from the decrypted keys', async () => {
    const alternate = { ...META, signer: Buffer.from(secp256k1.getPublicKey(new Uint8Array(32).fill(4))).toString('hex') };
    const text = await encryptKeystore(secrets(), alternate, 'correct horse battery', FAST);
    await expect(decryptKeystore(text, 'correct horse battery')).rejects.toThrow(/metadata|not a valid/);
  });

  it('rejects a decrypted body with malformed keys', async () => {
    const text = await encryptKeystore({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(31) }, META, 'correct horse battery', FAST);
    await expect(decryptKeystore(text, 'correct horse battery')).rejects.toThrow(/not a valid|different length/i);
  });
});

describe('L1-06: guessable passphrases', () => {
  it('rejects repeated halves, padded seasons and years, keyboard walks and the app name', () => {
    for (const guessable of ['ghostpayghostpay', 'Summer2026!!!!!', 'qazwsxedcrfvtgb', 'ghostpay-vault-1', 'Bitcoin2026Bitcoin', 'P@ssw0rd2026!!!', '1qaz2wsx3edc4rfv', 'abcdefghijklmnop']) {
      expect({ guessable, strength: passphraseStrength(guessable) }).toMatchObject({ strength: { score: 1, label: 'weak' } });
      expect(passphraseProblem(guessable)).toMatch(/too easy to guess/);
    }
  });

  it('still accepts unrelated words and keeps their rating', () => {
    expect(passphraseStrength('violet comet maple lantern').label).toBe('strong');
    expect(passphraseStrength('cedar orbit velvet lantern meadow').label).toBe('strong');
    expect(passphraseProblem('river copper maple starlight')).toBeUndefined();
    expect(passphraseProblem('correct horse battery')).toBeUndefined();
  });
});

describe('L1-06: generated passphrases', () => {
  it('bundles 1024 distinct short lower-case words, none of them a listed weak word', () => {
    expect(PASSPHRASE_WORDS).toHaveLength(1024);
    expect(new Set(PASSPHRASE_WORDS).size).toBe(1024);
    expect(PASSPHRASE_WORDS.every((w) => /^[a-z]{4,8}$/.test(w))).toBe(true);
    expect(GENERATED_PASSPHRASE_BITS).toBe(60);
  });

  it('picks six words with crypto.getRandomValues and always offers an accepted, strong passphrase', () => {
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues');
    try {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const phrase = generatePassphrase();
        const words = phrase.split('-');
        expect(words).toHaveLength(GENERATED_PASSPHRASE_WORDS);
        expect(words.every((w) => PASSPHRASE_WORDS.includes(w))).toBe(true);
        expect(passphraseProblem(phrase)).toBeUndefined();
        expect(passphraseStrength(phrase).label).toBe('strong');
        seen.add(phrase);
      }
      expect(seen.size).toBe(200);
      expect(random).toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('maps each 16-bit draw to a word without bias and redraws a passphrase the estimator would refuse', () => {
    const draws = [new Uint8Array(12), Uint8Array.from([0x00, 0x00, 0x04, 0x01, 0xff, 0xff, 0x80, 0x02, 0x12, 0x34, 0x03, 0xff])];
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      (array as unknown as Uint8Array).set(draws.shift() ?? new Uint8Array(12));
      return array;
    });
    try {
      // The first draw is "acorn" six times (rejected); the second maps 0x0000, 0x0401, 0xffff, 0x8002, 0x1234, 0x03ff mod 1024.
      expect(generatePassphrase()).toBe([0, 1, 1023, 2, 0x234, 1023].map((i) => PASSPHRASE_WORDS[i]).join('-'));
      expect(random).toHaveBeenCalledTimes(2);
    } finally { random.mockRestore(); }
  });
});
