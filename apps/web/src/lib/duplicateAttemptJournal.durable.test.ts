// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_JOURNAL_KEY,
  ATTEMPT_JOURNAL_LOCK,
  attemptTxDigest,
  beginAttempt,
  clearAttemptLocked,
  finishAttempt,
  migrateBrowserAttempts,
  readAttempts,
  recordAttemptNonce,
  subscribeAttempts,
  withAttemptJournal,
  type AttemptStorage,
  type WalletAttempt,
} from './duplicateAttemptJournal';
import { createTestLocks, installTestLocks, removeTestLocks } from '../test/locks';

const account = `0x${'1'.repeat(40)}`;
const keyA = `0x${'a'.repeat(64)}`;
const keyB = `0x${'b'.repeat(64)}`;
const hashA = `0x${'c'.repeat(64)}`;
const hashB = `0x${'d'.repeat(64)}`;
const input = (key = keyA) => ({ key, chainId: 1, account, kind: 'payment' as const });
const record = (over: Partial<WalletAttempt> = {}): WalletAttempt => ({
  id: '00000000-0000-4000-8000-000000000001', key: keyA, chainId: 1, account, kind: 'payment', createdAt: 1, status: 'unknown', ...over,
});

/** One browser profile's localStorage shared by two "tabs": each tab gets its own facade over one backing Map. */
function sharedBacking(assertLocked?: () => boolean): { tab: () => AttemptStorage; raw: () => string | null; writesOutsideLock: () => number } {
  const backing = new Map<string, string>();
  let outside = 0;
  return {
    tab: () => ({
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => { if (assertLocked !== undefined && !assertLocked()) outside += 1; backing.set(k, v); },
    }),
    raw: () => backing.get(ATTEMPT_JOURNAL_KEY) ?? null,
    writesOutsideLock: () => outside,
  };
}

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); installTestLocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('durable wallet attempt journal (REC-P1-03)', () => {
  it('defaults to localStorage, shared by every tab, under the exported exclusive lock', async () => {
    const locks = installTestLocks();
    let heldDuringWrite = false;
    const original = Storage.prototype.setItem.bind(window.localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string, v: string) => {
      heldDuringWrite = locks.isHeld(ATTEMPT_JOURNAL_LOCK);
      original(k, v);
    });
    expect(ATTEMPT_JOURNAL_LOCK).toBe('ghostpay:durable-wallet-attempts:v1');
    await withAttemptJournal((store) => beginAttempt(input(), store));
    expect(heldDuringWrite).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '[]')).toMatchObject([{ key: keyA, status: 'unknown' }]);
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(readAttempts()).toHaveLength(1);
  });

  it('refuses a read-modify-write of the default durable store outside the journal lock', async () => {
    expect(() => beginAttempt(input())).toThrow(/journal/i);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    const attempt = await withAttemptJournal(() => beginAttempt(input()));
    expect(() => finishAttempt(attempt, hashA)).toThrow(/journal/i);
    expect(readAttempts()).toMatchObject([{ status: 'unknown' }]);
  });

  it('fails closed with a typed error and writes nothing when browser locks are unavailable', async () => {
    removeTestLocks();
    await expect(withAttemptJournal((store) => beginAttempt(input(), store))).rejects.toMatchObject({ name: 'UserFacingError', message: expect.stringMatching(/lock/i) as unknown });
    await expect(clearAttemptLocked(keyA, true)).rejects.toThrow(/lock/i);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
  });

  it('serializes interleaved begin/finish from two tabs without a lost update', async () => {
    const locks = createTestLocks();
    const shared = sharedBacking(() => locks.isHeld(ATTEMPT_JOURNAL_LOCK));
    const tabA = { storage: shared.tab(), lockManager: locks };
    const tabB = { storage: shared.tab(), lockManager: locks };
    const a = await withAttemptJournal((s) => beginAttempt(input(keyA), s), tabA);
    // Tab B begins another invoice while tab A's wallet popup is still open; A then finishes from its stale view.
    const [b] = await Promise.all([
      withAttemptJournal((s) => beginAttempt(input(keyB), s), tabB),
      withAttemptJournal((s) => { finishAttempt(a, hashA, s); }, tabA),
    ]);
    await withAttemptJournal((s) => { finishAttempt(b, hashB, s); }, tabB);
    expect(readAttempts(shared.tab()).map((r) => [r.key, r.hash])).toEqual([[keyA, hashA], [keyB, hashB]]);
    expect(shared.writesOutsideLock()).toBe(0);
    // Same invoice from the other tab is refused: the key is payer-independent and the store is shared.
    await expect(withAttemptJournal((s) => beginAttempt(input(keyA), s), tabB)).rejects.toThrow(/previous wallet attempt/);
  });

  it('migrates this tab\'s legacy sessionStorage records once, by id, without overwriting or dropping a hash', async () => {
    const durable = record({ id: '00000000-0000-4000-8000-00000000000a', key: keyB });
    const legacyUnknown = record({ id: '00000000-0000-4000-8000-00000000000b' });
    const legacySubmitted = record({ id: '00000000-0000-4000-8000-00000000000c', key: `0x${'e'.repeat(64)}`, status: 'submitted', hash: hashA });
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([durable]));
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([legacyUnknown, legacySubmitted, durable]));
    // A read before migration already shows the union, so a pre-send check cannot miss a legacy record.
    expect(readAttempts().map((r) => r.id)).toEqual([durable.id, legacyUnknown.id, legacySubmitted.id]);
    await expect(withAttemptJournal((s) => beginAttempt(input(keyA), s))).rejects.toThrow(/previous wallet attempt/);
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(readAttempts(window.localStorage)).toEqual([durable, legacyUnknown, legacySubmitted]);
  });

  it('keeps the returned hash when the same id is unknown in one store and submitted in the other', async () => {
    const unknown = record();
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([unknown]));
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([{ ...unknown, status: 'submitted', hash: hashA }]));
    await withAttemptJournal(() => undefined);
    expect(readAttempts(window.localStorage)).toEqual([{ ...unknown, status: 'submitted', hash: hashA }]);
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([unknown]));
    await withAttemptJournal(() => undefined);
    expect(readAttempts(window.localStorage)).toEqual([{ ...unknown, status: 'submitted', hash: hashA }]);
  });

  it.each([
    ['conflicting hashes for one id', [record({ status: 'submitted', hash: hashA })], [record({ status: 'submitted', hash: hashB })]],
    ['one id with a different action identity', [record()], [record({ key: keyB })]],
    ['a corrupt legacy store', [record()], '{"not":"an array"}'],
    ['an oversized legacy store', [record()], 'x'.repeat(100_001)],
    ['a merge above the record limit', [record()], Array.from({ length: 128 }, (_, i) => record({ id: `00000000-0000-4000-8000-${(i + 100).toString().padStart(12, '0')}` }))],
  ] as const)('fails closed on %s and changes neither store', async (_name, durable, legacy) => {
    const durableText = JSON.stringify(durable);
    const legacyText = typeof legacy === 'string' ? legacy : JSON.stringify(legacy);
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, durableText);
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, legacyText);
    await expect(withAttemptJournal((s) => beginAttempt(input(`0x${'f'.repeat(64)}`), s))).rejects.toThrow(/journal/i);
    expect(() => readAttempts()).toThrow(/journal/i);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(durableText);
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(legacyText);
  });

  it('fails closed on a corrupt or oversized durable store', async () => {
    for (const bad of ['[', 'x'.repeat(100_001), JSON.stringify([{ ...record(), extra: 1 }])]) {
      window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, bad);
      await expect(withAttemptJournal((s) => beginAttempt(input(), s))).rejects.toThrow(/journal/i);
      expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(bad);
    }
  });

  it('clears only under the lock and only with explicit confirmation', async () => {
    await withAttemptJournal((s) => beginAttempt(input(), s));
    await expect(clearAttemptLocked(keyA, false)).rejects.toThrow(/confirm/i);
    expect(readAttempts()).toHaveLength(1);
    await clearAttemptLocked(keyA, true);
    expect(readAttempts()).toEqual([]);
  });

  it('notifies on this tab\'s writes and on other tabs\' storage events for the journal key only', async () => {
    const listener = vi.fn();
    const stop = subscribeAttempts(listener);
    await withAttemptJournal((s) => beginAttempt(input(), s));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: ATTEMPT_JOURNAL_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'ghostpay.settings.v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: ATTEMPT_JOURNAL_KEY }));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('optional resolution fields', () => {
  const digest = attemptTxDigest(1, account, `0x${'2'.repeat(40)}`, '0xABCD', 10n);
  it('derives the call digest from canonical lowercase JSON with a decimal value and stores no calldata or amount', async () => {
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(attemptTxDigest(1, account.toUpperCase().replace('0X', '0x'), `0x${'2'.repeat(40)}`, '0xabcd', 10n)).toBe(digest);
    expect(attemptTxDigest(1, account, `0x${'2'.repeat(40)}`, '0xabcd', 11n)).not.toBe(digest);
    await withAttemptJournal((s) => beginAttempt({ ...input(), txDigest: digest }, s));
    const raw = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY) ?? '';
    expect(raw).toContain(digest);
    expect(raw).not.toMatch(/abcd|"value"|"data"|"to"/i);
  });

  it('accepts old records and strictly validates txDigest, nonce and replacements', () => {
    const ok = record({ status: 'submitted', hash: hashA, txDigest: digest, nonce: 0, replacements: [hashB] });
    for (const valid of [record(), record({ txDigest: digest }), ok, { ...ok, nonce: Number.MAX_SAFE_INTEGER }]) {
      window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([valid]));
      expect(readAttempts(window.localStorage)).toEqual([valid]);
    }
    const invalid: unknown[] = [
      { ...record(), txDigest: digest.toUpperCase() },
      { ...record(), txDigest: 'x' },
      { ...ok, nonce: -1 }, { ...ok, nonce: 1.5 }, { ...ok, nonce: '1' }, { ...ok, nonce: 2 ** 53 },
      { ...record(), nonce: 1 },
      { ...ok, replacements: [] },
      { ...ok, replacements: [hashB, hashB] },
      { ...ok, replacements: [hashA] },
      { ...ok, replacements: [hashB.toUpperCase().replace('0X', '0x')] },
      { ...ok, replacements: Array.from({ length: 9 }, (_, i) => `0x${i.toString(16).padStart(64, '0')}`) },
      { ...ok, replacements: 'x' },
      Object.fromEntries(Object.entries(ok).filter(([field]) => field !== 'nonce')),
    ];
    for (const bad of invalid) {
      window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([bad]));
      expect(() => readAttempts(window.localStorage)).toThrow(/journal/i);
    }
  });

  it('migrates a copied legacy submission without replacing the durable nonce or linked hash', async () => {
    const legacy = record({ status: 'submitted', hash: hashA });
    const durable = { ...legacy, nonce: 7, replacements: [hashB] };
    window.sessionStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([legacy]));
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([durable]));
    expect(readAttempts()).toEqual([durable]);
    await migrateBrowserAttempts();
    expect(window.sessionStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBeNull();
    expect(readAttempts()).toEqual([durable]);
  });

  it('records an observed nonce once per hash and never changes it', async () => {
    const attempt = await withAttemptJournal((s) => beginAttempt({ ...input(), txDigest: digest }, s));
    await withAttemptJournal((s) => { finishAttempt(attempt, hashA, s); });
    await recordAttemptNonce(hashA.toUpperCase().replace('0X', '0x'), 7, attempt);
    expect(readAttempts()[0]).toMatchObject({ hash: hashA, nonce: 7, txDigest: digest });
    await expect(recordAttemptNonce(hashA, 7, attempt)).resolves.toBeUndefined();
    await expect(recordAttemptNonce(hashA, 8, attempt)).rejects.toThrow(/journal/i);
    await expect(recordAttemptNonce(hashB, 3, attempt)).resolves.toBeUndefined();
    for (const bad of [-1, 1.5, Number.NaN]) await expect(recordAttemptNonce(hashA, bad, attempt)).rejects.toThrow(/journal/i);
    expect(readAttempts()).toEqual([{ ...attempt, status: 'submitted', hash: hashA, nonce: 7 }]);
  });
});
