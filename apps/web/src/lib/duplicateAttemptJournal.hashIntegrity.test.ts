import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY,
  beginAttempt,
  clearAttempt,
  finishAttempt,
  readAttempts,
  type AttemptStorage,
} from './duplicateAttemptJournal';

const key = `0x${'a'.repeat(64)}`;
const account = `0x${'1'.repeat(40)}`;
const hashA = `0x${'b'.repeat(64)}`;
const hashB = `0x${'c'.repeat(64)}`;
const input = { key, account, chainId: 1, kind: 'payment' as const };

function trackedStorage(): { store: AttemptStorage; writes: () => number } {
  const values = new Map<string, string>();
  let count = 0;
  return {
    store: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => { count += 1; values.set(k, v); },
    },
    writes: () => count,
  };
}

describe('wallet attempt journal — first-hash integrity', () => {
  it('never replaces a submitted transaction hash with a conflicting late completion', () => {
    const { store } = trackedStorage();
    const attempt = beginAttempt(input, store);
    finishAttempt(attempt, hashA, store);

    expect(() => finishAttempt(attempt, hashB, store)).toThrow(/journal/i);
    expect(readAttempts(store)).toEqual([{ ...attempt, status: 'submitted', hash: hashA }]);
  });

  it('treats a repeated identical completion as idempotent, including uppercase hashes', () => {
    const { store, writes } = trackedStorage();
    const attempt = beginAttempt(input, store);
    finishAttempt(attempt, hashA, store);
    const before = writes();

    expect(() => finishAttempt(attempt, hashA.toUpperCase().replace('0X', '0x'), store)).not.toThrow();
    expect(writes()).toBe(before);
    expect(readAttempts(store)).toEqual([{ ...attempt, status: 'submitted', hash: hashA }]);
  });

  it('refuses to replace an existing id whose stored action identity changed', () => {
    const { store } = trackedStorage();
    const attempt = beginAttempt(input, store);
    const different = { ...attempt, key: `0x${'d'.repeat(64)}` };
    store.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([different]));

    expect(() => finishAttempt(attempt, hashA, store)).toThrow(/journal/i);
    expect(readAttempts(store)).toEqual([different]);
  });

  it('still preserves a late hash after an explicit clear and a replacement attempt', () => {
    const { store } = trackedStorage();
    const original = beginAttempt(input, store);
    clearAttempt(key, true, store);
    const replacement = beginAttempt(input, store);

    finishAttempt(original, hashA, store);
    finishAttempt(replacement, hashB, store);
    expect(readAttempts(store).map((a) => a.hash).sort()).toEqual([hashA, hashB]);
  });
});
