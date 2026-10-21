import { describe, expect, it } from 'vitest';
import { MemoryTagStore, TagVault, type EncryptedTagRecord, type TagPayload } from './tags';

const key = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const ADDR = '0xAbCdEf0123456789aBcDeF0123456789abcdef01';
const payload = (over: Partial<TagPayload> = {}): TagPayload => ({
  stealthAddress: ADDR,
  announcementId: `0x${'ab'.repeat(32)}:3`,
  logIndex: 3,
  clientLabel: 'Acme Corp — invoice #42',
  invoiceLabel: 'INV-42',
  notes: 'net 30',
  ...over,
});

async function unlocked(store = new MemoryTagStore(), k = 7): Promise<{ vault: TagVault; store: MemoryTagStore }> {
  const vault = new TagVault(store, () => 1_700_000_000_000);
  await vault.unlock(key(k));
  return { vault, store };
}

describe('TagVault (Feature 4)', () => {
  it('saves, finds, lists and removes tags', async () => {
    const { vault } = await unlocked();
    await vault.save(84532, payload());
    await vault.save(84532, payload({ stealthAddress: '0x1111111111111111111111111111111111111111', announcementId: `0x${'cd'.repeat(32)}:0`, clientLabel: 'Other' }));
    await vault.save(1, payload({ clientLabel: 'Mainnet' }));
    expect((await vault.find(84532, ADDR.toLowerCase()))?.clientLabel).toBe('Acme Corp — invoice #42');
    expect((await vault.find(1, ADDR))?.clientLabel).toBe('Mainnet');
    expect(await vault.find(84532, '0x2222222222222222222222222222222222222222')).toBeUndefined();
    expect((await vault.list(84532)).map((t) => t.clientLabel).sort()).toEqual(['Acme Corp — invoice #42', 'Other']);
    expect(await vault.list()).toHaveLength(3);
    expect(await vault.remove(84532, ADDR)).toBe(true);
    expect(await vault.remove(84532, ADDR)).toBe(false);
    expect(await vault.find(84532, ADDR)).toBeUndefined();
  });

  it('updating a tag keeps its record id and created time', async () => {
    let t = 1000;
    const store = new MemoryTagStore();
    const vault = new TagVault(store, () => t);
    await vault.unlock(key(1));
    await vault.save(84532, payload());
    const first = (await store.getAll())[0] as EncryptedTagRecord;
    t = 2000;
    await vault.save(84532, payload({ clientLabel: 'Renamed' }));
    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ recordId: first.recordId, createdAt: 1000, updatedAt: 2000 });
    expect((await vault.find(84532, ADDR))?.clientLabel).toBe('Renamed');
  });

  it('stores ciphertext only: no label, address, or key material appears in the store', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const dump = JSON.stringify({ records: await store.getAll(), meta: await store.getMeta() });
    for (const needle of ['Acme', 'INV-42', 'net 30', ADDR.toLowerCase().slice(2), ADDR.slice(2), 'ab'.repeat(32), '0707070707']) {
      expect(dump).not.toContain(needle);
    }
    const rec = (await store.getAll())[0] as EncryptedTagRecord;
    expect(rec.schemaVersion).toBe(1);
    expect(rec.lookupKey).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(rec.recordId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('uses a fresh IV for each write and a keyed (not plain-hash) lookup token', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const a = (await store.getAll())[0] as EncryptedTagRecord;
    await vault.save(84532, payload({ clientLabel: 'again' }));
    const b = (await store.getAll())[0] as EncryptedTagRecord;
    expect(a.iv).not.toBe(b.iv);
    expect(a.lookupKey).toBe(b.lookupKey);
    // A different viewing key (same salt not shared) yields a different token for the same address.
    const other = await unlocked(new MemoryTagStore(), 9);
    await other.vault.save(84532, payload());
    expect(((await other.store.getAll())[0] as EncryptedTagRecord).lookupKey).not.toBe(a.lookupKey);
  });

  it('locks, refuses use while locked, and unlocks again with the same key', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    vault.lock();
    expect(vault.unlocked).toBe(false);
    await expect(vault.find(84532, ADDR)).rejects.toThrow(/locked/);
    await expect(vault.save(84532, payload())).rejects.toThrow(/locked/);
    await vault.unlock(key(7));
    expect(vault.unlocked).toBe(true);
    expect((await vault.find(84532, ADDR))?.clientLabel).toContain('Acme');
    void store;
  });

  it('refuses a different viewing key', async () => {
    const { store } = await unlocked(new MemoryTagStore(), 7);
    const v2 = new TagVault(store);
    await expect(v2.unlock(key(8))).rejects.toThrow(/different viewing key/);
    expect(v2.unlocked).toBe(false);
  });

  it('zeroizes the viewing key bytes it consumes', async () => {
    const k = key(5);
    await new TagVault(new MemoryTagStore()).unlock(k);
    expect(k.every((b) => b === 0)).toBe(true);
  });

  it('concurrent saves for one address keep a single record (no duplicate recordIds)', async () => {
    const { vault, store } = await unlocked();
    await Promise.all([vault.save(84532, payload({ notes: 'a' })), vault.save(84532, payload({ notes: 'b' })), vault.save(84532, payload({ notes: 'c' }))]);
    expect(await store.getAll()).toHaveLength(1);
    expect((await vault.find(84532, ADDR))?.notes).toBe('c');
  });
  it('binds the chain id as AAD: a record moved to another chain does not decrypt', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const rec = (await store.getAll())[0] as EncryptedTagRecord;
    await store.put({ ...rec, chainId: 1 });
    await expect(vault.list()).rejects.toThrow(/could not be decrypted/);
  });

  it('detects tampered ciphertext', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const rec = (await store.getAll())[0] as EncryptedTagRecord;
    await store.put({ ...rec, ciphertext: (rec.ciphertext[0] === '0' ? '1' : '0') + rec.ciphertext.slice(1) });
    await expect(vault.find(84532, ADDR)).rejects.toThrow(/could not be decrypted/);
  });

  it('wipes everything, even while locked, and then starts a fresh profile', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    vault.lock();
    await vault.wipe();
    expect(await store.getAll()).toEqual([]);
    expect(await store.getMeta()).toBeUndefined();
    await vault.unlock(key(99));
    expect(await vault.list()).toEqual([]);
  });

  it('validates payloads', async () => {
    const { vault } = await unlocked();
    await expect(vault.save(1, payload({ clientLabel: '   ' }))).rejects.toThrow(/Client label/);
    await expect(vault.save(1, payload({ clientLabel: 'x'.repeat(201) }))).rejects.toThrow(/Client label/);
    await expect(vault.save(1, payload({ stealthAddress: 'nope' }))).rejects.toThrow(/stealth address/);
    await expect(vault.save(1, payload({ announcementId: 'nope' }))).rejects.toThrow(/announcement id/);
    await expect(vault.save(1, payload({ logIndex: -1 }))).rejects.toThrow(/log index/);
    await expect(vault.save(1, payload({ notes: 'x'.repeat(2001) }))).rejects.toThrow(/too long/);
    await vault.save(1, payload({ invoiceLabel: '', notes: '' }));
    expect(await vault.find(1, ADDR)).toMatchObject({ clientLabel: 'Acme Corp — invoice #42' });
  });

  it('lock() during an in-flight unlock leaves the vault locked (wipe-keys race)', async () => {
    const vault = new TagVault(new MemoryTagStore());
    const pending = vault.unlock(key(7));
    vault.lock();
    await pending;
    expect(vault.unlocked).toBe(false);
    await expect(vault.list()).rejects.toThrow(/locked/);
  });

  it('wipe() during an in-flight unlock leaves the vault locked', async () => {
    const vault = new TagVault(new MemoryTagStore());
    const pending = vault.unlock(key(7));
    const w = vault.wipe();
    await Promise.all([pending, w]);
    expect(vault.unlocked).toBe(false);
  });

  it('detects spliced records: ciphertexts swapped between two addresses do not decrypt as the other (S3-16)', async () => {
    const { vault, store } = await unlocked();
    const B = '0x' + 'bb'.repeat(20);
    await vault.save(84532, payload({ clientLabel: 'Alice' }));
    await vault.save(84532, payload({ stealthAddress: B, clientLabel: 'Bob' }));
    const [r1, r2] = (await store.getAll()) as EncryptedTagRecord[];
    await store.put({ ...r1!, iv: r2!.iv, ciphertext: r2!.ciphertext });
    await store.put({ ...r2!, iv: r1!.iv, ciphertext: r1!.ciphertext });
    await expect(vault.find(84532, ADDR)).rejects.toThrow(/could not be decrypted/);
    await expect(vault.find(84532, B)).rejects.toThrow(/could not be decrypted/);
    expect(await vault.listReport(84532)).toEqual({ tags: [], damaged: 2 });
  });

  it('listReport skips a damaged record, returns the rest and counts what it skipped', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload({ clientLabel: 'Good' }));
    await vault.save(84532, payload({ stealthAddress: '0x' + 'cc'.repeat(20), clientLabel: 'Bad' }));
    const target = (await store.getAll())[1] as EncryptedTagRecord;
    await store.put({ ...target, ciphertext: (target.ciphertext[0] === '0' ? '1' : '0') + target.ciphertext.slice(1) });
    const rep = await vault.listReport(84532);
    expect(rep.damaged).toBe(1);
    expect(rep.tags).toHaveLength(1);
    expect(await vault.listReport(1)).toEqual({ tags: [], damaged: 0 });
    // The strict API is unchanged: list() still refuses to return a partial result.
    await expect(vault.list()).rejects.toThrow(/could not be decrypted/);
  });

  it('listReport refuses (does not count as damage) when locked', async () => {
    const { vault } = await unlocked();
    await vault.save(84532, payload());
    vault.lock();
    await expect(vault.listReport()).rejects.toThrow(/locked/);
  });
});
