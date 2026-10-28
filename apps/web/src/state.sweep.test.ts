// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { SweepLock } from './lib/sweep';
import { beginSweepAttempt, getSweepAttempt, recordSweepAttempt, resetSweepAttemptsForTests } from './state';

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
