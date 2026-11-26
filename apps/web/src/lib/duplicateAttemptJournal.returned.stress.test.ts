// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY, ATTEMPT_JOURNAL_LOCK, beginAttempt, finishReturnedAttempt, readAttempts, readReturnedAttempts,
  retryReturnedAttempts, subscribeAttempts, withAttemptJournal, type AttemptStorage, type WalletAttempt,
} from './duplicateAttemptJournal';
import { createTestLocks, installTestLocks } from '../test/locks';

// Bounded stress: bursts of returned hashes, intermittent write failures and retry storms. Sizes stay below the
// journal's 128-record safety limit and finish in seconds on the ordinary unit lane.
const account = `0x${'1'.repeat(40)}`;
const keyOf = (i: number): string => `0x${i.toString(16).padStart(64, '0')}`;
const hashOf = (i: number): string => `0x${(i + 0x1000).toString(16).padStart(64, 'f')}`;

function flakyStore(failEvery: number): { readonly storage: AttemptStorage; writes: number; failing: boolean; readonly raw: () => string | null } {
  let raw: string | null = null;
  const state = { writes: 0, failing: true, raw: () => raw, storage: {
    getItem: () => raw,
    setItem: (_key: string, value: string): void => {
      state.writes++;
      if (state.failing && state.writes % failEvery === 0) throw new Error('synthetic intermittent quota failure');
      raw = value;
    },
  } };
  return state;
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); installTestLocks(); });
afterEach(async () => { vi.restoreAllMocks(); await retryReturnedAttempts().catch(() => undefined); });

describe('returned-hash persistence under load (stress)', () => {
  it('drains 96 concurrent returned hashes through intermittent write failures without losing or duplicating one', async () => {
    const store = flakyStore(3); const locks = createTestLocks();
    const access = { storage: store.storage, lockManager: locks };
    store.failing = false;
    const attempts: WalletAttempt[] = [];
    for (let i = 0; i < 96; i++) attempts.push(await withAttemptJournal((s) => beginAttempt({ key: keyOf(i), chainId: 1, account, kind: 'payment' }, s), access));
    store.failing = true;
    const results = await Promise.allSettled(attempts.map((attempt, i) => finishReturnedAttempt(attempt, hashOf(i), access)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    expect(failed).toBeGreaterThan(0); // The schedule really exercised failures.
    expect(readReturnedAttempts(store.storage)).toHaveLength(failed);
    // Every outcome stays visible (durable or retained) and keeps blocking a duplicate while storage is flaky.
    expect(readAttempts(store.storage).filter((a) => a.status === 'submitted')).toHaveLength(96);
    let rounds = 0;
    while (readReturnedAttempts(store.storage).length > 0 && rounds < 12) {
      await retryReturnedAttempts(store.storage).catch(() => undefined);
      rounds++;
    }
    expect(readReturnedAttempts(store.storage)).toEqual([]);
    const durable = JSON.parse(store.raw() ?? '[]') as WalletAttempt[];
    expect(durable).toHaveLength(96);
    expect(new Set(durable.map((a) => a.id)).size).toBe(96);
    for (const [i, attempt] of attempts.entries()) {
      expect(durable.find((a) => a.id === attempt.id)).toMatchObject({ status: 'submitted', hash: hashOf(i), key: keyOf(i), account, chainId: 1 });
    }
    // Bounded work: one lock grant per begin and per persistence attempt, never a retry storm.
    expect(locks.granted(ATTEMPT_JOURNAL_LOCK)).toBeLessThanOrEqual(96 + 96 + rounds * failed);
  }, 30_000);

  it('coalesces 500 concurrent retries for a queued outcome into a single journal write', async () => {
    const store = flakyStore(Number.MAX_SAFE_INTEGER); const locks = createTestLocks();
    const access = { storage: store.storage, lockManager: locks };
    const attempt = await withAttemptJournal((s) => beginAttempt({ key: keyOf(1), chainId: 1, account, kind: 'payment' }, s), access);
    let release = (): void => undefined;
    const held = locks.request(ATTEMPT_JOURNAL_LOCK, () => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => { expect(locks.isHeld(ATTEMPT_JOURNAL_LOCK)).toBe(true); });
    const grants = locks.granted(ATTEMPT_JOURNAL_LOCK);
    const finishing = finishReturnedAttempt(attempt, hashOf(1), access);
    const storm = Array.from({ length: 500 }, () => retryReturnedAttempts(store.storage));
    release(); await held;
    await Promise.all([finishing, ...storm]);
    expect(locks.granted(ATTEMPT_JOURNAL_LOCK)).toBe(grants + 1);
    expect(readReturnedAttempts(store.storage)).toEqual([]);
    expect(JSON.parse(store.raw() ?? '[]')).toMatchObject([{ id: attempt.id, hash: hashOf(1) }]);
  });

  it('settles a burst through the IndexedDB snapshot path with a bounded number of change events and no feedback loop', async () => {
    const attempts: WalletAttempt[] = [];
    for (let i = 0; i < 48; i++) attempts.push(await withAttemptJournal((s) => beginAttempt({ key: keyOf(i), chainId: 1, account, kind: 'payment' }, s)));
    let events = 0;
    // A subscriber that re-reads on every change, as WalletAttempts does, must not trigger further writes.
    const stop = subscribeAttempts(() => { events++; readAttempts(); readReturnedAttempts(); });
    try {
      await Promise.all(attempts.map((attempt, i) => finishReturnedAttempt(attempt, hashOf(i))));
    } finally { stop(); }
    expect(readReturnedAttempts()).toEqual([]);
    const durable = JSON.parse(localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]') as WalletAttempt[];
    expect(durable.filter((a) => a.status === 'submitted')).toHaveLength(48);
    // Per outcome: one retention notice, one completion notice and the mirror write's own notice at most.
    expect(events).toBeLessThanOrEqual(48 * 3);
  }, 30_000);
});
