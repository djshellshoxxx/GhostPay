// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { SweepLock } from './lib/sweep';
import { SWEEP_JOURNAL_KEY } from './lib/sweepAttemptJournal';
import { beginSweepAttempt, getSweepAttempt, isSweepJournalBroken, recordSweepAttempt, resetSweepAttemptsForTests, resolveSweepAttempt } from './state';

const OWNER = '0x5555555555555555555555555555555555555555';
const order = { relayer: '0x2222222222222222222222222222222222222222' as const, nonce: 1n, deadline: 1_800_001_200 };

beforeEach(() => {
  window.sessionStorage.clear();
  resetSweepAttemptsForTests();
});

describe('beginSweepAttempt', () => {
  it('refuses to overwrite an unresolved lock for the same chain and owner, even after the pre-sign check', () => {
    const first: SweepLock = { chainId: 84532, owner: OWNER, order, status: 'unknown-after-handoff' };
    beginSweepAttempt(first);
    expect(() => { beginSweepAttempt({ ...first, order: { ...order, nonce: 2n } }); }).toThrow(/may still be pending/);
    expect(getSweepAttempt(84532, OWNER)?.order?.nonce).toBe(1n);
    // Another chain or owner is independent.
    beginSweepAttempt({ ...first, chainId: 11155111 });
  });

  it('allows a new lock once the previous one is resolved', () => {
    const first: SweepLock = { chainId: 84532, owner: OWNER, order, status: 'unknown-after-handoff' };
    beginSweepAttempt(first);
    recordSweepAttempt({ ...first, status: 'expired' });
    beginSweepAttempt({ ...first, order: { ...order, nonce: 3n } });
    expect(getSweepAttempt(84532, OWNER)?.order?.nonce).toBe(3n);
  });
});

describe('resolveSweepAttempt (compare-and-swap for status checks)', () => {
  it('a stale status-check result cannot overwrite a newer lock (L1-05)', () => {
    const order1: SweepLock = { chainId: 84532, owner: OWNER, order, status: 'unknown-after-handoff' };
    beginSweepAttempt(order1);
    const startedFrom = getSweepAttempt(84532, OWNER)!;
    // A second, faster check resolves order 1 and the user signs order 2.
    expect(resolveSweepAttempt(startedFrom, { ...order1, status: 'expired' })).toBe(true);
    const order2: SweepLock = { ...order1, order: { ...order, nonce: 2n } };
    beginSweepAttempt(order2);
    // The first, slow check now returns its result for order 1: it must not touch order 2's lock.
    expect(resolveSweepAttempt(startedFrom, { ...order1, status: 'expired' })).toBe(false);
    const current = getSweepAttempt(84532, OWNER)!;
    expect(current.order?.nonce).toBe(2n);
    expect(current.status).toBe('unknown-after-handoff');
  });

  it('applies when the lock is unchanged, including after a reload re-hydrated it', () => {
    const lock: SweepLock = { chainId: 84532, owner: OWNER, nonce: 7, expectedHash: `0x${'ab'.repeat(32)}`, status: 'unknown-after-handoff' };
    beginSweepAttempt(lock);
    resetSweepAttemptsForTests({ keepStorage: true });
    const hydrated = getSweepAttempt(84532, OWNER)!;
    expect(resolveSweepAttempt(hydrated, { ...hydrated, status: 'included' })).toBe(true);
    expect(getSweepAttempt(84532, OWNER)?.status).toBe('included');
  });
});

