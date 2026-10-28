import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { UserFacingError } from './errors';
import { MemoryTagStore, TagVault, validatePayload, type EncryptedTagRecord, type TagPayload } from './tags';

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
    expect(rec.schemaVersion).toBe(2);
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

  it('I-3: accepts only text for the invoice label and notes, trimmed and bounded like the client label', async () => {
    const { vault } = await unlocked();
    const junk: Record<string, unknown>[] = [{ invoiceLabel: null }, { invoiceLabel: 42 }, { invoiceLabel: { length: 1 } }, { notes: 7 }, { notes: ['net 30'] }, { notes: { toString: () => 'net 30' } }, { clientLabel: 5 }];
    for (const patch of junk) {
      const bad: TagPayload = { ...payload(), ...patch };
      expect(() => validatePayload(bad)).toThrow(UserFacingError);
      await expect(vault.save(84532, bad)).rejects.toThrow(UserFacingError);
      // Archive entries pass the same check before anything is staged.
      await expect(vault.previewImport([{ chainId: 84532, createdAt: 1, updatedAt: 1, payload: bad }], 'merge')).rejects.toThrow(UserFacingError);
    }
    expect(await vault.list()).toEqual([]);
    await vault.save(84532, payload({ invoiceLabel: '  INV-42  ', notes: '\n net 30 \n' }));
    expect(await vault.find(84532, ADDR)).toMatchObject({ invoiceLabel: 'INV-42', notes: 'net 30' });
    await vault.save(84532, payload({ invoiceLabel: '   ', notes: '\t' }));
    const blank = await vault.find(84532, ADDR);
    expect(blank).not.toHaveProperty('invoiceLabel');
    expect(blank).not.toHaveProperty('notes');
    await vault.save(84532, payload({ invoiceLabel: ` ${'x'.repeat(200)} ` }));
    await expect(vault.save(84532, payload({ invoiceLabel: 'x'.repeat(201) }))).rejects.toThrow(/too long/);
  });
});

// Previous release's chain-only AAD, independent of TagVault.save.
async function legacyRecord(store: MemoryTagStore, record: EncryptedTagRecord, body: TagPayload): Promise<EncryptedTagRecord> {
  const meta = await store.getMeta();
  if (meta === undefined) throw new Error('missing profile');
  const base = await crypto.subtle.importKey('raw', key(7) as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveKey']);
  const aes = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256',
    salt: hexToBytes(meta.salt) as Uint8Array<ArrayBuffer>, info: utf8ToBytes('GhostPay/local-tags/v1/aes-gcm') as Uint8Array<ArrayBuffer> },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = new Uint8Array(12).fill(3);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: utf8ToBytes(`GhostPay/tag/v1|${String(record.chainId)}`) as Uint8Array<ArrayBuffer>, tagLength: 128 },
    aes, utf8ToBytes(JSON.stringify(body)));
  return { ...record, schemaVersion: 1, iv: bytesToHex(iv), ciphertext: bytesToHex(new Uint8Array(ciphertext)) };
}

describe('legacy tag migration', () => {
  it('upgrades existing tags without changing identity or timestamps', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const record = (await store.getAll())[0];
    if (record === undefined) throw new Error('missing record');
    await store.put(await legacyRecord(store, record, payload()));
    expect((await vault.find(84532, ADDR))?.clientLabel).toBe(payload().clientLabel);
    expect((await store.getAll())[0]).toMatchObject({ schemaVersion: 2, recordId: record.recordId, lookupKey: record.lookupKey,
      createdAt: record.createdAt, updatedAt: record.updatedAt });
    vault.lock();
    await vault.unlock(key(7));
    expect((await vault.list(84532))[0]?.stealthAddress).toBe(ADDR.toLowerCase());
  });

  it('refuses legacy ciphertext with an address that disagrees with its lookup token', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const record = (await store.getAll())[0];
    if (record === undefined) throw new Error('missing record');
    await store.put(await legacyRecord(store, record, payload({ stealthAddress: '0x' + 'bb'.repeat(20) })));
    await expect(vault.find(84532, ADDR)).rejects.toThrow(/could not be decrypted/);
    await expect(vault.list()).rejects.toThrow(/could not be decrypted/);
    expect((await store.getAll())[0]?.schemaVersion).toBe(1);
  });

  it('rejects attempts to downgrade a bound record to the legacy format', async () => {
    const { vault, store } = await unlocked();
    await vault.save(84532, payload());
    const record = (await store.getAll())[0];
    if (record === undefined) throw new Error('missing record');
    await store.put({ ...record, schemaVersion: 1 });
    await expect(vault.find(84532, ADDR)).rejects.toThrow(/could not be decrypted/);
  });
});
