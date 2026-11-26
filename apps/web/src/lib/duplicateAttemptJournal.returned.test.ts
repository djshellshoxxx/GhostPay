// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, ATTEMPT_JOURNAL_LOCK, beginAttempt, clearAttemptLocked, finishReturnedAttempt, readAttempts, readReturnedAttempts, retryReturnedAttempts, withAttemptJournal, type AttemptLockManager, type AttemptStorage, type WalletAttempt } from './duplicateAttemptJournal';
import { createTestLocks, installTestLocks } from '../test/locks';
const stage = vi.hoisted(() => ({ fail: false }));
vi.mock('./attemptJournalStorage', async (load) => {
  const actual = await load<typeof import('./attemptJournalStorage')>();
  return { ...actual, updateJournalSnapshot: <T,>(update: (saved: unknown) => { readonly result: T; readonly snapshot: string }) =>
    actual.updateJournalSnapshot((saved) => {
      const next = update(saved);
      if (stage.fail) throw new Error('synthetic commit interruption after staging');
      return next;
    }),
  };
});
const account = `0x${'1'.repeat(40)}`;
const key = `0x${'a'.repeat(64)}`;
const hash = `0x${'b'.repeat(64)}`;
const replacement = `0x${'c'.repeat(64)}`;
const input = { key, chainId: 1, account, kind: 'payment' as const };
function memory(): { readonly storage: AttemptStorage; fail: boolean; readonly raw: () => string | null } {
  let raw: string | null = null;
  const result = { fail: false, raw: () => raw, storage: {
    getItem: () => raw,
    setItem: (_key: string, value: string): void => { if (result.fail) throw new Error('synthetic unavailable write'); raw = value; },
  } };
  return result;
}
beforeEach(() => { stage.fail = false; localStorage.clear(); sessionStorage.clear(); installTestLocks(); });
afterEach(async () => { stage.fail = false; vi.restoreAllMocks(); await retryReturnedAttempts(); });