describe('L2-F2: a same-nonce re-sign takes over the unresolved direct lock by compare-and-swap', () => {
  const H1 = `0x${'a1'.repeat(32)}` as const;
  const H2 = `0x${'b2'.repeat(32)}` as const;
  const locked: SweepLock = { chainId: 84532, owner: OWNER, nonce: 7, expectedHash: H1, status: 'unknown-after-handoff' };
  const resigned: SweepLock = { ...locked, expectedHash: H2 };

  it('records the new expected hash, persisted before handoff, only from the lock it started from and with its nonce', () => {
    beginSweepAttempt(locked);
    const from = getSweepAttempt(84532, OWNER)!;
    beginSweepAttempt(resigned, from);
    expect(getSweepAttempt(84532, OWNER)).toEqual(resigned);
    const journal = window.sessionStorage.getItem(SWEEP_JOURNAL_KEY) ?? '';
    expect(journal).toContain(H2);
    expect(journal).not.toContain(H1);
    // A reload reads the replacement, still unresolved.
    resetSweepAttemptsForTests({ keepStorage: true });
    expect(getSweepAttempt(84532, OWNER)).toEqual(resigned);
    // A submitted lock can be re-signed as well (it may be stuck); the result is again resolved by CAS.
    expect(resolveSweepAttempt(resigned, { ...resigned, status: 'submitted' })).toBe(true);
    beginSweepAttempt({ ...locked, expectedHash: `0x${'c3'.repeat(32)}` }, getSweepAttempt(84532, OWNER));
    expect(getSweepAttempt(84532, OWNER)?.expectedHash).toBe(`0x${'c3'.repeat(32)}`);
  });

  it('refuses another nonce, a stale or resolved lock, a relayed order and a missing lock, and records nothing', () => {
    beginSweepAttempt(locked);
    const journal = window.sessionStorage.getItem(SWEEP_JOURNAL_KEY);
    expect(() => { beginSweepAttempt({ ...resigned, nonce: 8 }, locked); }).toThrow(/changed|pending/);
    expect(() => { beginSweepAttempt({ chainId: 84532, owner: OWNER, expectedHash: H2, status: 'unknown-after-handoff' }, locked); }).toThrow(/changed|pending/);
    expect(() => { beginSweepAttempt(resigned, { ...locked, expectedHash: H2 }); }).toThrow(/changed/);
    expect(() => { beginSweepAttempt({ ...resigned, chainId: 11155111 }, locked); }).toThrow(/changed/);
    expect(() => { beginSweepAttempt({ ...resigned, order: { relayer: order.relayer, nonce: 7n, deadline: order.deadline } }, locked); }).toThrow(/changed/);
    // Without `replaces` an unresolved lock still refuses any new signature, same nonce or not.
    expect(() => { beginSweepAttempt(resigned); }).toThrow(/may still be pending/);
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBe(journal);
    expect(getSweepAttempt(84532, OWNER)).toEqual(locked);

    // Resolved meanwhile (a status check won the race): the re-sign must not overwrite the result.
    recordSweepAttempt({ ...locked, status: 'included' });
    expect(() => { beginSweepAttempt(resigned, locked); }).toThrow(/changed/);
    expect(getSweepAttempt(84532, OWNER)?.status).toBe('included');

    // A relayed order lock is never replaced by a direct re-sign.
    const relayed: SweepLock = { chainId: 84532, owner: '0x6666666666666666666666666666666666666666', order, status: 'unknown-after-handoff' };
    beginSweepAttempt(relayed);
    expect(() => { beginSweepAttempt({ chainId: 84532, owner: relayed.owner, nonce: 0, expectedHash: H2, status: 'unknown-after-handoff' }, relayed); }).toThrow(/changed/);
    expect(() => { beginSweepAttempt({ ...resigned, owner: '0x7777777777777777777777777777777777777777' }, { ...locked, owner: '0x7777777777777777777777777777777777777777' }); }).toThrow(/changed/);
  });

  it('a failed write leaves the tombstone, keeps the old lock in memory and disarms signing; nothing may be handed off', () => {
    beginSweepAttempt(locked);
    const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'setItem')!;
    const original = descriptor.value as (this: Storage, k: string, v: string) => void;
    let calls = 0;
    proto.setItem = function (this: Storage, k: string, v: string): void {
      calls += 1;
      if (k === SWEEP_JOURNAL_KEY && calls === 1) throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, k, v);
    };
    try {
      expect(() => { beginSweepAttempt(resigned, locked); }).toThrow(/unavailable or invalid/);
    } finally {
      Object.defineProperty(proto, 'setItem', descriptor);
    }
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBe('"unavailable"');
    expect(getSweepAttempt(84532, OWNER)).toEqual(locked);
    expect(isSweepJournalBroken()).toBe(true);
    expect(() => { beginSweepAttempt(resigned, locked); }).toThrow(/unavailable or invalid/);
  });
});
