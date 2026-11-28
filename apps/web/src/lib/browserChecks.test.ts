import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserCheckEnvironment, runBrowserChecks, type BrowserCheck } from './browserChecks';
import { memoryIndexedDb } from '../test/memoryIndexedDb';

const validDigest = (bytes: ArrayBuffer): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', bytes);

function temporaryStorage(): { store: Map<string, string>; storage: Pick<Storage, 'setItem' | 'getItem' | 'removeItem'> } {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      setItem(key, value) { store.set(key, value); },
      getItem(key) { return store.get(key) ?? null; },
      removeItem(key) { store.delete(key); },
    },
  };
}

type Handler = (() => void) | null;
interface FakeRequest { result?: unknown; error?: unknown; onsuccess?: Handler; onerror?: Handler; onupgradeneeded?: Handler; onblocked?: Handler }

/** Scripted IndexedDB for failure modes the in-memory test database cannot produce. */
function scriptedIndexedDb(mode: { open?: 'throws' | 'errors' | 'hangs' | 'late'; corruptRead?: boolean; deleteFails?: boolean; deleteHangs?: boolean } = {}) {
  const later = (run: () => void): void => { setTimeout(run, 0); };
  const deleted: string[] = [];
  let closed = 0;
  const factory = {
    open(): FakeRequest {
      if (mode.open === 'throws') throw new DOMException('Synthetic refusal', 'SecurityError');
      const request: FakeRequest = {};
      if (mode.open === 'hangs') return request;
      // 'late' answers only after the probe's 5 s deadline has passed.
      const answer = mode.open === 'late' ? (run: () => void): void => { setTimeout(run, 6_000); } : later;
      answer(() => {
        if (mode.open === 'errors') { request.error = new DOMException('Synthetic', 'InvalidStateError'); request.onerror?.(); return; }
        let stored: unknown;
        request.result = {
          createObjectStore: () => ({}),
          close: () => { closed += 1; },
          transaction: () => {
            const tx: { oncomplete?: Handler; objectStore?: unknown } = {};
            tx.objectStore = () => ({
              put: (value: unknown) => { stored = value; return {}; },
              get: () => {
                const read: FakeRequest = {};
                later(() => { read.result = mode.corruptRead === true ? 'other' : stored; read.onsuccess?.(); later(() => { tx.oncomplete?.(); }); });
                return read;
              },
            });
            return tx;
          },
        };
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
    deleteDatabase(name: string): FakeRequest {
      deleted.push(name);
      const request: FakeRequest = {};
      if (mode.deleteHangs === true) return request;
      later(() => { if (mode.deleteFails === true) request.onerror?.(); else request.onsuccess?.(); });
      return request;
    },
  };
  return { indexedDb: factory as unknown as IDBFactory, deleted, closed: () => closed };
}

const statusOf = (checks: readonly BrowserCheck[], id: BrowserCheck['id']) => checks.find((check) => check.id === id)?.status;

function withWindow<T>(fake: object, run: () => Promise<T>): Promise<T> {
  vi.stubGlobal('window', fake);
  return run().finally(() => { vi.unstubAllGlobals(); });
}

afterEach(() => { vi.useRealTimers(); });

describe('local-only browser capability checks', () => {
  it('omits unavailable optional browser providers and reports them as unavailable without exposing storage errors', async () => {
    await withWindow({
      isSecureContext: false,
      crypto: {},
      get localStorage() { throw new Error('storage access denied'); },
    }, async () => {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect(Object.hasOwn(env, 'storage')).toBe(false);
      expect(Object.hasOwn(env, 'indexedDb')).toBe(false);
      const checks = await runBrowserChecks(env);
      expect(checks).toEqual([
        { id: 'secure', status: 'fail' },
        { id: 'digest', status: 'unavailable' },
        { id: 'storage', status: 'unavailable' },
        { id: 'indexeddb', status: 'unavailable' },
      ]);
      expect(JSON.stringify(checks)).not.toContain('storage access denied');
    });
  });

  it('treats a missing secure-context flag, a non-function digest and a null localStorage as unavailable', async () => {
    await withWindow({ crypto: { subtle: { digest: 'not callable' } }, localStorage: null, indexedDB: null }, async () => {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'secureContext')).toBe(false);
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect(Object.hasOwn(env, 'storage')).toBe(false);
      expect(Object.hasOwn(env, 'indexedDb')).toBe(false);
      expect((await runBrowserChecks(env)).map((check) => check.status)).toEqual(['unavailable', 'unavailable', 'unavailable', 'unavailable']);
    });
  });

  it('keeps a usable digest provider when randomUUID or the crypto getter itself throws', async () => {
    const { storage } = temporaryStorage();
    await withWindow({
      isSecureContext: true,
      crypto: {
        subtle: { digest: (_name: string, data: ArrayBuffer) => validDigest(data) },
        randomUUID() { throw new Error('denied'); },
        getRandomValues: <T extends ArrayBufferView>(array: T): T => crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T,
      },
      localStorage: storage,
      indexedDB: memoryIndexedDb(),
    }, async () => {
      const env = browserCheckEnvironment();
      expect(env.probeKey).toMatch(/^__ghostpay_capability_[0-9a-f]{32}$/);
      expect((await runBrowserChecks(env)).map((check) => check.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
    });
    await withWindow({ isSecureContext: true, get crypto() { throw new Error('blocked'); } }, async () => {
      const env = browserCheckEnvironment();
      expect(Object.hasOwn(env, 'digest')).toBe(false);
      expect((await runBrowserChecks(env))[1]).toEqual({ id: 'digest', status: 'unavailable' });
    });
  });

  it('passes only a genuine SHA-256 known-answer check and cleaned-up storage and database round trips', async () => {
    const { store, storage } = temporaryStorage();
    const indexedDb = memoryIndexedDb();
    const checks = await runBrowserChecks({
      secureContext: true, digest: validDigest, storage, indexedDb, probeKey: '__ghostpay_test_probe__',
    });
    expect(checks).toEqual([
      { id: 'secure', status: 'pass' },
      { id: 'digest', status: 'pass' },
      { id: 'storage', status: 'pass' },
      { id: 'indexeddb', status: 'pass' },
    ]);
    expect(store.size).toBe(0);
    expect(await indexedDb.databases()).toEqual([]);
  });

  it('reports an insecure context as failed and absent cryptography as unavailable, never as passed', async () => {
    const checks = await runBrowserChecks({ secureContext: false, probeKey: 'probe' });
    expect(checks).toEqual([
      { id: 'secure', status: 'fail' },
      { id: 'digest', status: 'unavailable' },
      { id: 'storage', status: 'unavailable' },
      { id: 'indexeddb', status: 'unavailable' },
    ]);
  });

  it('fails the SHA-256 check if the digest resolves to wrong bytes', async () => {
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: () => Promise.resolve(new Uint8Array(32).buffer),
      probeKey: 'probe',
    });
    expect(checks.find((check) => check.id === 'digest')?.status).toBe('fail');
  });

  it('fails the SHA-256 check if the digest rejects or throws without disclosing an exception', async () => {
    for (const digest of [
      () => Promise.reject(new Error('secret provider details')),
      () => { throw new Error('secret provider details'); },
    ]) {
      const checks = await runBrowserChecks({ secureContext: true, digest, probeKey: 'probe' });
      expect(checks.find((check) => check.id === 'digest')?.status).toBe('fail');
      expect(JSON.stringify(checks)).not.toContain('secret provider details');
    }
  });

  it('fails a digest that never answers within the probe deadline and continues to check storage', async () => {
    vi.useFakeTimers();
    const { store, storage } = temporaryStorage();
    let result: readonly BrowserCheck[] | undefined;
    const pending = runBrowserChecks({
      secureContext: true, digest: () => new Promise<ArrayBuffer>(() => {}), storage, probeKey: 'probe',
    }).then((checks) => { result = checks; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual([
      { id: 'secure', status: 'pass' },
      { id: 'digest', status: 'fail' },
      { id: 'storage', status: 'pass' },
      { id: 'indexeddb', status: 'unavailable' },
    ]);
    await pending;
    expect(store.size).toBe(0);
  });

  it('does not relabel a timed-out digest after a late correct answer', async () => {
    const correct = await validDigest(new TextEncoder().encode('abc').buffer);
    vi.useFakeTimers();
    let complete: ((value: ArrayBuffer) => void) | undefined;
    let result: readonly BrowserCheck[] | undefined;
    const pending = runBrowserChecks({
      digest: () => new Promise<ArrayBuffer>((resolve) => { complete = resolve; }),
    }).then((checks) => { result = checks; });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(result?.find((check) => check.id === 'digest')?.status).toBe('fail');
    await pending;
    complete?.(correct);
    await vi.advanceTimersByTimeAsync(1);
    expect(result?.find((check) => check.id === 'digest')?.status).toBe('fail');
  });

  it('fails when storage silently loses its write and removes the temporary probe', async () => {
    const { store, storage } = temporaryStorage();
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: validDigest,
      storage: { ...storage, getItem: () => null },
      probeKey: '__ghostpay_test_probe__',
    });
    expect(checks.find((check) => check.id === 'storage')?.status).toBe('fail');
    expect(store.size).toBe(0);
  });

  it('reports storage as unavailable without throwing when the write is refused', async () => {
    const removed: string[] = [];
    const checks = await runBrowserChecks({
      secureContext: true,
      digest: validDigest,
      storage: {
        setItem() { throw new Error('denied'); },
        getItem() { return null; },
        removeItem(key) { removed.push(key); throw new Error('denied'); },
      },
      probeKey: 'probe',
    });
    expect(checks.find((check) => check.id === 'storage')?.status).toBe('unavailable');
    expect(removed).toEqual(['probe']);
  });

  it('fails when the probe cannot be read back or removed after a successful write', async () => {
    const readThrows = temporaryStorage();
    const removeThrows = temporaryStorage();
    const removeIgnored = temporaryStorage();
    const cases = [
      { ...readThrows.storage, getItem(): string | null { throw new Error('read denied'); } },
      { ...removeThrows.storage, removeItem() { throw new Error('remove denied'); } },
      { ...removeIgnored.storage, removeItem() { /* silently keeps the probe */ } },
    ];
    for (const storage of cases) {
      const checks = await runBrowserChecks({ secureContext: true, digest: validDigest, storage, probeKey: 'probe' });
      expect(checks.find((check) => check.id === 'storage')?.status).toBe('fail');
    }
    expect(readThrows.store.size).toBe(0);
  });

  it('omits an IndexedDB factory that throws, is null or cannot delete databases', async () => {
    for (const fake of [
      { isSecureContext: true, get indexedDB(): unknown { throw new Error('blocked'); } },
      { isSecureContext: true, indexedDB: undefined },
      { isSecureContext: true, indexedDB: { open: () => ({}) } },
    ]) {
      await withWindow(fake, () => {
        expect(Object.hasOwn(browserCheckEnvironment(), 'indexedDb')).toBe(false);
        return Promise.resolve();
      });
    }
  });

  it('reports IndexedDB as unavailable when opening is refused, without leaving a database', async () => {
    for (const open of ['throws', 'errors'] as const) {
      const fake = scriptedIndexedDb({ open });
      const checks = await runBrowserChecks({ secureContext: true, indexedDb: fake.indexedDb, probeKey: 'probe' });
      expect(statusOf(checks, 'indexeddb')).toBe('unavailable');
      if (open === 'errors') expect(fake.deleted).toEqual(['probe']);
    }
  });

  it('fails IndexedDB when the record reads back wrong or the temporary database cannot be deleted', async () => {
    const corrupt = scriptedIndexedDb({ corruptRead: true });
    expect(statusOf(await runBrowserChecks({ secureContext: true, indexedDb: corrupt.indexedDb, probeKey: 'probe' }), 'indexeddb')).toBe('fail');
    expect(corrupt.deleted).toEqual(['probe']);
    expect(corrupt.closed()).toBe(1);

    const undeletable = scriptedIndexedDb({ deleteFails: true });
    expect(statusOf(await runBrowserChecks({ secureContext: true, indexedDb: undeletable.indexedDb, probeKey: 'probe' }), 'indexeddb')).toBe('fail');

    const healthy = scriptedIndexedDb();
    expect(statusOf(await runBrowserChecks({ secureContext: true, indexedDb: healthy.indexedDb, probeKey: 'probe' }), 'indexeddb')).toBe('pass');
    expect(healthy.deleted).toEqual(['probe']);
  });

  it('fails IndexedDB that never answers, after a bounded wait, and still requests deletion', async () => {
    vi.useFakeTimers();
    const fake = scriptedIndexedDb({ open: 'hangs' });
    const pending = runBrowserChecks({ secureContext: true, indexedDb: fake.indexedDb, probeKey: 'probe' });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fake.deleted).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(statusOf(await pending, 'indexeddb')).toBe('fail');
    expect(fake.deleted).toEqual(['probe']);
  });

  it('closes a connection that arrives after the deadline so the queued delete can finish', async () => {
    vi.useFakeTimers();
    const fake = scriptedIndexedDb({ open: 'late' });
    const pending = runBrowserChecks({ secureContext: true, indexedDb: fake.indexedDb, probeKey: 'probe' });
    await vi.advanceTimersByTimeAsync(5_100);
    expect(statusOf(await pending, 'indexeddb')).toBe('fail');
    expect(fake.deleted).toEqual(['probe']);
    expect(fake.closed()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.closed()).toBe(1);
  });

  it('fails IndexedDB when deleting the temporary database never answers, after a bounded wait', async () => {
    vi.useFakeTimers();
    const fake = scriptedIndexedDb({ deleteHangs: true });
    const pending = runBrowserChecks({ secureContext: true, indexedDb: fake.indexedDb, probeKey: 'probe' });
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.deleted).toEqual(['probe']);
    expect(fake.closed()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(statusOf(await pending, 'indexeddb')).toBe('fail');
  });

  it('names probes from cryptographic randomness, so tabs with equal clocks do not share a probe name', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const names: (string | undefined)[] = [];
      // Two independent contexts without randomUUID (for example an insecure context) and the same clock reading.
      for (let tab = 0; tab < 2; tab += 1) {
        await withWindow({ crypto: { getRandomValues: <T extends ArrayBufferView>(array: T): T => crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T } }, () => {
          names.push(browserCheckEnvironment().probeKey);
          return Promise.resolve();
        });
      }
      expect(names[0]).toMatch(/^__ghostpay_capability_[0-9a-f]{32}$/);
      expect(names[1]).toMatch(/^__ghostpay_capability_[0-9a-f]{32}$/);
      expect(names[0]).not.toBe(names[1]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('reports both storage probes unavailable, without touching storage, when no cryptographic randomness exists', async () => {
    const { store, storage } = temporaryStorage();
    const indexedDb = memoryIndexedDb();
    const open = vi.spyOn(indexedDb, 'open');
    for (const crypto of [{}, { randomUUID() { throw new Error('denied'); }, getRandomValues() { throw new Error('denied'); } }]) {
      await withWindow({ isSecureContext: true, crypto, localStorage: storage, indexedDB: indexedDb }, async () => {
        const env = browserCheckEnvironment();
        expect(Object.hasOwn(env, 'probeKey')).toBe(false);
        const checks = await runBrowserChecks(env);
        expect(statusOf(checks, 'storage')).toBe('unavailable');
        expect(statusOf(checks, 'indexeddb')).toBe('unavailable');
      });
    }
    expect(store.size).toBe(0);
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves unrelated databases intact and lets concurrent probes with distinct names both pass', async () => {
    const indexedDb = memoryIndexedDb();
    await new Promise<void>((resolve) => {
      const request = indexedDb.open('ghostpay-tags', 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('records'); };
      request.onsuccess = () => { resolve(); };
    });
    const [first, second] = await Promise.all([
      runBrowserChecks({ secureContext: true, indexedDb, probeKey: '__ghostpay_capability_a' }),
      runBrowserChecks({ secureContext: true, indexedDb, probeKey: '__ghostpay_capability_b' }),
    ]);
    expect(statusOf(first, 'indexeddb')).toBe('pass');
    expect(statusOf(second, 'indexeddb')).toBe('pass');
    expect(await indexedDb.databases()).toEqual([{ name: 'ghostpay-tags', version: 2 }]);
  });
});
