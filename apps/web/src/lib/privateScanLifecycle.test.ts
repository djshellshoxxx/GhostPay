import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkpointKeyId, type ReconciliationVaultStore } from '@ghostpay/ux-vault/portable';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from './keyVault';
import { clearSession, importSession } from './session';
import { createPrivateScanTombstone, isPrivateScanTombstone, PRIVATE_SCAN_SLOT_PREFIX, type PrivateScanScope, type PrivateScanState } from './privateScanStore';
import { invalidatePrivateScanHistory, openCurrentPrivateScanVault, purgeLegacyPrivateScanHistory, subscribePrivateScanInvalidation } from './privateScanLifecycle';

const KEYS = { spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) };
const PASS = 'amber violet cedar lantern';
const SAMPLE: PrivateScanState = { startBlock: 0n, cursor: { nextBlock: 4n, last: { number: 3n, hash: `0x${'ab'.repeat(32)}` } }, matches: [] };
const cleanup: (() => void)[] = [];

function install(): PrivateScanScope {
  const pub = importSession(KEYS);
  return {
    chainId: 84532, sellerKeyId: checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey),
    announcer: `0x${'12'.repeat(20)}`, router: `0x${'34'.repeat(20)}`, finalityDepth: 12, deep: false,
    configuration: 'selected-source-policy',
  };
}

class Store implements ReconciliationVaultStore {
  readonly values = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.values.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.values.set(key, next); return Promise.resolve(true);
  }
}

async function tiedSession() {
  const scope = install();
  const keys = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(keys);
  await saveEncryptedVault(PASS, { N: 1 << 14 }, keys);
  const ciphertext = (await keys.get())!;
  return { scope, keys, ciphertext };
}

afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  clearSession(false); setKeyVaultStoreForTests(undefined); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('private scan seller lifecycle', () => {
  it('opens only for the loaded identity, never a requested foreign seller', async () => {
    const scope = install(); const store = new Store();
    await expect(openCurrentPrivateScanVault({ ...scope, sellerKeyId: 'ff'.repeat(32) }, store, () => undefined)).rejects.toMatchObject({ code: 'stale' });
    clearSession(false);
    await expect(openCurrentPrivateScanVault(scope, store, () => undefined)).rejects.toMatchObject({ code: 'stale' });
    expect(store.values.size).toBe(0);
  });

  it('rejects silent replacement even when exactly the same seller keys are installed again', async () => {
    const scope = install(); const store = new Store();
    const vault = await openCurrentPrivateScanVault(scope, store, () => undefined);
    await vault.load(); const before = [...store.values];
    clearSession(false); importSession(KEYS);
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'stale' });
    expect([...store.values]).toEqual(before);
    const fresh = await openCurrentPrivateScanVault(scope, store, () => undefined);
    await fresh.load(); await fresh.save(SAMPLE);
    expect((await fresh.load())?.cursor).toEqual(SAMPLE.cursor);
  });

  it('notifies local scans before asynchronous invalidation and rejects their pending context', async () => {
    const scope = install(); const store = new Store(); const controller = new AbortController();
    const listener = vi.fn(() => { controller.abort(); });
    cleanup.push(subscribePrivateScanInvalidation(listener));
    const vault = await openCurrentPrivateScanVault(scope, store, () => { if (controller.signal.aborted) throw new Error('private abort context'); });
    await vault.load(); const before = [...store.values];
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const invalidating = invalidatePrivateScanHistory(() => gate);
    expect(listener).toHaveBeenCalledOnce(); expect(controller.signal.aborted).toBe(true);
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'stale' });
    expect([...store.values]).toEqual(before);
    release(); await invalidating;
  });

  it('excludes an old tab through tombstone CAS even with no invalidation message delivered', async () => {
    const scope = install(); const store = new Store();
    const vault = await openCurrentPrivateScanVault(scope, store, () => undefined);
    await vault.load(); await vault.save(SAMPLE);
    for (const key of store.values.keys()) if (key.startsWith(PRIVATE_SCAN_SLOT_PREFIX)) store.values.set(key, createPrivateScanTombstone());
    const deleted = [...store.values];
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'conflict' });
    expect([...store.values]).toEqual(deleted);
    expect(isPrivateScanTombstone(deleted[0]![1])).toBe(true);
  });

  it('fails closed when the tied key vault disappears after the journal read, without a broadcast', async () => {
    const { scope, keys, ciphertext } = await tiedSession(); const store = new Store();
    const vault = await openCurrentPrivateScanVault(scope, store, () => undefined);
    const read = store.read.bind(store);
    store.read = async (key) => {
      const found = await read(key);
      await keys.delete(ciphertext);
      return found;
    };
    await expect(vault.load()).rejects.toMatchObject({ code: 'stale' });
    expect(store.values.size).toBe(0);
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rechecks tied keys after a missing journal reservation commits, before accepting its absence', async () => {
    const { scope, keys, ciphertext } = await tiedSession(); const store = new Store();
    const vault = await openCurrentPrivateScanVault(scope, store, () => undefined);
    const swap = store.compareAndSwap.bind(store);
    store.compareAndSwap = async (...args) => {
      const changed = await swap(...args);
      await keys.delete(ciphertext);
      return changed;
    };
    await expect(vault.load()).rejects.toMatchObject({ code: 'stale' });
    expect(store.values.size).toBe(1);
    expect(isPrivateScanTombstone([...store.values.values()][0]!)).toBe(true);
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rejects an already-open tied session after deletion, but accepts an explicit fresh independent import', async () => {
    const { scope, keys, ciphertext } = await tiedSession(); const store = new Store();
    const vault = await openCurrentPrivateScanVault(scope, store, () => undefined);
    await vault.load(); await keys.delete(ciphertext);
    // The key-vault binding is read on every operation; no BroadcastChannel/local generation changed.
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'stale' });
    const oldSessionRetry = await openCurrentPrivateScanVault(scope, store, () => undefined);
    await expect(oldSessionRetry.load()).rejects.toMatchObject({ code: 'stale' });
    clearSession(false); importSession(KEYS);
    const recovered = await openCurrentPrivateScanVault(scope, store, () => undefined);
    await recovered.load(); await recovered.save(SAMPLE);
    expect((await recovered.load())?.cursor).toEqual(SAMPLE.cursor);
  });

  it('propagates failed deletion persistence after invalidating local guards', async () => {
    const scope = install(); const store = new Store();
    const vault = await openCurrentPrivateScanVault(scope, store, () => undefined); await vault.load();
    await expect(invalidatePrivateScanHistory(() => Promise.reject(new Error('deletion failed')))).rejects.toThrow('deletion failed');
    await expect(vault.save(SAMPLE)).rejects.toMatchObject({ code: 'stale' });
  });

  it('broadcasts activity only and ignores foreign channel payloads', async () => {
    class Broadcast {
      static readonly opened: Broadcast[] = [];
      onmessage: ((event: MessageEvent<unknown>) => void) | undefined;
      readonly postMessage = vi.fn(); readonly close = vi.fn();
      constructor(readonly name: string) { Broadcast.opened.push(this); }
    }
    vi.stubGlobal('window', {}); vi.stubGlobal('BroadcastChannel', Broadcast);
    const listener = vi.fn(); cleanup.push(subscribePrivateScanInvalidation(listener));
    const inbound = Broadcast.opened[0]!;
    inbound.onmessage?.({ data: { sellerKey: 'do not reflect this' } } as MessageEvent<unknown>);
    expect(listener).not.toHaveBeenCalled();
    inbound.onmessage?.({ data: 'changed' } as MessageEvent<unknown>);
    expect(listener).toHaveBeenCalledOnce();
    await invalidatePrivateScanHistory(() => Promise.resolve());
    expect(listener).toHaveBeenCalledTimes(2);
    expect(Broadcast.opened[1]?.postMessage).toHaveBeenCalledExactlyOnceWith('changed');
    expect(Broadcast.opened[1]?.close).toHaveBeenCalledOnce();
    for (const broadcast of Broadcast.opened) expect(broadcast.name).toBe('ghostpay:private-scan-invalidation');
  });
});

