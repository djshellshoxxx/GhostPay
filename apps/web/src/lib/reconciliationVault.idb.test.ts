import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdbReconciliationVaultStore } from './reconciliationVault';

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
