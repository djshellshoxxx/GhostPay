import { describe, expect, it } from 'vitest';
import { toResult } from './errors.js';
import {
  P13_STATES,
  assertLive,
  assertTransition,
  guarded,
  interpretEvidence,
  isP13State,
  mayHaveEffect,
  type OperationContext,
  type P13State,
} from './lifecycle.js';
import { SecretAmount } from './secret.js';
import { PINNED_PAYMENT, genuinePaymentLogs } from './fixtures.testutil.js';

const codeOf = (fn: () => unknown): string => {
  const r = toResult(fn);
  return r.ok ? 'ok' : r.code;
};

describe('state transitions', () => {
  const allowed: readonly [P13State, P13State][] = [
    ['prepared', 'reviewed'], ['prepared', 'cancelled'], ['reviewed', 'authorized'], ['reviewed', 'prepared'],
    ['reviewed', 'cancelled'], ['authorized', 'submitted'], ['submitted', 'unknown'],
    ['submitted', 'verified'], ['submitted', 'reverted'], ['unknown', 'verified'], ['unknown', 'unknown'],
    ['unknown', 'reverted'], ['unknown', 'submitted'], ['verified', 'submitted'], ['reverted', 'submitted'],
  ];

  it('accepts exactly the documented transitions', () => {
    for (const from of P13_STATES) {
      for (const to of P13_STATES) {
        const ok = allowed.some(([a, b]) => a === from && b === to);
        expect(codeOf(() => assertTransition(from, to)), `${from}->${to}`).toBe(ok ? 'ok' : 'P13_TRANSITION');
      }
    }
  });

  it('never cancels or resends submitted work and treats cancelled as terminal', () => {
    expect(codeOf(() => assertTransition('submitted', 'cancelled'))).toBe('P13_TRANSITION');
    expect(codeOf(() => assertTransition('unknown', 'cancelled'))).toBe('P13_TRANSITION');
    expect(codeOf(() => assertTransition('cancelled', 'prepared'))).toBe('P13_TRANSITION');
    expect(codeOf(() => assertTransition('bogus' as P13State, 'prepared'))).toBe('P13_TRANSITION');
    expect(isP13State('verified')).toBe(true);
    expect(isP13State('paid')).toBe(false);
    expect(mayHaveEffect('reviewed')).toBe(false);
    expect(mayHaveEffect('authorized')).toBe(true);
    expect(mayHaveEffect('unknown')).toBe(true);
  });
});

describe('interpretEvidence (P13-A06, A09)', () => {
  const expectedNet = SecretAmount.from(1_000n);
  const base = { confirmations: 3, minConfirmations: 2, expectedNet, logs: genuinePaymentLogs(), pinned: PINNED_PAYMENT } as const;

  it('a hash or receipt alone is not verification', () => {
    expect(interpretEvidence({ ...base, receipt: 'none' })).toEqual({ state: 'unknown', reason: 'no-receipt' });
    expect(interpretEvidence({ ...base, receipt: 'success' })).toEqual({ state: 'unknown', reason: 'not-decrypted' });
  });

  it('needs enough confirmations for any final verdict', () => {
    const shallow = { ...base, confirmations: 1, delivered: SecretAmount.from(1_000n) };
    expect(interpretEvidence({ ...shallow, receipt: 'success' }).state).toBe('unknown');
    expect(interpretEvidence({ ...shallow, receipt: 'reverted' }).state).toBe('unknown');
  });

  it('SDK success with zero or short delivery stays unknown', () => {
    const zero = { ...base, receipt: 'success', delivered: SecretAmount.from(0n, { min: 0n, max: 10n }) } as const;
    expect(interpretEvidence(zero)).toEqual({ state: 'unknown', reason: 'zero-delivery' });
    expect(interpretEvidence({ ...base, receipt: 'success', delivered: SecretAmount.from(999n) })).toEqual({
      state: 'unknown',
      reason: 'underpaid',
    });
  });

  it('verifies a confirmed delivery of at least the expected net; reports confirmed reverts', () => {
    expect(interpretEvidence({ ...base, receipt: 'success', delivered: SecretAmount.from(1_000n) })).toEqual({
      state: 'verified',
      reason: 'delivered',
    });
    expect(interpretEvidence({ ...base, receipt: 'reverted' })).toEqual({ state: 'reverted', reason: 'reverted' });
  });

  it('rejects malformed counts and statuses', () => {
    expect(codeOf(() => interpretEvidence({ ...base, receipt: 'success', confirmations: -1 }))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => interpretEvidence({ ...base, receipt: 'success', minConfirmations: 0 }))).toBe('P13_RECORD_INVALID');
    expect(codeOf(() => interpretEvidence({ ...base, receipt: 'ok' as 'success' }))).toBe('P13_RECORD_INVALID');
  });
});

describe('stale completion guard (P13-A11)', () => {
  const ctx = (epoch: number, signal = new AbortController().signal): OperationContext => ({
    operationId: 'op-1',
    sessionEpoch: epoch,
    signal,
    deadlineMs: 10_000,
  });

  it('accepts a live context and rejects cancelled, re-keyed or expired ones', () => {
    const epoch = { current: () => 4 };
    expect(codeOf(() => assertLive(ctx(4), epoch, 100))).toBe('ok');
    expect(codeOf(() => assertLive(ctx(3), epoch, 100))).toBe('P13_STALE');
    expect(codeOf(() => assertLive(ctx(4), epoch, 10_001))).toBe('P13_STALE');
    const ac = new AbortController();
    ac.abort();
    expect(codeOf(() => assertLive(ctx(4, ac.signal), epoch, 100))).toBe('P13_CANCELLED');
  });

  it('drops a result that completes after the session changed', async () => {
    let current = 1;
    const epoch = { current: () => current };
    const late = guarded(ctx(1), epoch, () => 0, () => {
      current = 2; // lock / account switch while the work was running
      return Promise.resolve('stale-proof');
    });
    await expect(late).rejects.toMatchObject({ code: 'P13_STALE' });
    await expect(guarded(ctx(2), epoch, () => 0, () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('drops a result that completes after cancellation', async () => {
    const ac = new AbortController();
    const run = guarded(ctx(1, ac.signal), { current: () => 1 }, () => 0, () => {
      ac.abort();
      return Promise.resolve(1);
    });
    await expect(run).rejects.toMatchObject({ code: 'P13_CANCELLED' });
  });
});