describe('invalidating unauthenticated legacy scan progress', () => {
  it('removes only exact v1-v4 names, snapshots before deleting, and never reads their values', () => {
    const legacy = [1, 2, 3, 4].map((version) => `ghostpay.scan.checkpoint.v${version}.old`);
    const keep = ['ghostpay.scan.checkpoint.v5.opaque', 'ghostpay.scan.checkpoint.v40.keep', 'ghostpay.scan.checkpoint.v3', 'another.preference'];
    const values = new Map([...legacy, ...keep].map((key) => [key, 'never-read']));
    const getItem = vi.fn((key: string) => values.get(key) ?? null);
    const storage: Storage = {
      get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
      getItem,
      setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); }, clear: () => { values.clear(); },
    };
    purgeLegacyPrivateScanHistory(storage);
    expect(getItem).not.toHaveBeenCalled(); expect([...values.keys()]).toEqual(keep);
  });

  it('tolerates storage enumeration and deletion denial without accepting old progress', () => {
    const remove = vi.fn(() => { throw new Error('denied'); });
    const getItem = vi.fn(() => 'should not read');
    const storage: Storage = {
      length: 2, key: (index) => { if (index === 1) throw new Error('denied'); return 'ghostpay.scan.checkpoint.v4.old'; },
      getItem, setItem: vi.fn(), removeItem: remove, clear: vi.fn(),
    };
    expect(() => purgeLegacyPrivateScanHistory(storage)).not.toThrow();
    expect(remove).toHaveBeenCalledExactlyOnceWith('ghostpay.scan.checkpoint.v4.old');
    expect(getItem).not.toHaveBeenCalled(); expect(() => purgeLegacyPrivateScanHistory(undefined)).not.toThrow();
  });
});
