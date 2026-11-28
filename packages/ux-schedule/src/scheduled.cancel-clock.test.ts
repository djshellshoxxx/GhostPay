import { describe, expect, it } from 'vitest';
import { cancel, type ScheduledPayment } from './scheduled.js';

const DUE = 10_000;
const MAX_AGE = 60_000;
const EXPIRES_AT = DUE + MAX_AGE;

const payment: ScheduledPayment = {
  id: 'cancel-clock-regression',
  payment: {
    chain: 'eip155:1',
    asset: 'USDC',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '1',
  },
  dueAtMs: DUE,
  createdAtMs: 0,
  maxAgeMs: MAX_AGE,
  state: 'due',
  stateChangedAtMs: DUE,
};

describe('cancel uses one checked clock sample', () => {
  it('never stamps cancellation after its expiry when the clock advances between reads', () => {
    let reads = 0;
    const result = cancel(payment, () => EXPIRES_AT + reads++);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe('cancelled');
      expect(result.value.stateChangedAtMs).toBe(EXPIRES_AT);
    }
    expect(reads).toBe(1);
  });

  it('binds a normal due cancellation to the evaluated instant', () => {
    let reads = 0;
    const result = cancel(payment, () => DUE + 500 + reads++ * 1_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe('cancelled');
      expect(result.value.stateChangedAtMs).toBe(DUE + 500);
    }
    expect(reads).toBe(1);
  });

  it('continues to refuse cancellation after the expiry boundary', () => {
    const result = cancel(payment, () => EXPIRES_AT + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad_state');
  });

  it('continues to allow cancellation from pending and reject terminal records', () => {
    const pending = cancel({ ...payment, state: 'pending' }, () => DUE - 1);
    expect(pending.ok).toBe(true);
    if (pending.ok) {
      expect(pending.value.state).toBe('cancelled');
      expect(pending.value.stateChangedAtMs).toBe(DUE - 1);
    }
    const terminal = cancel({ ...payment, state: 'confirmed' }, () => DUE + 1);
    expect(terminal.ok).toBe(false);
    if (!terminal.ok) expect(terminal.error.code).toBe('bad_state');
  });
  it('does not sample a clock when a terminal payment is already rejected', () => {
    const result = cancel({ ...payment, state: 'confirmed' }, () => {
      throw new Error('terminal cancellation must not read the clock');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad_state');
  });

});
