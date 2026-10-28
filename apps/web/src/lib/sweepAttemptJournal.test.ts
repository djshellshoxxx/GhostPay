import { describe, expect, it } from 'vitest';
import type { DirectSweepAttempt, SweepLock } from './sweep';
import { MAX_SWEEP_ATTEMPTS, readSweepAttempts, SWEEP_JOURNAL_KEY, SweepJournalUnavailableError, writeSweepAttempt, type SweepJournalStorage } from './sweepAttemptJournal';

function storage(): SweepJournalStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const owner = (n: number): `0x${string}` => `0x${n.toString(16).padStart(40, '0')}`;
const lock = (n: number, status: SweepLock['status'] = 'unknown-after-handoff'): SweepLock => ({
  chainId: 84532, owner: owner(n), nonce: 3, expectedHash: `0x${'ab'.repeat(32)}`, status,
});
const DEST = '0x6666666666666666666666666666666666666666';

describe('tab-scoped sweep attempt journal', () => {
  it('round-trips a lock exactly, with and without a nonce', () => {
    const s = storage();
    writeSweepAttempt(lock(1), s);
    const relayed: SweepLock = { chainId: 84532, owner: owner(2), expectedHash: `0x${'cd'.repeat(32)}`, status: 'submitted' };
    writeSweepAttempt(relayed, s);
    expect(readSweepAttempts(s)).toEqual([lock(1), relayed]);
  });

  it('persists only the lock fields: never destination, asset or amount', () => {
    const s = storage();
    const full: DirectSweepAttempt = { ...lock(1), destination: DEST, asset: 'native', amount: 123456789n };
    writeSweepAttempt(full, s);
    const raw = s.data.get(SWEEP_JOURNAL_KEY) ?? '';
    expect(raw).not.toContain(DEST.slice(2));
    expect(raw).not.toContain('123456789');
    expect(Object.keys(JSON.parse(raw)[0] as object).sort()).toEqual(['chainId', 'expectedHash', 'nonce', 'owner', 'status']);
  });

  it('keeps one lock per chain and owner, the latest status winning', () => {
    const s = storage();
    writeSweepAttempt(lock(1), s);
    writeSweepAttempt({ ...lock(1), owner: owner(1).toUpperCase().replace('0X', '0x') as `0x${string}`, status: 'included' }, s);
    expect(readSweepAttempts(s)).toHaveLength(1);
    expect(readSweepAttempts(s)[0]?.status).toBe('included');
  });

  it.each([
    ['not JSON', '{'],
    ['not an array', '{}'],
    ['tombstone', '"unavailable"'],
    ['unknown field', JSON.stringify([{ ...lock(1), destination: DEST }])],
    ['bad hash', JSON.stringify([{ ...lock(1), expectedHash: '0x12' }])],
    ['upper-case hash', JSON.stringify([{ ...lock(1), expectedHash: `0x${'AB'.repeat(32)}` }])],
    ['bad status', JSON.stringify([{ ...lock(1), status: 'done' }])],
    ['bad owner', JSON.stringify([{ ...lock(1), owner: '0x1234' }])],
    ['zero chainId', JSON.stringify([{ ...lock(1), chainId: 0 }])],
    ['fractional chainId', JSON.stringify([{ ...lock(1), chainId: 1.5 }])],
    ['string chainId', JSON.stringify([{ ...lock(1), chainId: '84532' }])],
    ['negative nonce', JSON.stringify([{ ...lock(1), nonce: -1 }])],
    ['string nonce', JSON.stringify([{ ...lock(1), nonce: '3' }])],
    ['duplicate owner', JSON.stringify([lock(1), { ...lock(1), status: 'submitted' }])],
    ['oversized', 'x'.repeat(40_000)],
  ])('fails closed on a malformed journal (%s)', (_name, raw) => {
    const s = storage();
    s.data.set(SWEEP_JOURNAL_KEY, raw);
    expect(() => readSweepAttempts(s)).toThrow(SweepJournalUnavailableError);
    expect(() => { writeSweepAttempt(lock(9), s); }).toThrow(SweepJournalUnavailableError);
    expect(s.data.get(SWEEP_JOURNAL_KEY)).toBe(raw);
  });

  it('fails closed when storage throws, and leaves a tombstone when a write does not stick', () => {
    expect(() => readSweepAttempts({ getItem: () => { throw new Error('denied'); }, setItem: () => undefined })).toThrow(SweepJournalUnavailableError);

    // setItem silently drops the journal but accepts the tombstone.
    const lossy = storage();
    writeSweepAttempt(lock(1), lossy);
    const before = lossy.data.get(SWEEP_JOURNAL_KEY);
    let calls = 0;
    const dropping: SweepJournalStorage = { getItem: (k) => lossy.getItem(k), setItem: (k, v) => { calls += 1; if (calls > 1) lossy.setItem(k, v); } };
    expect(() => { writeSweepAttempt(lock(2), dropping); }).toThrow(SweepJournalUnavailableError);
    expect(lossy.data.get(SWEEP_JOURNAL_KEY)).not.toBe(before);
    expect(() => readSweepAttempts(lossy)).toThrow(SweepJournalUnavailableError);

    // Quota: every setItem throws; the old journal stays and the caller is told.
    const full = storage();
    writeSweepAttempt(lock(1), full);
    const quota: SweepJournalStorage = { getItem: (k) => full.getItem(k), setItem: () => { throw new Error('quota'); } };
    expect(() => { writeSweepAttempt(lock(2), quota); }).toThrow(SweepJournalUnavailableError);
  });

  it('evicts only resolved locks when full and refuses when every lock is unresolved', () => {
    const s = storage();
    for (let i = 1; i <= MAX_SWEEP_ATTEMPTS; i += 1) writeSweepAttempt(lock(i, i === 5 ? 'reverted' : 'submitted'), s);
    writeSweepAttempt(lock(1000), s);
    const owners = readSweepAttempts(s).map((a) => a.owner);
    expect(owners).not.toContain(owner(5));
    expect(owners).toContain(owner(1000));
    expect(() => { writeSweepAttempt(lock(2000), s); }).toThrow(/still pending/);
    expect(readSweepAttempts(s).map((a) => a.owner)).not.toContain(owner(2000));
  });
});
