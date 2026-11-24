import { expect, it } from 'vitest';
import { createContext, MAX_STORAGE_KEYS, MAX_STORAGE_VALUE, type StoragePort } from './sandbox.js';
import { MemoryStorage } from './fixtures.testutil.js';

const id = 'org.example.delay';
const indexKey = `plugin/${id}/~index`;
const context = (store: StoragePort, pluginId = id) => createContext(pluginId, { network: [], storage: true }, { storage: store }, () => 0);

it('does not deliver a storage read that completes after revocation', async () => {
  let resolve!: (value: string) => void;
  const store = new MemoryStorage();
  store.get = () => new Promise<string>((r) => { resolve = r; });
  const h = context(store);
  const read = h.context.storage!.get('secret');
  h.revoke();
  resolve('late value');
  await expect(read).rejects.toThrow(/revoked/);
});

it('serializes the quota/index across concurrent contexts sharing a port', async () => {
  const store = new MemoryStorage();
  const contexts = Array.from({ length: MAX_STORAGE_KEYS + 4 }, () => context(store));
  const results = await Promise.allSettled(contexts.map((h, i) => h.context.storage!.set(`k${i}`, 'v')));
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_STORAGE_KEYS);
  expect(JSON.parse(store.data.get(indexKey)!)).toHaveLength(MAX_STORAGE_KEYS);
  expect([...store.data.keys()].filter((k) => k !== indexKey)).toHaveLength(MAX_STORAGE_KEYS);
});

it.each([
  JSON.stringify(['a', 'a']),
  JSON.stringify(Array.from({ length: MAX_STORAGE_KEYS + 1 }, (_, i) => `k${i}`)),
  ' '.repeat(5000) + '[]',
])('fails closed on invalid bounded indexes', async (raw) => {
  const store = new MemoryStorage();
  store.data.set(indexKey, raw);
  await expect(context(store).context.storage!.set('a', 'v')).rejects.toThrow(/storage.index/);
});

it('rejects an oversized stored value', async () => {
  const store = new MemoryStorage();
  store.data.set(`plugin/${id}/a`, 'x'.repeat(MAX_STORAGE_VALUE + 1));
  await expect(context(store).context.storage!.get('a')).rejects.toThrow(/storage.value/);
});

it('does not start storage effects after a delayed index read is revoked', async () => {
  const store = new MemoryStorage();
  let resolve!: (value: string | undefined) => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  store.get = () => { entered(); return new Promise((r) => { resolve = r; }); };
  const h = context(store);
  const write = h.context.storage!.set('a', 'v');
  await started;
  h.revoke();
  resolve(undefined);
  await expect(write).rejects.toThrow(/revoked/);
  expect(store.data.size).toBe(0);
});

it('does not leak namespaces and permits recovery after a failed write', async () => {
  const store = new MemoryStorage();
  const set = store.set.bind(store);
  store.set = async (key, value) => { if (key.endsWith('/a')) throw new Error('disk'); await set(key, value); };
  const first = context(store);
  await expect(first.context.storage!.set('a', 'v')).rejects.toThrow('disk');
  // Reserving before writing is conservative: a partial write consumes its key.
  expect(JSON.parse(store.data.get(indexKey)!)).toEqual(['a']);
  store.set = set;
  await context(store).context.storage!.set('a', 'recovered');
  await context(store, 'org.example.other').context.storage!.set('a', 'other');
  expect(await first.context.storage!.get('a')).toBe('recovered');
});

it('revokes queued mutations and does not undo an already started host write', async () => {
  const store = new MemoryStorage();
  const set = store.set.bind(store);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  const blocked = new Promise<void>((r) => { release = r; });
  store.set = async (key, value) => {
    if (key.endsWith('/a')) { entered(); await blocked; }
    await set(key, value);
  };
  const first = context(store), second = context(store);
  const a = first.context.storage!.set('a', 'committed');
  await started;
  const b = second.context.storage!.set('b', 'must not start');
  first.revoke(); second.revoke(); release();
  await expect(a).rejects.toThrow(/revoked/);
  await expect(b).rejects.toThrow(/revoked/);
  expect(store.data.get(`plugin/${id}/a`)).toBe('committed');
  expect(store.data.has(`plugin/${id}/b`)).toBe(false);
  expect(JSON.parse(store.data.get(indexKey)!)).toEqual(['a']);
});

it('does not begin a deletion after an index read completes on a revoked context', async () => {
  const store = new MemoryStorage();
  store.data.set(`plugin/${id}/a`, 'keep');
  let resolve!: (value: string) => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  store.get = () => { entered(); return new Promise((r) => { resolve = r; }); };
  const h = context(store);
  const deletion = h.context.storage!.delete('a');
  await started;
  h.revoke(); resolve('["a"]');
  await expect(deletion).rejects.toThrow(/revoked/);
  expect(store.data.get(`plugin/${id}/a`)).toBe('keep');
});
