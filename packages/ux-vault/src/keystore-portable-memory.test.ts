import { encodeMetaAddress, parseCompressedPoint } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeystoreApi } from './keystore-portable.js';

vi.mock('@noble/hashes/scrypt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@noble/hashes/scrypt.js')>();
  return { ...actual, scryptAsync: vi.fn(actual.scryptAsync) };
});

const api = createKeystoreApi();
const kdf = vi.mocked(scryptAsync);
const secrets = () => ({ spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) });
const meta = {
  metaAddress: encodeMetaAddress({
    spendingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(secrets().spendingKey)),
    viewingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(secrets().viewingKey)),
  }),
  signer: Buffer.from(secp256k1.getPublicKey(secrets().signingKey)).toString('hex'),
};
const passphrase = 'violet comet maple lantern';
const fast = { N: 1 << 14 };

function passBytes(index = 0): Uint8Array {
  const input = kdf.mock.calls[index]?.[0];
  expect(input).toBeInstanceOf(Uint8Array);
  return input as Uint8Array;
}

afterEach(() => { vi.restoreAllMocks(); kdf.mockClear(); });

describe('portable keystore temporary passphrase bytes', () => {
  it('wipes KDF input after real encryption and decryption without changing the format', async () => {
    const encoded = await api.encryptKeystore(secrets(), meta, passphrase, fast);
    expect(passBytes().every((byte) => byte === 0)).toBe(true);
    const restored = await api.decryptKeystore(encoded, passphrase);
    expect(restored).toEqual(secrets());
    expect(passBytes(1).every((byte) => byte === 0)).toBe(true);
    expect((JSON.parse(encoded) as { v: number }).v).toBe(1);
  });

  it('wipes the KDF input when derivation rejects', async () => {
    kdf.mockRejectedValueOnce(new Error('synthetic KDF rejection'));
    await expect(api.encryptKeystore(secrets(), meta, passphrase, fast)).rejects.toThrow('synthetic KDF rejection');
    expect(passBytes().every((byte) => byte === 0)).toBe(true);
  });

  it('wipes the KDF input and derived bytes when key import rejects', async () => {
    const raw = new Uint8Array(32).fill(7);
    kdf.mockResolvedValueOnce(raw);
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(new Error('synthetic key import rejection'));
    await expect(api.encryptKeystore(secrets(), meta, passphrase, fast)).rejects.toThrow('synthetic key import rejection');
    expect(passBytes().every((byte) => byte === 0)).toBe(true);
    expect(raw.every((byte) => byte === 0)).toBe(true);
  });

  it('retains the normalized bytes until asynchronous derivation finishes', async () => {
    let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => { throw new Error('KDF not started'); };
    kdf.mockImplementationOnce(() => new Promise<Uint8Array<ArrayBuffer>>((resolve) => { finish = resolve; }));
    const pending = api.encryptKeystore(secrets(), meta, passphrase, fast);
    expect(new TextDecoder().decode(passBytes())).toBe(passphrase.normalize('NFKC'));
    const raw = new Uint8Array(32).fill(7);
    finish(raw);
    await pending;
    expect(passBytes().every((byte) => byte === 0)).toBe(true);
    expect(raw.every((byte) => byte === 0)).toBe(true);
  });
});
