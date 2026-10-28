import { describe, expect, it } from 'vitest';
import type { DirectSweepAttempt } from './sweep';
import { MAX_SWEEP_ATTEMPTS, readSweepAttempts, SWEEP_JOURNAL_KEY, SweepJournalUnavailableError, writeSweepAttempt, type SweepJournalStorage } from './sweepAttemptJournal';

function storage(): SweepJournalStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const owner = (n: number): `0x${string}` => `0x${n.toString(16).padStart(40, '0')}`;
const attempt = (n: number, status: DirectSweepAttempt['status'] = 'unknown-after-handoff'): DirectSweepAttempt => ({
  chainId: 84532, owner: owner(n), nonce: 3, destination: '0x6666666666666666666666666666666666666666',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount: 2n ** 200n, expectedHash: `0x${'ab'.repeat(32)}`, status,
});

describe('tab-scoped sweep attempt journal', () => {
  it('round-trips an attempt exactly, including bigint amounts and optional nonce', () => {
    const s = storage();
    writeSweepAttempt(attempt(1), s);
    const relayed: DirectSweepAttempt = { ...attempt(2, 'submitted'), asset: 'native' };
    delete (relayed as { nonce?: number }).nonce;
    writeSweepAttempt(relayed, s);
    expect(readSweepAttempts(s)).toEqual([attempt(1), relayed]);
  });

  it('keeps one record per chain and owner, the latest status winning', () => {
    const s = storage();
    writeSweepAttempt(attempt(1), s);
    writeSweepAttempt({ ...attempt(1), owner: owner(1).toUpperCase().replace('0X', '0x') as `0x${string}`, status: 'included' }, s);
    expect(readSweepAttempts(s)).toHaveLength(1);
    expect(readSweepAttempts(s)[0]?.status).toBe('included');
  });

  it.each([
    ['not JSON', '{'],
    ['not an array', '{}'],
    ['unknown field', JSON.stringify([{ ...JSON.parse(JSON.stringify({ ...attempt(1), amount: '1' })), extra: 1 }])],
    ['bad hash', JSON.stringify([{ ...attempt(1), amount: '1', expectedHash: '0x12' }])],
    ['bad status', JSON.stringify([{ ...attempt(1), amount: '1', status: 'done' }])],
    ['negative amount', JSON.stringify([{ ...attempt(1), amount: '-1' }])],
    ['duplicate owner', JSON.stringify([{ ...attempt(1), amount: '1' }, { ...attempt(1), amount: '2' }])],
    ['oversized', 'x'.repeat(70_000)],
  ])('fails closed on a malformed journal (%s)', (_name, raw) => {
    const s = storage();
    s.data.set(SWEEP_JOURNAL_KEY, raw);
    expect(() => readSweepAttempts(s)).toThrow(SweepJournalUnavailableError);
    expect(() => { writeSweepAttempt(attempt(9), s); }).toThrow(SweepJournalUnavailableError);
    expect(s.data.get(SWEEP_JOURNAL_KEY)).toBe(raw);
  });

  it('fails closed when storage throws or does not keep the write', () => {
    expect(() => readSweepAttempts({ getItem: () => { throw new Error('denied'); }, setItem: () => undefined })).toThrow(SweepJournalUnavailableError);
    expect(() => { writeSweepAttempt(attempt(1), { getItem: () => null, setItem: () => undefined }); }).toThrow(SweepJournalUnavailableError);
    expect(() => { writeSweepAttempt(attempt(1), { getItem: () => null, setItem: () => { throw new Error('quota'); } }); }).toThrow(SweepJournalUnavailableError);
  });

  it('evicts only resolved records when full and refuses when every record is unresolved', () => {
    const s = storage();
    for (let i = 1; i <= MAX_SWEEP_ATTEMPTS; i += 1) writeSweepAttempt(attempt(i, i === 5 ? 'reverted' : 'submitted'), s);
    writeSweepAttempt(attempt(1000), s);
    const owners = readSweepAttempts(s).map((a) => a.owner);
    expect(owners).not.toContain(owner(5));
    expect(owners).toContain(owner(1000));
    expect(() => { writeSweepAttempt(attempt(2000), s); }).toThrow(/still pending/);
    expect(readSweepAttempts(s).map((a) => a.owner)).not.toContain(owner(2000));
  });
});
