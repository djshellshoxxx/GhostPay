import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdbTagStore } from './idbStore';

interface PendingOpen {
  result: IDBDatabase;
  onerror?: () => void;
  onblocked?: () => void;
  onsuccess?: () => void;
}

/** Control open outcomes without a new IndexedDB implementation dependency. */
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
        objectStore: () => ({ get: () => ({ result: undefined }), getAll: () => ({ result: [] }) }),
      };
      queueMicrotask(() => { tx.oncomplete?.(); });
      return tx;
    },
  } as unknown as IDBDatabase;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('IndexedDB connection recovery', () => {
  it('retries a failed open and reads the existing database without a page reload', async () => {
    const { requests, open } = installFactory();
    const store = new IdbTagStore();
    const first = store.getSnapshot();
    requests[0]!.onerror?.();
    await expect(first).rejects.toThrow('IndexedDB unavailable');
    const retry = store.getSnapshot();
    // Observe a rejection even when the original implementation reuses its rejected promise.
    void retry.catch(() => undefined);
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = emptyDatabase();
    requests[1]!.onsuccess?.();
    await expect(retry).resolves.toEqual({ records: [], revision: 0 });
  });

  it('retries a synchronous browser open failure instead of keeping a rejected connection', async () => {
    const { requests, open } = installFactory();
    open.mockImplementationOnce(() => { throw new Error('temporarily unavailable'); });
    const store = new IdbTagStore();
    await expect(store.getSnapshot()).rejects.toThrow('temporarily unavailable');
    const retry = store.getSnapshot();
    void retry.catch(() => undefined);
    expect(open).toHaveBeenCalledTimes(2);
    requests[0]!.result = emptyDatabase();
    requests[0]!.onsuccess?.();
    await expect(retry).resolves.toEqual({ records: [], revision: 0 });
  });

  it('does not let an old blocked request invalidate a newer in-flight connection', async () => {
    const { requests, open } = installFactory();
    const store = new IdbTagStore();
    const blocked = store.getSnapshot();
    requests[0]!.onblocked?.();
    await expect(blocked).rejects.toThrow(/Close older GhostPay tabs/);
    const retry = store.getSnapshot();
    requests[0]!.onblocked?.();
    const concurrent = store.getSnapshot();
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = emptyDatabase();
    requests[1]!.onsuccess?.();
    await expect(retry).resolves.toEqual({ records: [], revision: 0 });
    await expect(concurrent).resolves.toEqual({ records: [], revision: 0 });
    const oldDb = emptyDatabase();
    const close = vi.spyOn(oldDb, 'close');
    requests[0]!.result = oldDb;
    requests[0]!.onsuccess?.();
    expect(close).toHaveBeenCalledOnce();
  });
});
