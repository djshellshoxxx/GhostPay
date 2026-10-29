import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession, revealViewingKey } from './session';
import { MemoryTagStore, TagVault, type TagPayload } from './tags';
const key = (): Uint8Array => new Uint8Array(32).fill(7);
const payload = (): TagPayload => ({ stealthAddress: `0x${'01'.repeat(20)}`, announcementId: `0x${'ab'.repeat(32)}:0`, logIndex: 0, clientLabel: 'private label' });
async function pair(): Promise<{ store: MemoryTagStore; a: TagVault; b: TagVault }> {
  const store = new MemoryTagStore(), a = new TagVault(store), b = new TagVault(store);
  await a.unlock(key()); await b.unlock(key()); return { store, a, b };
}
describe('tag concurrency and lifetime', () => {
  it('rejects another tab stale replace preview and preserves its new save', async () => {
    const { a, b } = await pair(); const preview = await a.previewImport([], 'replace');
    await b.save(1, payload());
    await expect(a.applyImport(preview)).rejects.toThrow(/changed|preview/i);
    expect(await b.list()).toHaveLength(1);
  });
  it('refuses saves from a tab still unlocked with wiped profile keys', async () => {
    const { store, a, b } = await pair(); await a.wipe();
    await expect(b.save(1, payload())).rejects.toThrow(/changed|unlock/i);
    expect(await store.getAll()).toHaveLength(0); expect(await store.getMeta()).toBeUndefined();
  });
  it('refuses saves from a tab still unlocked with pre-rotation keys', async () => {
    const { a, b } = await pair(); await a.rotateKeys(key());
    await expect(b.save(1, payload())).rejects.toThrow(/changed|unlock/i);
    await b.unlock(key()); await b.save(1, payload()); expect(await a.list()).toHaveLength(1);
  });
  it('lock cancels an unlock already awaiting crypto', async () => {
    const store = new MemoryTagStore(), vault = new TagVault(store);
    const unlocking = vault.unlock(key()); vault.lock();
    await expect(unlocking).rejects.toThrow(/changed|locked/i);
    expect(vault.unlocked).toBe(false); expect(await store.getMeta()).toBeUndefined();
  });
  it('lock cancels a save already awaiting crypto', async () => {
    const { store, a } = await pair(); const saving = a.save(1, payload()); a.lock();
    await expect(saving).rejects.toThrow(/changed|locked/i); expect(await store.getAll()).toHaveLength(0);
  });
});

it('two concurrent profile creations cannot overwrite each other', async () => {
  const store = new MemoryTagStore(), a = new TagVault(store), b = new TagVault(store);
  const ka = key(), kb = key();
  const result = await Promise.allSettled([a.unlock(ka), b.unlock(kb)]);
  expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(ka.every(n => n === 0) && kb.every(n => n === 0)).toBe(true);
  const fresh = new TagVault(store); await fresh.unlock(key());
  await fresh.save(1, payload()); expect(await fresh.list()).toHaveLength(1);
});

it('wipe retains a revision tombstone and rejects the original empty snapshot', async () => {
  const store = new MemoryTagStore(), empty = await store.getSnapshot();
  await store.clear();
  await expect(store.applyBatch({ puts: [], deleteIds: [] }, empty)).rejects.toThrow(/changed/);
  expect((await store.getSnapshot()).revision).toBeGreaterThan(empty.revision);
});

it('same-profile concurrent saves commit exactly once and retain the winning ciphertext', async () => {
  const { a, b, store } = await pair();
  const results = await Promise.allSettled([a.save(1,payload()), b.save(1,payload())]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await store.getAll()).toHaveLength(1);
  expect(await a.list()).toHaveLength(1);
});

it('locked rotation zeroizes the supplied viewing key', async () => {
  const vault = new TagVault(new MemoryTagStore()), bytes = key();
  await expect(vault.rotateKeys(bytes)).rejects.toThrow(/locked/);
  expect(bytes.every(n=>n===0)).toBe(true);
});

it('lock cancels re-authentication already awaiting crypto', async () => {
  const { a } = await pair(), bytes = key();
  const verification = a.verifyKey(bytes); a.lock();
  expect(await verification).toBe(false);
  expect(bytes.every(n=>n===0)).toBe(true);
});

it('refuses to initialize over orphaned ciphertext without its profile', async () => {
  const { a, store } = await pair(); await a.save(1,payload());
  const orphan = new MemoryTagStore();
  for (const record of await store.getAll()) await orphan.put(record);
  const vault = new TagVault(orphan);
  await expect(vault.unlock(key())).rejects.toThrow(/profile|kept/i);
  expect(await orphan.getAll()).toHaveLength(1); expect(await orphan.getMeta()).toBeUndefined();
});

describe('L1-04: tag keys stay bound to the seller keys that unlocked them', () => {
  afterEach(() => { clearSession(); });
  const tagOf = (clientLabel: string): TagPayload => ({ ...payload(), clientLabel });

  it('locks when the keys are wiped, so identity B never writes under identity A\'s tag profile', async () => {
    const store = new MemoryTagStore(), vault = new TagVault(store);
    generateSession();                                   // identity A unlocks tags
    await vault.unlock(revealViewingKey());
    clearSession();                                      // Seller keys: "Wipe keys from memory"
    expect(vault.unlocked).toBe(false);
    generateSession();                                   // identity B in the same tab
    await expect(vault.save(84532, tagOf('client of B'))).rejects.toThrow(/locked|Unlock/);
    await expect(vault.list()).rejects.toThrow(/locked|Unlock/);
    expect(await store.getAll()).toHaveLength(0);
    // B's own key cannot open A's profile, and nothing of B's ever landed in it.
    await expect(vault.unlock(revealViewingKey())).rejects.toThrow(/different viewing key/);
  });

  it('does not finish an unlock or a save that started before the keys changed', async () => {
    const store = new MemoryTagStore(), vault = new TagVault(store);
    generateSession();
    const unlocking = vault.unlock(revealViewingKey());
    generateSession();                                   // keys replaced while the tag keys are derived
    await expect(unlocking).rejects.toThrow(/changed/);
    expect(vault.unlocked).toBe(false);
    expect(await store.getMeta()).toBeUndefined();
    await vault.unlock(revealViewingKey());
    const saving = vault.save(84532, tagOf('client of the old keys'));
    clearSession();                                      // keys wiped before the write commits
    await expect(saving).rejects.toThrow(/changed|locked|Unlock/);
    expect(await store.getAll()).toHaveLength(0);
  });
});
