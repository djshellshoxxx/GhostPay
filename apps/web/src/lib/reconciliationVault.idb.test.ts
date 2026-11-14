import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdbReconciliationVaultStore } from './reconciliationVault';
import { fakeDb, installOpenFactory } from '../test/fakeIndexedDb';

interface PendingOpen {
  result: IDBDatabase;
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
}

/** Exercise browser open callbacks without relying on a persistent IndexedDB test environment. */
function installFactory(): { readonly requests: PendingOpen[]; readonly open: ReturnType<typeof vi.fn> } {
  const requests: PendingOpen[] = [];
  const open = vi.fn(() => {
    const request = { result: undefined as unknown as IDBDatabase };
    requests.push(request);
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  return { requests, open };
}

function emptyDatabase(): IDBDatabase {
  return {
    close: vi.fn(),
    transaction: () => {
      const tx = {
        oncomplete: undefined as (() => void) | undefined,
        objectStore: () => ({ get: () => ({ result: undefined }) }),
      };
      queueMicrotask(() => { tx.oncomplete?.(); });
      return tx;
    },
  } as unknown as IDBDatabase;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('encrypted reconciliation IndexedDB connection recovery', () => {
  it('retries a failed open without requiring a page reload', async () => {
    const { requests, open } = installFactory();
    const store = new IdbReconciliationVaultStore();
    const first = store.read('scope');
    requests[0]!.onerror?.();
    await expect(first).rejects.toThrow();

    const retry = store.read('scope');
    void retry.catch(() => undefined);
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = emptyDatabase();
    requests[1]!.onsuccess?.();
    await expect(retry).resolves.toBeNull();
  });

  it('recovers from an upgrade blocked by another tab without letting the old open win', async () => {
    const { requests, open } = installFactory();
    const store = new IdbReconciliationVaultStore();
    const blocked = store.read('scope');
    requests[0]!.onblocked?.();
    await expect(blocked).rejects.toThrow();

    const retry = store.read('scope');
    void retry.catch(() => undefined);
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = emptyDatabase();
    requests[1]!.onsuccess?.();
    await expect(retry).resolves.toBeNull();

    const staleDb = emptyDatabase();
    const close = vi.spyOn(staleDb, 'close');
    requests[0]!.result = staleDb;
    requests[0]!.onsuccess?.();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('encrypted reconciliation IndexedDB: closed connections and a full quota', () => {
  it('opens again after the browser closed the connection (close event)', async () => {
    const { requests, open } = installOpenFactory();
    const store = new IdbReconciliationVaultStore();
    const first = store.read('scope');
    const db = fakeDb();
    requests[0]!.result = db;
    requests[0]!.onsuccess?.();
    await expect(first).resolves.toBeNull();
    (db as unknown as { onclose: () => void }).onclose();
    const second = store.read('scope');
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = fakeDb({ getResult: 'cipher' });
    requests[1]!.onsuccess?.();
    await expect(second).resolves.toBe('cipher');
  });

  it('drops a dead connection whose transaction() throws InvalidStateError and retries the operation once', async () => {
    const { requests, open } = installOpenFactory();
    const store = new IdbReconciliationVaultStore();
    const dead = fakeDb({ throwOnTransaction: 'InvalidStateError' });
    const read = store.read('scope');
    requests[0]!.result = dead;
    requests[0]!.onsuccess?.();
    await vi.waitFor(() => { expect(open).toHaveBeenCalledTimes(2); });
    requests[1]!.result = fakeDb({ getResult: 'cipher' });
    requests[1]!.onsuccess?.();
    await expect(read).resolves.toBe('cipher');
    expect(dead.close).toHaveBeenCalled();
    // Any other synchronous failure is reported, not retried.
    const store2 = new IdbReconciliationVaultStore();
    const failing = store2.read('scope');
    requests[2]!.result = fakeDb({ throwOnTransaction: 'NotFoundError' });
    requests[2]!.onsuccess?.();
    await expect(failing).rejects.toThrow();
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('reports a full storage quota as such, and the compare-and-swap does not claim a commit', async () => {
    const { requests } = installOpenFactory();
    const store = new IdbReconciliationVaultStore();
    const swap = store.compareAndSwap('scope', null, 'next-cipher', () => undefined);
    requests[0]!.result = fakeDb({ putError: { name: 'QuotaExceededError' } });
    requests[0]!.onsuccess?.();
    await expect(swap).rejects.toThrow(/storage is full/);
    const other = new IdbReconciliationVaultStore();
    const failed = other.compareAndSwap('scope', null, 'next-cipher', () => undefined);
    requests[1]!.result = fakeDb({ putError: { name: 'UnknownError' } });
    requests[1]!.onsuccess?.();
    await expect(failed).rejects.toThrow(/did not commit/);
  });
});
