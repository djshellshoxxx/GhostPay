import { describe, expect, it } from 'vitest';
import { applyPayment, BillingError, createLedger, summarize, type Tolerance } from './index.js';

const tol: Tolerance = { underpayAbs: '0', underpayBps: 0, overpayAbs: '0', overpayBps: 0 };
const mk = (t: Partial<Tolerance> = {}) =>
  createLedger({ total: 1_000_001n, depositBps: 2500, count: 3, startAt: 1000, firstDue: 2_000_000, intervalSeconds: 86_400, tolerance: { ...tol, ...t } });

describe('createLedger', () => {
  it('25% deposit, 3 installments, remainder allocated exactly', () => {
    const l = mk();
    // deposit floor(1_000_001*0.25)=250_000; rest 750_001 -> 250_001,250_000,250_000
    expect(l.schedule.map((s) => s.amount)).toEqual([250_000n, 250_001n, 250_000n, 250_000n]);
    expect(l.schedule.reduce((a, s) => a + s.amount, 0n)).toBe(1_000_001n);
    expect(l.schedule.map((s) => s.dueAt)).toEqual([1000, 2_000_000, 2_086_400, 2_172_800]);
    expect(l.schedule[0]?.kind).toBe('deposit');
  });
  it('no deposit and full-upfront', () => {
    const a = createLedger({ total: 90n, depositBps: 0, count: 3, startAt: 0, firstDue: 10, intervalSeconds: 3600, tolerance: tol });
    expect(a.schedule.map((s) => s.amount)).toEqual([30n, 30n, 30n]);
    const b = createLedger({ total: 90n, depositBps: 10_000, count: 0, startAt: 0, firstDue: 0, intervalSeconds: 0, tolerance: tol });
    expect(b.schedule).toHaveLength(1);
  });
  it('tolerance uses larger of abs and bps', () => {
    const l = mk({ underpayAbs: '5', underpayBps: 10, overpayAbs: '2000', overpayBps: 1 });
    expect(l.tolerance).toEqual({ underpay: 1000n, overpay: 2000n });
  });
  it('rejects bad input', () => {
    const base = { total: 100n, depositBps: 5000, count: 2, startAt: 0, firstDue: 0, intervalSeconds: 3600, tolerance: tol };
    expect(() => createLedger({ ...base, total: 0n })).toThrow(BillingError);
    expect(() => createLedger({ ...base, count: -1 })).toThrow(BillingError);
    expect(() => createLedger({ ...base, count: 0 })).toThrow(BillingError);
    expect(() => createLedger({ ...base, depositBps: 10_000 })).toThrow(BillingError);
    expect(() => createLedger({ ...base, intervalSeconds: 10 })).toThrow(BillingError);
    expect(() => createLedger({ ...base, tolerance: { ...tol, underpayAbs: '100' } })).toThrow(BillingError);
    expect(() => createLedger({ ...base, tolerance: { ...tol, underpayAbs: '-1' } })).toThrow(BillingError);
  });
});

describe('payments', () => {
  it('partial then paid, with overdue detection', () => {
    let l = mk();
    expect(summarize(l, 0)).toMatchObject({ status: 'unpaid', remaining: 1_000_001n, paid: 0n });
    l = applyPayment(l, { id: 'tx1:0', amount: 300_000n, at: 5 }).ledger;
    const s = summarize(l, 2_000_000);
    expect(s.status).toBe('partial');
    expect(s.remaining).toBe(700_001n);
    expect(s.installments.map((i) => i.state)).toEqual(['paid', 'overdue', 'unpaid', 'unpaid']);
    expect(s.installments[1]).toMatchObject({ paid: 50_000n, due: 250_001n });
    expect(summarize(l, 10).installments[1]?.state).toBe('partial');
    l = applyPayment(l, { id: 'tx2:0', amount: 700_001n, at: 6 }).ledger;
    expect(summarize(l, 9).status).toBe('settled');
    expect(summarize(l, 9).remaining).toBe(0n);
  });
  it('duplicate id ignored; conflicting replay rejected', () => {
    const l = mk();
    const a = applyPayment(l, { id: 'tx1:0', amount: 10n, at: 1 });
    const b = applyPayment(a.ledger, { id: 'tx1:0', amount: 10n, at: 2 });
    expect(b.duplicate).toBe(true);
    expect(b.ledger).toBe(a.ledger);
    expect(() => applyPayment(a.ledger, { id: 'tx1:0', amount: 11n, at: 2 })).toThrow(BillingError);
  });
  it('rejects invalid payments', () => {
    const l = mk();
    expect(() => applyPayment(l, { id: 'bad id', amount: 1n, at: 0 })).toThrow(BillingError);
    expect(() => applyPayment(l, { id: 'ok', amount: 0n, at: 0 })).toThrow(BillingError);
    expect(() => applyPayment(l, { id: 'ok', amount: 1n << 256n, at: 0 })).toThrow(BillingError);
  });
  it('underpay tolerance: 1_000_001 total, 0.1% = 1000 tolerance', () => {
    let l = mk({ underpayBps: 10 });
    l = applyPayment(l, { id: 'a', amount: 999_001n, at: 0 }).ledger;
    expect(summarize(l, 0).status).toBe('settled'); // short by exactly 1000
    const l2 = applyPayment(mk({ underpayBps: 10 }), { id: 'a', amount: 999_000n, at: 0 }).ledger;
    expect(summarize(l2, 0).status).toBe('partial'); // short by 1001
  });
  it('overpay: within tolerance is settled, beyond is overpaid with refundable excess', () => {
    const l = applyPayment(mk({ overpayAbs: '500' }), { id: 'a', amount: 1_000_501n, at: 0 }).ledger;
    expect(summarize(l, 0)).toMatchObject({ status: 'settled', refundableExcess: 0n });
    const l2 = applyPayment(mk({ overpayAbs: '500' }), { id: 'a', amount: 1_000_502n, at: 0 }).ledger;
    expect(summarize(l2, 0)).toMatchObject({ status: 'overpaid', refundableExcess: 501n, remaining: 0n });
    const l3 = applyPayment(mk(), { id: 'a', amount: 1_000_002n, at: 0 }).ledger;
    expect(summarize(l3, 0)).toMatchObject({ status: 'overpaid', refundableExcess: 1n });
  });
  it('bigint-safe at 2^200', () => {
    const big = 1n << 200n;
    const l = createLedger({ total: big, depositBps: 3333, count: 7, startAt: 0, firstDue: 1, intervalSeconds: 3600, tolerance: tol });
    expect(l.schedule.reduce((a, s) => a + s.amount, 0n)).toBe(big);
  });
});
