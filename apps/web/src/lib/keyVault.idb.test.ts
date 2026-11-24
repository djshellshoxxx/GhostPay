import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbKeyVaultStore } from './keyVault';
import { fakeDb, installOpenFactory } from '../test/fakeIndexedDb';

afterEach(() => { vi.unstubAllGlobals(); });

describe('seller key vault IndexedDB connection recovery (GP-PAGES, Feature D)', () => {
  it('retries a failed open on the next call instead of keeping the rejection', async () => {
    const { requests, open } = installOpenFactory();
    const store = new IndexedDbKeyVaultStore();
    const first = store.get();
    requests[0]!.onerror?.();
    await expect(first).rejects.toThrow(/open encrypted browser storage/i);
    const retry = store.get();
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = fakeDb({ getResult: 'cipher' });
    requests[1]!.onsuccess?.();
    await expect(retry).resolves.toBe('cipher');
  });

  it('reports a blocked open, retries, and closes the old request when it succeeds late', async () => {
    const { requests, open } = installOpenFactory();
    const store = new IndexedDbKeyVaultStore();
    const blocked = store.get();
    requests[0]!.onblocked?.();
    await expect(blocked).rejects.toThrow(/another tab/i);
    const retry = store.get();
    expect(open).toHaveBeenCalledTimes(2);
    requests[1]!.result = fakeDb();
    requests[1]!.onsuccess?.();
    await expect(retry).resolves.toBeUndefined();
    const stale = fakeDb();
    requests[0]!.result = stale;
    requests[0]!.onsuccess?.();
    expect(stale.close).toHaveBeenCalledOnce();
    // The live connection is kept: no third open.
    await expect(store.get()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens again after another tab upgraded the database or the browser closed the connection', async () => {
    const { requests, open } = installOpenFactory();
    const store = new IndexedDbKeyVaultStore();
    const first = store.get();
    const db = fakeDb();
    requests[0]!.result = db;
    requests[0]!.onsuccess?.();
    await expect(first).resolves.toBeUndefined();
    (db as unknown as { onversionchange: () => void }).onversionchange();
    expect(db.close).toHaveBeenCalledOnce();
    const second = store.get();
    expect(open).toHaveBeenCalledTimes(2);
    const db2 = fakeDb();
    requests[1]!.result = db2;
    requests[1]!.onsuccess?.();
    await expect(second).resolves.toBeUndefined();
    (db2 as unknown as { onclose: () => void }).onclose();
    void store.get().catch(() => undefined);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('retries once on a connection the browser already closed, and reports a full quota as such', async () => {
    const { requests, open } = installOpenFactory();
    const store = new IndexedDbKeyVaultStore();
    const put = store.putIfEmpty('cipher', () => undefined);
    requests[0]!.result = fakeDb({ throwOnTransaction: 'InvalidStateError' });
    requests[0]!.onsuccess?.();
    await vi.waitFor(() => { expect(open).toHaveBeenCalledTimes(2); });
    requests[1]!.result = fakeDb({ putError: { name: 'QuotaExceededError' } });
    requests[1]!.onsuccess?.();
    await expect(put).rejects.toThrow(/storage is full/);
    // A constraint error still means an existing record, not a full quota.
    const other = new IndexedDbKeyVaultStore();
    const exists = other.putIfEmpty('cipher', () => undefined);
    requests[2]!.result = fakeDb({ putError: { name: 'ConstraintError' } });
    requests[2]!.onsuccess?.();
    await expect(exists).rejects.toThrow(/already exists/);
  });

  it('a revoked session aborts the write before it can commit, also on the retried connection', async () => {
    const { requests } = installOpenFactory();
    const store = new IndexedDbKeyVaultStore();
    let revoked = false;
    const put = store.putIfEmpty('cipher', () => { if (revoked) throw new Error('revoked'); });
    requests[0]!.result = fakeDb();
    requests[0]!.onsuccess?.();
    revoked = true;
    await expect(put).rejects.toThrow(/revoked/);
  });
});
