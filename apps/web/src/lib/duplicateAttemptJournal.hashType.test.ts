import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY,
  beginAttempt,
  finishAttempt,
  readAttempts,
  type AttemptStorage,
} from './duplicateAttemptJournal';

const KEY = `0x${'a'.repeat(64)}`;
const ACCOUNT = `0x${'1'.repeat(40)}`;
const HASH = `0x${'b'.repeat(64)}`;
const input = { key: KEY, chainId: 1, account: ACCOUNT, kind: 'payment' as const };

function memoryStorage(): { readonly store: AttemptStorage; readonly writes: () => number } {
  const data = new Map<string, string>();
  let count = 0;
  return {
    store: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => { count += 1; data.set(key, value); },
    },
    writes: () => count,
  };
}

describe('wallet attempt journal — malformed provider hashes', () => {
  it('reports malformed runtime hash values as journal errors without changing the pending record', () => {
    const { store, writes } = memoryStorage();
    const attempt = beginAttempt(input, store);
    const before = writes();
    const malformed: readonly unknown[] = [
      null,
      undefined,
      123,
      123n,
      Symbol('hash'),
      [HASH],
      { toLowerCase: () => HASH },
    ];

    for (const value of malformed) {
      expect(() => finishAttempt(attempt, value as string, store)).toThrow(/journal/i);
      expect(writes()).toBe(before);
      expect(readAttempts(store)).toEqual([attempt]);
    }
  });

  it('rejects malformed repeat completions without replacing the first recorded hash', () => {
    const { store, writes } = memoryStorage();
    const attempt = beginAttempt(input, store);
    finishAttempt(attempt, HASH, store);
    const before = writes();

    expect(() => finishAttempt(attempt, { toLowerCase: () => HASH } as unknown as string, store)).toThrow(/journal/i);
    expect(writes()).toBe(before);
    expect(readAttempts(store)).toEqual([{ ...attempt, status: 'submitted', hash: HASH }]);
    expect(store.getItem(ATTEMPT_JOURNAL_KEY)).toContain(HASH);
  });

  it('keeps valid uppercase hexadecimal hashes and existing normalization working', () => {
    const { store } = memoryStorage();
    const attempt = beginAttempt(input, store);
    finishAttempt(attempt, HASH.toUpperCase().replace('0X', '0x'), store);
    expect(readAttempts(store)).toEqual([{ ...attempt, status: 'submitted', hash: HASH }]);
  });
});
