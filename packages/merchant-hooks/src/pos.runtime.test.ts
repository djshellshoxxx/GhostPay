import { describe, expect, it } from 'vitest';
import { HooksError } from './errors.js';
import { INITIAL_POS_STATE, posReduce, type PosEvent, type PosState } from './pos.js';

const start: PosEvent = {
  type: 'start', sessionId: 'sale-1', invoiceId: 'invoice-1',
  currency: 'USD', dueMinor: 1000n, ttlSeconds: 30,
};
const pay: PosEvent = { type: 'payment', invoiceId: 'invoice-1', currency: 'USD', amountMinor: 1000n };
const awaiting = (): PosState => posReduce(INITIAL_POS_STATE, start, 100).state;

describe('merchant POS runtime input boundaries', () => {
  it('rejects non-finite, negative, fractional and unsafe clocks before starting a session', () => {
    for (const now of [Number.NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => posReduce(INITIAL_POS_STATE, start, now)).toThrow(HooksError);
      expect(() => posReduce(INITIAL_POS_STATE, start, now)).toThrow(/bad-time-policy/);
    }
    for (const bad of ['100', null, undefined, { valueOf: () => { throw Error('unexpected coercion'); } }]) {
      expect(() => posReduce(INITIAL_POS_STATE, start, bad as unknown as number)).toThrow(/bad-time-policy/);
    }
    expect(() => posReduce(INITIAL_POS_STATE, start, Number.MAX_SAFE_INTEGER - 29)).toThrow(/bad-time-policy/);
    expect(posReduce(INITIAL_POS_STATE, start, Number.MAX_SAFE_INTEGER - 30).state.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(posReduce(INITIAL_POS_STATE, start, 0).state.expiresAt).toBe(30);
  });

  it('fails closed on invalid clocks or corrupted expiry for payments/ticks while preserving cancellation', () => {
    const state = awaiting();
    for (const now of [Number.NaN, Infinity, -Infinity, -1, 0.25, Number.MAX_SAFE_INTEGER + 1]) {
      for (const event of [pay, { type: 'tick' } as PosEvent]) {
        expect(() => posReduce(state, event, now)).toThrow(/bad-time-policy/);
      }
      expect(posReduce(state, { type: 'cancel' }, now).state.status).toBe('cancelled');
    }
    for (const expiresAt of [undefined, Number.NaN, Infinity, -Infinity, -1, 0.5]) {
      const corrupted = { ...state, expiresAt } as unknown as PosState;
      expect(() => posReduce(corrupted, pay, 101)).toThrow(/bad-time-policy/);
      expect(posReduce(corrupted, { type: 'cancel' }, 101).state.status).toBe('cancelled');
    }
    expect(posReduce(state, pay, 129).state.status).toBe('paid');
    expect(posReduce(state, pay, 130)).toMatchObject({ accepted: false, state: { status: 'expired', paidMinor: 0n } });
    expect(posReduce(state, { type: 'tick' }, 130)).toMatchObject({ accepted: true, state: { status: 'expired' } });
  });

  it('rejects runtime non-bigint due and payment amounts without coercion', () => {
    const hostile = { [Symbol.toPrimitive](): never { throw Error('must not coerce'); } };
    for (const bad of [1000, '1000', Number.NaN, null, undefined, hostile]) {
      expect(() => posReduce(INITIAL_POS_STATE, { ...start, dueMinor: bad as unknown as bigint }, 100)).toThrow(/bad-amount/);
      expect(() => posReduce(awaiting(), { ...pay, amountMinor: bad as unknown as bigint }, 101)).toThrow(/bad-amount/);
    }
    for (const bad of [0n, -1n]) {
      expect(() => posReduce(INITIAL_POS_STATE, { ...start, dueMinor: bad }, 100)).toThrow(/bad-amount/);
      expect(posReduce(awaiting(), { ...pay, amountMinor: bad }, 101).accepted).toBe(false);
    }
    expect(posReduce(awaiting(), { ...pay, amountMinor: 400n }, 101).state.paidMinor).toBe(400n);
  });

  it('retains terminal absorption for valid states and rejects late replay', () => {
    const paid = posReduce(awaiting(), pay, 101).state;
    const expired = posReduce(awaiting(), { type: 'tick' }, 130).state;
    const cancelled = posReduce(awaiting(), { type: 'cancel' }, 102).state;
    for (const state of [paid, expired, cancelled]) {
      for (const event of [pay, { type: 'tick' } as PosEvent, { type: 'cancel' } as PosEvent, start]) {
        const result = posReduce(state, event, Number.NaN);
        expect(result).toEqual({ accepted: false, state });
        expect(result.state).toBe(state);
      }
    }
  });
});

describe('POS state integrity', () => {
  it('never emits an accepted transition with invalid stored amounts', () => {
    const valid = awaiting();
    for (const overrides of [
      { dueMinor: 1000 }, { dueMinor: undefined }, { dueMinor: 0n },
      { paidMinor: '0' }, { paidMinor: -1n }, { paidMinor: 1000n },
    ]) {
      const corrupt = Object.freeze({ ...valid, ...overrides }) as unknown as PosState;
      for (const event of [pay, { type: 'tick' }, { type: 'cancel' }] as const) {
        expect(() => posReduce(corrupt, event, 130)).toThrow(/bad-amount/);
      }
    }
  });

  it('can cancel without preserving a malformed deadline or losing a partial payment', () => {
    const state = Object.freeze({ ...awaiting(), paidMinor: 503n, expiresAt: NaN });
    const result = posReduce(state, { type: 'cancel' }, NaN);
    expect(result.state).not.toHaveProperty('expiresAt');
    expect(result.state).toMatchObject({ status: 'cancelled', paidMinor: 503n, dueMinor: 1000n });
  });

  it('rejects missing or ill-typed sale identities before returning an active session', () => {
    for (const field of ['sessionId', 'invoiceId', 'currency']) {
      for (const bad of ['', 7, null, undefined]) {
        expect(() => posReduce(INITIAL_POS_STATE, { ...start, [field]: bad }, 100)).toThrow(/bad-session/);
      }
    }
  });
});
