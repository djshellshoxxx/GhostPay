// @vitest-environment jsdom
// Clearing an attempt whose returned hash has not finished saving must refuse visibly instead of reporting success while
// the in-memory evidence restores the record on the next read or write.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginAttempt, clearAttemptLocked, finishReturnedAttempt, readAttempts, readReturnedAttempts, retryReturnedAttempts, withAttemptJournal, type AttemptStorage } from './duplicateAttemptJournal';
import { clearPolicyAction } from '../features/policy/withdrawalJournal';
import { UserFacingError } from './errors';
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
const input = { key, chainId: 1, account, kind: 'transaction' as const };
const STILL_SAVING = 'error.duplicateAttemptJournal.returnedHashStillSaving';
function memory(): { readonly storage: AttemptStorage; fail: boolean } {
  let raw: string | null = null;
  const result = { fail: false, storage: {
    getItem: () => raw,
    setItem: (_key: string, value: string): void => { if (result.fail) throw new Error('synthetic unavailable write'); raw = value; },
  } };
  return result;
}
async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try { await promise; } catch (e) { return e instanceof UserFacingError ? e.translation?.key : `unexpected ${String(e)}`; }
  return undefined;
}

beforeEach(() => { stage.fail = false; localStorage.clear(); sessionStorage.clear(); installTestLocks(); });
afterEach(async () => { stage.fail = false; vi.restoreAllMocks(); await retryReturnedAttempts(); });

describe('clearing an attempt whose returned hash is still unsaved', () => {
  it('refuses on an explicit store, keeps the evidence, and clears after the hash is saved', async () => {
    const store = memory();
    const attempt = beginAttempt(input, store.storage);
    store.fail = true;
    await expect(finishReturnedAttempt(attempt, hash, { storage: store.storage })).rejects.toThrow(UserFacingError);
    expect(readReturnedAttempts(store.storage).map((a) => a.hash)).toEqual([hash]);

    expect(await refusal(clearAttemptLocked(attempt.id, true, { storage: store.storage }))).toBe(STILL_SAVING);
    expect(await refusal(clearAttemptLocked(key, true, { storage: store.storage }))).toBe(STILL_SAVING);
    expect(readAttempts(store.storage).map((a) => a.hash)).toEqual([hash]);

    store.fail = false;
    await retryReturnedAttempts(store.storage);
    expect(readReturnedAttempts(store.storage)).toEqual([]);
    await clearAttemptLocked(attempt.id, true, { storage: store.storage });
    expect(readAttempts(store.storage)).toEqual([]);
  });

  it('refuses the policy clear of an unsaved returned hash inside the journal lock', async () => {
    const store = memory();
    const attempt = beginAttempt(input, store.storage);
    store.fail = true;
    await expect(finishReturnedAttempt(attempt, hash, { storage: store.storage })).rejects.toThrow(UserFacingError);
    expect(await refusal(clearPolicyAction(key, true, store.storage, createTestLocks()))).toBe(STILL_SAVING);
    expect(readAttempts(store.storage).map((a) => a.key)).toEqual([key]);
  });

  it('refuses through the durable browser journal while the commit keeps failing', async () => {
    const attempt = await withAttemptJournal((storage) => beginAttempt(input, storage));
    stage.fail = true;
    await expect(finishReturnedAttempt(attempt, hash)).rejects.toThrow();
    expect(readReturnedAttempts().map((a) => a.hash)).toEqual([hash]);
    expect(await refusal(clearAttemptLocked(attempt.id, true))).toBe(STILL_SAVING);
    expect(readAttempts().some((a) => a.id === attempt.id && a.hash === hash)).toBe(true);

    stage.fail = false;
    await retryReturnedAttempts();
    await clearAttemptLocked(attempt.id, true);
    expect(readAttempts().some((a) => a.id === attempt.id)).toBe(false);
  });
});
