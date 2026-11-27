import { scryptAsync } from '@noble/hashes/scrypt.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTagArchiveApi } from './tag-archive-portable.js';

vi.mock('@noble/hashes/scrypt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@noble/hashes/scrypt.js')>();
  return { ...actual, scryptAsync: vi.fn(actual.scryptAsync) };
});

const api = createTagArchiveApi();
const kdf = vi.mocked(scryptAsync);
const passphrase = 'violet comet maple lantern';
const contents = { createdAt: 1, keyVersion: 1, records: [], history: {} };
const fast = { N: 1 << 14 };

function passBytes(index = 0): Uint8Array {
  const input = kdf.mock.calls[index]?.[0];
  expect(input).toBeInstanceOf(Uint8Array);
  return input as Uint8Array;
}
const wiped = (bytes: Uint8Array): boolean => bytes.every((byte) => byte === 0);

afterEach(() => { vi.restoreAllMocks(); kdf.mockClear(); });

describe('tag archive temporary passphrase bytes', () => {
  it('wipes the KDF input after real encryption and decryption without changing the format', async () => {
    const archive = await api.encodeArchive(contents, passphrase, fast);
    expect(wiped(passBytes())).toBe(true);
    await expect(api.decodeArchive(archive, passphrase)).resolves.toMatchObject({ createdAt: 1, keyVersion: 1 });
    expect(wiped(passBytes(1))).toBe(true);
    expect(new TextDecoder().decode(archive.subarray(0, 4))).toBe(api.ARCHIVE_MAGIC);
  });

  it('wipes the KDF input when derivation rejects', async () => {
    kdf.mockRejectedValueOnce(new Error('synthetic KDF rejection'));
    await expect(api.encodeArchive(contents, passphrase, fast)).rejects.toThrow('synthetic KDF rejection');
    expect(wiped(passBytes())).toBe(true);
  });

  it('keeps the normalized bytes until asynchronous derivation finishes, then wipes them and the derived bytes', async () => {
    let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => { throw new Error('KDF not started'); };
    kdf.mockImplementationOnce(() => new Promise<Uint8Array<ArrayBuffer>>((resolve) => { finish = resolve; }));
    const pending = api.encodeArchive(contents, passphrase, fast);
    await vi.waitFor(() => { expect(kdf).toHaveBeenCalled(); });
    expect(new TextDecoder().decode(passBytes())).toBe(passphrase.normalize('NFKC'));
    const raw = new Uint8Array(32).fill(7);
    finish(raw);
    await pending;
    expect(wiped(passBytes())).toBe(true);
    expect(wiped(raw)).toBe(true);
  });
});
