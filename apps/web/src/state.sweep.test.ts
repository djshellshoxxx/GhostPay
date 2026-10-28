// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { SweepLock } from './lib/sweep';
import { beginSweepAttempt, getSweepAttempt, recordSweepAttempt, resetSweepAttemptsForTests, resolveSweepAttempt } from './state';

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
