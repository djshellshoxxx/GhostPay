import { describe, expect, it } from 'vitest';
import { beginAttempt, clearAttempt, finishAttempt, readAttempts, type AttemptStorage } from './duplicateAttemptJournal';

const key = '0x' + 'a'.repeat(64);
const account = '0x' + '1'.repeat(40);
function storage(): AttemptStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const input = { key, chainId: 1, account, kind: 'payment' as const };
describe('tab-scoped duplicate-attempt journal', () => {
  it('persists before send, blocks repeated attempts, and never expires unknown outcomes', () => {
    const store = storage();
    beginAttempt(input, store);
    expect(readAttempts(store)).toMatchObject([{ ...input, status: 'unknown' }]);
    expect(() => beginAttempt(input, store)).toThrow(/already|previous/i);
    expect(readAttempts(store)).toHaveLength(1);
  });
  it('retains a returned hash even after explicit clearing while the wallet is in flight', () => {
    const store = storage();
    const attempt = beginAttempt(input, store);
    clearAttempt(key, true, store);
    finishAttempt(attempt, `0x${'b'.repeat(64)}`, store);
    expect(readAttempts(store)).toMatchObject([{ hash: `0x${'b'.repeat(64)}`, status: 'submitted' }]);
  });
  it('retains both hashes when a cleared old request and its explicit replacement return late', () => {
    const store = storage();
    const old = beginAttempt(input, store);
    clearAttempt(key, true, store);
    const replacement = beginAttempt(input, store);
    finishAttempt(old, `0x${'b'.repeat(64)}`, store);
    finishAttempt(replacement, `0x${'c'.repeat(64)}`, store);
    expect(readAttempts(store).map((a) => a.hash).sort()).toEqual([`0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`]);
  });
  it('requires explicit confirmation to clear and does not evict unresolved records at capacity', () => {
    const store = storage();
    beginAttempt(input, store);
    expect(() => clearAttempt(key, false, store)).toThrow(/confirm/i);
    for (let i = 1; i < 128; i++) beginAttempt({ ...input, key: `0x${i.toString(16).padStart(64, '0')}` }, store);
    expect(() => beginAttempt({ ...input, key: `0x${'c'.repeat(64)}` }, store)).toThrow(/limit|full/i);
    expect(readAttempts(store)).toHaveLength(128);
  });
  it('refuses corrupt, oversized and unavailable storage before a wallet request can start', () => {
    expect(() => beginAttempt(input, { getItem: () => '{', setItem: () => undefined })).toThrow(/journal/i);
    expect(() => beginAttempt(input, { getItem: () => 'x'.repeat(100_001), setItem: () => undefined })).toThrow(/journal/i);
    expect(() => beginAttempt(input, { getItem: () => null, setItem: () => { throw new Error('quota'); } })).toThrow();
  });
});
