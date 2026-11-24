import { describe, expect, it } from 'vitest';
import { makeIo, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';

describe('merchant installment operators', () => {
  it('plans an exact deposit/installment split without treating input as verified payment', async () => {
    const io = makeIo({ spec: JSON.stringify({ total: '1001', depositBps: 1000, count: 3, startAt: 100, firstDue: 200, intervalSeconds: 3600,
      tolerance: { underpayAbs: '0', underpayBps: 0, overpayAbs: '0', overpayBps: 0 } }) });
    expect(await run(['merchant', 'installments', 'plan', '--in', 'spec', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, paymentVerified: false, result: { total: '1001', schedule: [
      { kind: 'deposit', amount: '100', dueAt: 100 }, { kind: 'installment', amount: '301', dueAt: 200 },
      { kind: 'installment', amount: '300', dueAt: 3800 }, { kind: 'installment', amount: '300', dueAt: 7400 },
    ] } });
  });
  it('inspects saved installment projections while keeping duplicate claims and verified payment separate', async () => {
    const io = makeIo({ ledger: JSON.stringify({ total: '1000', tolerance: { underpay: '0', overpay: '0' },
      schedule: [{ index: 0, kind: 'deposit', amount: '1000', dueAt: 1 }],
      payments: [{ id: 'tx:0', amount: '1000', at: 2 }, { id: 'tx:0', amount: '1000', at: 2 }] }) });
    expect(await run(['merchant', 'installments', 'inspect', '--in', 'ledger', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ paymentVerified: false, duplicateObservations: 1, reportedState: 'settled', totalClaimed: '1000' });
  });
  it('inspects a webhook event without accepting its claimed payment as evidence', async () => {
    const io = makeIo({ event: JSON.stringify({ id: 'event-001', type: 'invoice.paid', createdAt: 1,
      data: { invoiceId: 'invoice-001', currency: 'USD', amountMinor: '100', paymentId: 'tx-001' } }) });
    expect(await run(['merchant', 'webhooks', 'inspect', '--in', 'event', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ signatureVerified: false, replayChecked: false, paymentVerified: false, idempotencyKey: 'event-001' });
  });
});

const PLAN = { total: '1000', depositBps: 1000, count: 3, startAt: 100, firstDue: 200, intervalSeconds: 3600,
  tolerance: { underpayAbs: '0', underpayBps: 0, overpayAbs: '0', overpayBps: 0 } };
const LEDGER = { total: '1000', tolerance: { underpay: '0', overpay: '0' },
  schedule: [{ index: 0, kind: 'deposit', amount: '1000', dueAt: 1 }], payments: [] };

describe('merchant input and persistence boundaries', () => {
  it.each([null, [], {}, { ...PLAN, extra: 'no' }, { ...PLAN, total: 1000 }, { ...PLAN, count: 1.1 },
    { ...PLAN, total: '01' }, { ...PLAN, tolerance: {} }, { ...PLAN, firstDue: 99 }, { ...PLAN, count: 0 }])('rejects a malformed or impossible installment plan %#', async raw => {
    const io = makeIo({ input: JSON.stringify(raw) });
    expect(await run(['merchant', 'installments', 'plan', '--in', 'input', '--json'], io)).toBe(1);
  });
  it('exports and re-inspects a plan; an existing output is not overwritten accidentally', async () => {
    const io = makeIo({ spec: JSON.stringify(PLAN) });
    expect(await run(['merchant', 'installments', 'plan', '--in', 'spec', '--out', 'plan'], io)).toBe(0);
    expect(await run(['merchant', 'installments', 'plan', '--in', 'spec', '--out', 'plan'], io)).toBe(3);
    io.out.length = 0;
    expect(await run(['merchant', 'installments', 'inspect', '--in', 'plan', '--out', 'report', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ reportedState: 'unpaid', paymentVerified: false, out: 'report' });
  });
  it.each([
    { ...LEDGER, total: '0' }, { ...LEDGER, tolerance: { underpay: '1000', overpay: '0' } }, { ...LEDGER, schedule: [] },
    { ...LEDGER, schedule: [LEDGER.schedule[0], { index: 1, kind: 'deposit', amount: '1', dueAt: 0 }] },
    { ...LEDGER, total: '999' }, { ...LEDGER, payments: [null] },
    { ...LEDGER, payments: [{ id: 2, amount: '1', at: 1 }] },
    { ...LEDGER, payments: [{ id: 'x', amount: '1', at: 9_999_999_999 }] },
    { ...LEDGER, payments: [{ id: 'x', amount: '1', at: 1 }, { id: 'x', amount: '2', at: 1 }] },
    { ...LEDGER, payments: [{ id: 'x', amount: '1', at: 1 }, { id: 'x', amount: '1', at: 2 }] },
  ])('rejects contradictory or malformed installment history %#', async raw => {
    const io = makeIo({ input: JSON.stringify(raw) });
    expect(await run(['merchant', 'installments', 'inspect', '--in', 'input', '--json'], io)).toBe(1);
  });
  it('refuses malformed and future webhook events before returning an idempotency key', async () => {
    const io = makeIo({ event: JSON.stringify({ id: 'evt', type: 'invoice.paid', createdAt: 9_999_999_999, data: { invoiceId: 'inv', currency: 'USD', amountMinor: '1' } }) });
    expect(await run(['merchant', 'webhooks', 'inspect', '--in', 'event', '--json'], io)).toBe(1);
    expect(io.err.join('')).toContain('WEBHOOK_FUTURE');
    io.files.set('event', '{"id":"first","id":"second"}');
    expect(await run(['merchant', 'webhooks', 'inspect', '--in', 'event', '--json'], io)).toBe(1);
  });
});
