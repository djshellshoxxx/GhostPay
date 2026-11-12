import { describe, expect, it } from 'vitest';
import { applyPayment, BillingError, createLedger, summarize } from './index.js';

const base = {
  total: 100n, depositBps: 2500, count: 2, startAt: 0, firstDue: 1000,
  intervalSeconds: 3600,
  tolerance: { underpayAbs: '0', underpayBps: 0, overpayAbs: '0', overpayBps: 0 },
};
const invalidTimes: unknown[] = [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3600', null, undefined];

describe('installment runtime validation', () => {
  it.each(invalidTimes)('rejects invalid timestamps/intervals without creating a schedule: %s', (value) => {
    for (const field of ['startAt', 'firstDue', 'intervalSeconds'] as const) {
      expect(() => createLedger({ ...base, [field]: value as number })).toThrow(BillingError);
    }
  });
  it('rejects calculated due times outside the safe integer range', () => {
    expect(() => createLedger({ ...base, firstDue: Number.MAX_SAFE_INTEGER })).toThrow(BillingError);
    expect(() => createLedger({ ...base, count: 120, intervalSeconds: Number.MAX_SAFE_INTEGER })).toThrow(BillingError);
  });
  it.each([NaN, Infinity, 100, '100', 0n, -1n, 1n << 256n])('requires total to be a positive uint256 bigint: %s', (total) => {
    expect(() => createLedger({ ...base, total: total as bigint })).toThrow(BillingError);
  });
  it.each(invalidTimes)('rejects invalid payment and summary times: %s', (value) => {
    const ledger = createLedger(base);
    expect(() => applyPayment(ledger, { id: 'tx:0', amount: 10n, at: value as number })).toThrow(BillingError);
    expect(() => summarize(ledger, value as number)).toThrow(BillingError);
    expect(ledger.payments).toEqual([]);
  });
  it.each([NaN, Infinity, 1, '1', 0n, -1n, 1n << 256n])('requires payment amounts to be positive uint256 bigints: %s', (amount) => {
    expect(() => applyPayment(createLedger(base), { id: 'tx:0', amount: amount as bigint, at: 0 })).toThrow(BillingError);
  });
  it('does not coerce non-string payment ids', () => {
    expect(() => applyPayment(createLedger(base), { id: 123 as unknown as string, amount: 1n, at: 0 })).toThrow(BillingError);
  });
  it('keeps zero/maximum-safe times, exact uint256 totals and legitimate duplicate semantics', () => {
    const total = (1n << 256n) - 1n;
    const ledger = createLedger({ ...base, total, firstDue: Number.MAX_SAFE_INTEGER - 3600 });
    expect(ledger.schedule.at(-1)?.dueAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(ledger.schedule.reduce((sum, item) => sum + item.amount, 0n)).toBe(total);
    expect(summarize(ledger, 0).status).toBe('unpaid');
    const paid = applyPayment(ledger, { id: 'tx:0', amount: total, at: 0 }).ledger;
    expect(applyPayment(paid, { id: 'tx:0', amount: total, at: Number.MAX_SAFE_INTEGER }).duplicate).toBe(true);
    expect(summarize(paid, Number.MAX_SAFE_INTEGER).status).toBe('settled');
  });
  it('rejects a deposit due after an installment rather than allocating in the wrong order', () => {
    expect(() => createLedger({ ...base, startAt: 5000, firstDue: 1000 })).toThrow(BillingError);
    expect(createLedger({ ...base, depositBps: 0, startAt: 5000, firstDue: 1000 }).schedule[0]?.dueAt).toBe(1000);
    expect(createLedger({ ...base, depositBps: 10000, count: 0, startAt: 5000, firstDue: 0 }).schedule[0]?.dueAt).toBe(5000);
  });
  it('allows a zero interval only for the full-upfront ledger', () => {
    const args = { ...base, depositBps: 10000, count: 0, firstDue: 0, intervalSeconds: 0 };
    expect(createLedger(args).schedule).toEqual([{ index: 0, kind: 'deposit', amount: 100n, dueAt: 0 }]);
    expect(() => createLedger({ ...args, intervalSeconds: NaN })).toThrow(BillingError);
    expect(() => createLedger({ ...args, intervalSeconds: -1 })).toThrow(BillingError);
    expect(() => createLedger({ ...base, intervalSeconds: 0 })).toThrow(BillingError);
  });
});