describe('returned outcomes survive until the actual durable commit', () => {
  it('keeps the hash and duplicate blocker when IndexedDB fails after the staged mutation succeeded', async () => {
    const attempt = await withAttemptJournal((store) => beginAttempt(input, store));
    const before = localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    stage.fail = true;
    await expect(finishReturnedAttempt(attempt, hash)).rejects.toThrow(/journal/i);
    expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(before);
    expect(readReturnedAttempts()).toMatchObject([{ id: attempt.id, account, chainId: 1, hash }]);
    expect(readAttempts()).toMatchObject([{ status: 'submitted', hash }]);
    await expect(withAttemptJournal((store) => beginAttempt(input, store))).rejects.toThrow(/previous wallet attempt/i);
    stage.fail = false;
    await retryReturnedAttempts();
    expect(readReturnedAttempts()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]')).toMatchObject([{ status: 'submitted', hash }]);
  });
  it('retains fallback after an IndexedDB commit whose mirror failed and preserves newer records and resolution metadata', async () => {
    const attempt = await withAttemptJournal((store) => beginAttempt(input, store));
    const writeLocal = localStorage.setItem.bind(localStorage);
    const writeSession = sessionStorage.setItem.bind(sessionStorage);
    const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, value: string) {
      if (this === localStorage && k === ATTEMPT_JOURNAL_KEY) throw new Error('synthetic mirror quota');
      (this === localStorage ? writeLocal : writeSession)(k, value);
    });
    await expect(finishReturnedAttempt(attempt, hash)).rejects.toThrow(/journal/i);
    expect(localStorage.getItem(ATTEMPT_JOURNAL_KEY)).not.toContain(hash);
    expect(readReturnedAttempts()).toMatchObject([{ hash }]);
    failed.mockRestore();
    const observed: WalletAttempt = { ...attempt, status: 'submitted', hash, nonce: 7, replacements: [replacement] };
    localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([observed]));
    const other = await withAttemptJournal((store) => beginAttempt({ ...input, key: `0x${'d'.repeat(64)}` }, store));
    await retryReturnedAttempts();
    expect(readReturnedAttempts()).toEqual([]);
    expect(readAttempts()).toEqual([observed, other]);
  });
  it('keeps a late hash after explicit clearing and retries under a fresh lock instead of inheriting lockHeld', async () => {
    const store = memory(); const locks = createTestLocks();
    const access = { storage: store.storage, lockManager: locks };
    const attempt = await withAttemptJournal((s) => beginAttempt(input, s), access);
    await clearAttemptLocked(attempt.id, true, access);
    expect(readAttempts(store.storage)).toEqual([]);
    store.fail = true;
    await expect(locks.request(ATTEMPT_JOURNAL_LOCK, () => finishReturnedAttempt(attempt, hash, { ...access, lockHeld: true }))).rejects.toThrow(/journal/i);
    expect(store.raw()).toBe('[]');
    expect(readAttempts(store.storage)).toMatchObject([{ hash, status: 'submitted' }]);
    await expect(withAttemptJournal((s) => beginAttempt(input, s), access)).rejects.toThrow(/previous wallet attempt/i);
    store.fail = false;
    const grants = locks.granted(ATTEMPT_JOURNAL_LOCK);
    await retryReturnedAttempts(store.storage);
    expect(locks.granted(ATTEMPT_JOURNAL_LOCK)).toBe(grants + 1);
    expect(readReturnedAttempts(store.storage)).toEqual([]);
    expect(JSON.parse(store.raw() ?? '[]')).toMatchObject([{ id: attempt.id, hash }]);
  });
  it('deduplicates retries while the original finish is queued and clears fallback on eventual success', async () => {
    const store = memory(); const locks = createTestLocks();
    const access = { storage: store.storage, lockManager: locks };
    const attempt = await withAttemptJournal((s) => beginAttempt(input, s), access);
    let release = (): void => undefined;
    const held = locks.request(ATTEMPT_JOURNAL_LOCK, () => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(true));
    const grants = locks.granted(ATTEMPT_JOURNAL_LOCK);
    const finishing = finishReturnedAttempt(attempt, hash, access);
    const retries = [retryReturnedAttempts(store.storage), retryReturnedAttempts(store.storage)];
    expect(readReturnedAttempts(store.storage)).toMatchObject([{ hash }]);
    expect(store.raw()).not.toContain(hash);
    release(); await held; await finishing; await Promise.all(retries);
    expect(locks.granted(ATTEMPT_JOURNAL_LOCK)).toBe(grants + 1);
    expect(readReturnedAttempts(store.storage)).toEqual([]);
    expect(store.raw()).toContain(hash);
  });
  it('keeps fallback evidence when a supplied lock wrapper settles without committing', async () => {
    const store = memory(); const attempt = beginAttempt(input, store.storage);
    const locks: AttemptLockManager = { request: <T,>() => Promise.resolve(undefined as T) };
    await expect(finishReturnedAttempt(attempt, hash, { storage: store.storage, lockManager: locks })).rejects.toThrow(/journal/i);
    expect(readReturnedAttempts(store.storage)).toMatchObject([{ hash }]);
    expect(store.raw()).not.toContain(hash);
  });
  it('retains conflicting hashes and refuses a merge instead of replacing either outcome', async () => {
    const store = memory(); const attempt = beginAttempt(input, store.storage);
    const access = { storage: store.storage, lockManager: createTestLocks() };
    store.fail = true;
    await expect(finishReturnedAttempt(attempt, hash, access)).rejects.toThrow(/journal/i);
    await expect(finishReturnedAttempt(attempt, replacement, access)).rejects.toThrow(/journal/i);
    expect(readReturnedAttempts(store.storage).map((record) => record.hash)).toEqual([hash, replacement]);
    expect(() => readAttempts(store.storage)).toThrow(/journal/i);
    expect(store.raw()).not.toContain(hash);
    expect(store.raw()).not.toContain(replacement);
  });
});
