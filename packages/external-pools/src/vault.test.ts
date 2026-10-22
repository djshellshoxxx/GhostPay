import { describe, expect, it } from 'vitest';
import { MemoryVaultStorage, Vault, computeNoteId, roundToHour } from './vault.js';
import { D1, S1 } from './testkit.js';
import type { PoolNote } from './types.js';

const KDF = { N: 1 << 14, r: 8, p: 1 };
const PASS = 'correct horse battery';
const CANARY = 'CANARY-SECRET-0xDEADBEEF';

const note = (over: Partial<PoolNote> = {}): PoolNote => ({
  noteId: computeNoteId('mock-pool', 31337, '0x01', 0),
  routeId: 'mock-pool',
  chainId: 31337,
  asset: 'native',
  depositedAmount: 12345678901234567890n,
  depositor: S1,
  depositTx: '0x01',
  depositBlock: 7n,
  state: 'confirmed',
  adapterData: new TextEncoder().encode(CANARY),
  createdAt: 7 * 3600 + 1234,
  ...over,
});

async function fresh(): Promise<{ s: MemoryVaultStorage; v: Vault }> {
  const s = new MemoryVaultStorage();
  return { s, v: await Vault.create(s, PASS, KDF) };
}

describe('Vault (EP-VAULT-1..6)', () => {
  it('round-trips notes with bigint and bytes, rounds createdAt, and never stores plaintext', async () => {
    const { s, v } = await fresh();
    await v.putNote(note());
    const n = await v.getNote(note().noteId);
    expect(n?.depositedAmount).toBe(12345678901234567890n);
    expect(n?.createdAt).toBe(roundToHour(7 * 3600 + 1234));
    expect((n?.createdAt ?? 1) % 3600).toBe(0);
    expect(new TextDecoder().decode(n?.adapterData)).toBe(CANARY);
    const raw = JSON.stringify([...(await s.keys())].map((k) => [k]));
    for (const k of await s.keys()) {
      const val = (await s.get(k)) ?? '';
      expect(val).not.toContain(CANARY);
      expect(val.toLowerCase()).not.toContain(S1.slice(2).toLowerCase());
    }
    expect(raw.toLowerCase()).not.toContain(S1.slice(2).toLowerCase());
    expect(await v.getNote('0xnope')).toBeUndefined();
  });

  it('lists notes ordered by block then id', async () => {
    const { v } = await fresh();
    await v.putNote(note({ noteId: 'b', depositBlock: 2n }));
    await v.putNote(note({ noteId: 'a', depositBlock: 2n }));
    await v.putNote(note({ noteId: 'c', depositBlock: 1n }));
    expect((await v.listNotes()).map((n) => n.noteId)).toEqual(['c', 'a', 'b']);
  });

  it('rejects wrong passphrase and short passphrase, bad kdf, duplicate create', async () => {
    const { s, v } = await fresh();
    v.lock();
    await expect(Vault.open(s, 'wrong passphrase!')).rejects.toMatchObject({ code: 'VAULT_BAD_PASSPHRASE' });
    await expect(Vault.open(new MemoryVaultStorage(), PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await expect(Vault.create(new MemoryVaultStorage(), 'short', KDF)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(Vault.create(new MemoryVaultStorage(), PASS, { N: 3, r: 8, p: 1 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(Vault.create(new MemoryVaultStorage(), PASS, { N: 1 << 14, r: 0, p: 1 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(Vault.create(s, PASS, KDF)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    const o = await Vault.open(s, PASS);
    expect(o.unlocked).toBe(true);
  });

  it('locks: further use throws VAULT_LOCKED', async () => {
    const { v } = await fresh();
    v.lock();
    v.lock();
    expect(v.unlocked).toBe(false);
    await expect(v.putNote(note())).rejects.toMatchObject({ code: 'VAULT_LOCKED' });
  });

  it('detects malformed headers and tampered or swapped records', async () => {
    const { s, v } = await fresh();
    await v.putNote(note());
    await v.putNote(note({ noteId: 'other', depositBlock: 9n }));
    const keys = (await s.keys()).filter((k) => k.startsWith('note:'));
    const [k1, k2] = keys as [string, string];
    const a = await s.get(k1);
    const b = await s.get(k2);
    // swap
    await s.set(k1, b!);
    await s.set(k2, a!);
    await expect(v.listNotes()).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await s.set(k1, a!);
    await s.set(k2, b!);
    // flip a ciphertext bit
    const env = JSON.parse(a!) as { iv: string; ct: string };
    env.ct = (env.ct[0] === '0' ? '1' : '0') + env.ct.slice(1);
    await s.set(k1, JSON.stringify(env));
    await expect(v.getNote(note().noteId)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await s.set(k1, 'not json');
    await expect(v.getNote(note().noteId)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await s.set(k1, JSON.stringify({ iv: 'zz', ct: 'zz' }));
    await expect(v.getNote(note().noteId)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await s.set(k1, JSON.stringify(5));
    await expect(v.getNote(note().noteId)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    // header damage
    const hdr = (await s.get('hdr'))!;
    await s.set('hdr', 'garbage');
    await expect(Vault.open(s, PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await s.set('hdr', JSON.stringify({ v: 2 }));
    await expect(Vault.open(s, PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await s.set('hdr', hdr.replace('"N":16384', '"N":16385'));
    await expect(Vault.open(s, PASS)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects structurally invalid stored notes', async () => {
    const { s, v } = await fresh();
    // forge a note record through the public API by writing an incomplete cache-like payload under a note slot
    await v.putNote(note());
    const slotKey = (await s.keys()).find((k) => k.startsWith('note:'))!;
    // Replace with an authentic record of another logical key: AAD mismatch -> corrupt
    await v.putCache('x', new Uint8Array([1]));
    const cacheKey = (await s.keys()).find((k) => k.startsWith('cache:'))!;
    await s.set(slotKey, (await s.get(cacheKey))!);
    await expect(v.getNote(note().noteId)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
  });

  it('refuses to move a note backwards but allows lost-sync, and finishes terminal notes', async () => {
    const { v } = await fresh();
    await v.putNote(note());
    await expect(v.putNote(note({ state: 'pending' }))).rejects.toMatchObject({ code: 'NOTE_STATE' });
    await v.putNote(note({ state: 'lost-sync' }));
    await v.putNote(note({ state: 'confirmed' })).catch(() => undefined);
    const fresh2 = (await fresh()).v;
    await fresh2.putNote(note());
    expect((await fresh2.setState(note().noteId, 'exiting')).state).toBe('exiting');
    await fresh2.setState(note().noteId, 'exited');
    await expect(fresh2.setState(note().noteId, 'ragequit')).rejects.toMatchObject({ code: 'NOTE_STATE' });
    await expect(fresh2.setState('missing', 'exited')).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
    expect((await fresh2.setState(note().noteId, 'exited')).state).toBe('exited');
  });

  it('keeps the S1 signer reference while a note is live (EP-VAULT-3)', async () => {
    const { v } = await fresh();
    await v.registerSigner(S1, 'derivation-index-4');
    expect(await v.getSignerRef(S1)).toBe('derivation-index-4');
    expect(await v.getSignerRef(D1)).toBeUndefined();
    await v.putNote(note());
    await expect(v.purgeSigner(S1)).rejects.toMatchObject({ code: 'KEY_REQUIRED_FOR_NOTE' });
    await v.setState(note().noteId, 'ragequit');
    await v.purgeSigner(S1);
    expect(await v.getSignerRef(S1)).toBeUndefined();
    await v.registerSigner(S1, 'x');
    await v.registerSigner(S1, 'y');
    expect(await v.getSignerRef(S1)).toBe('y');
  });

  it('blocks deposits into an incomplete scope and persists it (EP-VAULT-4)', async () => {
    const { s, v } = await fresh();
    v.assertDepositAllowed('mock-pool:31337');
    await v.setScope('mock-pool:31337', 'incomplete', 'indexer 500');
    expect(() => v.assertDepositAllowed('mock-pool:31337')).toThrow(/incomplete: indexer 500/);
    await v.setScope('other:1', 'incomplete');
    expect(() => v.assertDepositAllowed('other:1')).toThrow(/incomplete/);
    v.lock();
    const o = await Vault.open(s, PASS);
    expect(() => o.assertDepositAllowed('mock-pool:31337')).toThrow();
    await o.setScope('mock-pool:31337', 'complete');
    expect(() => o.assertDepositAllowed('mock-pool:31337')).not.toThrow();
  });

  it('caches proof inputs (EP-VAULT-5) and exports/imports an encrypted bundle', async () => {
    const { v } = await fresh();
    await v.putNote(note());
    await v.putCache(note().noteId, new Uint8Array([9, 8, 7]));
    expect(await v.getCache(note().noteId)).toEqual(new Uint8Array([9, 8, 7]));
    expect(await v.getCache('none')).toBeUndefined();
    const bundle = await v.exportBundle();
    expect(bundle).not.toContain(CANARY);
    const s2 = new MemoryVaultStorage();
    const v2 = await Vault.importBundle(s2, bundle, PASS);
    expect((await v2.getNote(note().noteId))?.depositedAmount).toBe(12345678901234567890n);
    await expect(Vault.importBundle(new MemoryVaultStorage(), bundle, 'wrong passphrase!')).rejects.toMatchObject({ code: 'VAULT_BAD_PASSPHRASE' });
    await expect(Vault.importBundle(s2, bundle, PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await expect(Vault.importBundle(new MemoryVaultStorage(), 'nope', PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await expect(Vault.importBundle(new MemoryVaultStorage(), '{"v":2}', PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    await expect(Vault.importBundle(new MemoryVaultStorage(), JSON.stringify({ v: 1, entries: { '../x': 'a' } }), PASS)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
    const left = new MemoryVaultStorage();
    await expect(Vault.importBundle(left, bundle.replace('"hdr":"', '"hdr":"z'), PASS)).rejects.toBeDefined();
    expect(await left.keys()).toEqual([]);
  });

  it('never leaks stored plaintext through error messages (EP-VAULT-1 canary)', async () => {
    const { s, v } = await fresh();
    await v.putNote(note());
    const k = (await s.keys()).find((x) => x.startsWith('note:'))!;
    await s.set(k, JSON.stringify({ iv: '0'.repeat(24), ct: 'ab'.repeat(40) }));
    const msgs: string[] = [];
    for (const op of [() => v.getNote(note().noteId), () => v.listNotes(), () => v.setState(note().noteId, 'exited')]) {
      try {
        await op();
      } catch (e) {
        msgs.push(String((e as Error).message) + JSON.stringify(e));
      }
    }
    expect(msgs.length).toBe(3);
    expect(msgs.join('')).not.toContain(CANARY);
    expect(msgs.join('')).not.toContain(PASS);
  });
});

describe('Vault note shape validation', () => {
  it.each([
    ['not an object', 5],
    ['bad route', { ...note(), routeId: 'x' }],
    ['bad asset', { ...note(), asset: '0x12' }],
    ['bad state', { ...note(), state: 'x' }],
    ['bad depositor', { ...note(), depositor: 'x' }],
    ['no adapterData', { ...note(), adapterData: 'x' }],
    ['amount not bigint', { ...note(), depositedAmount: 5 }],
  ])('rejects stored note with %s', async (_n, bad) => {
    const { v } = await fresh();
    const priv = v as unknown as { putJson(slot: string, key: string, value: unknown): Promise<void> };
    const id = note().noteId;
    const s = (await import('@noble/hashes/sha2.js')).sha256;
    const { bytesToHex, utf8ToBytes } = await import('@noble/hashes/utils.js');
    await priv.putJson(`note:${bytesToHex(s(utf8ToBytes(id.toLowerCase()))).slice(0, 40)}`, `note:${id}`, bad);
    await expect(v.getNote(id)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
  });
  it('rejects a malformed index record', async () => {
    const { v } = await fresh();
    const priv = v as unknown as { putJson(slot: string, key: string, value: unknown): Promise<void> };
    await priv.putJson('idx:notes', 'idx:notes', { not: 'an array' });
    await expect(v.listNotes()).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
  });
  it('rejects plaintext that is not JSON', async () => {
    const { s, v } = await fresh();
    const priv = v as unknown as { seal(key: string, plain: Uint8Array): Promise<unknown> };
    await s.set('note:' + '0'.repeat(40), JSON.stringify(await priv.seal('note:x', new TextEncoder().encode('not json'))));
    await expect((v as unknown as { getJson(a: string, b: string): Promise<unknown> }).getJson('note:' + '0'.repeat(40), 'note:x')).rejects.toMatchObject({ code: 'VAULT_CORRUPT' });
  });
});
