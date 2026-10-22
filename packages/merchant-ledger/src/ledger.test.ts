import { describe, expect, it } from 'vitest';
import {
  LedgerError,
  computeTax,
  currencyExponent,
  exportCsv,
  exportIif,
  exportJson,
  exportXeroCsv,
  formatMinor,
  fromSchemaInvoice,
  isoDate,
  joinCsv,
  parseMinor,
  quoteCell,
  reconcile,
  resolveAll,
  roundDiv,
  sanitizeText,
  taxSummary,
  taxSummaryCsv,
  textCell,
  totalsOf,
  type ExportInvoice,
  type LedgerInvoice,
  type ObservedPayment,
} from './index.js';

const T0 = 1_800_000_000;
const inv = (id: string, amt: string, over: Partial<LedgerInvoice> = {}): LedgerInvoice => ({
  id,
  currency: 'USD',
  amountMinor: amt,
  expiresAt: T0 + 1000,
  ...over,
});
const pay = (id: string, amt: string, over: Partial<ObservedPayment> = {}): ObservedPayment => ({
  id,
  currency: 'USD',
  amountMinor: amt,
  observedAt: T0,
  ...over,
});
const status = (r: ReturnType<typeof reconcile>, id: string): string | undefined =>
  r.invoices.find((i) => i.invoiceId === id)?.status;

describe('decimal', () => {
  it('parses strictly', () => {
    expect(parseMinor('0')).toBe(0n);
    expect(parseMinor('123456789012345678901234567890')).toBe(123456789012345678901234567890n);
    for (const bad of ['', '01', '-1', '1.5', '1e3', ' 1', '0x1', 'NaN', '9'.repeat(79)])
      expect(() => parseMinor(bad)).toThrow(LedgerError);
    expect(() => parseMinor(5)).toThrow(LedgerError);
    expect(() => parseMinor('1.5')).toThrow(/bad-amount/);
  });
  it('formats', () => {
    expect(formatMinor(0n, 2)).toBe('0.00');
    expect(formatMinor(5n, 2)).toBe('0.05');
    expect(formatMinor(12345n, 2)).toBe('123.45');
    expect(formatMinor(-5n, 2)).toBe('-0.05');
    expect(formatMinor(1234n, 0)).toBe('1234');
    expect(formatMinor(1n, 3)).toBe('0.001');
    expect(formatMinor(2n ** 100n, 2)).toBe('12676506002282294014967032053.76');
  });
  it('exponents', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('XXX', { XXX: 4 })).toBe(4);
    expect(() => currencyExponent('USD', { USD: -1 })).toThrow(LedgerError);
    expect(() => currencyExponent('USD', { USD: 1.5 })).toThrow(LedgerError);
    expect(() => currencyExponent('USD', { USD: 19 })).toThrow(LedgerError);
  });
  it('rounds', () => {
    expect(roundDiv(10n, 5n, 'up')).toBe(2n);
    expect(roundDiv(11n, 10n, 'down')).toBe(1n);
    expect(roundDiv(11n, 10n, 'up')).toBe(2n);
    expect(roundDiv(5n, 10n, 'half-up')).toBe(1n);
    expect(roundDiv(5n, 10n, 'half-even')).toBe(0n);
    expect(roundDiv(15n, 10n, 'half-even')).toBe(2n);
    expect(roundDiv(25n, 10n, 'half-even')).toBe(2n);
    expect(roundDiv(26n, 10n, 'half-even')).toBe(3n);
    expect(roundDiv(24n, 10n, 'half-up')).toBe(2n);
    expect(() => roundDiv(-1n, 1n, 'down')).toThrow(LedgerError);
    expect(() => roundDiv(1n, 0n, 'down')).toThrow(LedgerError);
  });
  it('tax', () => {
    expect(computeTax(7000n, 500)).toBe(350n);
    expect(computeTax(999n, 750, 'half-up')).toBe(75n); // 74.925
    expect(computeTax(999n, 750, 'down')).toBe(74n);
    expect(computeTax(999n, 750, 'up')).toBe(75n);
    expect(computeTax(10n, 2500, 'half-even')).toBe(2n); // 2.5 -> 2
    expect(computeTax(10n, 2500, 'half-up')).toBe(3n);
    for (const r of [-1, 1.5, 100_001, NaN]) expect(() => computeTax(1n, r)).toThrow(/bad-rate/);
  });
});

describe('reconcile', () => {
  it('exact paid', () => {
    const r = reconcile([inv('a', '1000')], [pay('p1', '1000', { invoiceId: 'a' })], { now: T0 });
    expect(r.invoices[0]).toMatchObject({ status: 'paid', paidMinor: '1000', deltaMinor: '0', paymentIds: ['p1'] });
  });
  it('tolerance abs and bps', () => {
    const o = { now: T0, tolerance: { absoluteMinor: 5n } };
    expect(status(reconcile([inv('a', '1000')], [pay('p', '996', { invoiceId: 'a' })], o), 'a')).toBe('paid');
    expect(status(reconcile([inv('a', '1000')], [pay('p', '1005', { invoiceId: 'a' })], o), 'a')).toBe('paid');
    expect(status(reconcile([inv('a', '1000')], [pay('p', '1006', { invoiceId: 'a' })], o), 'a')).toBe('over');
    expect(status(reconcile([inv('a', '1000')], [pay('p', '994', { invoiceId: 'a' })], o), 'a')).toBe('partial');
    const b = { now: T0, tolerance: { bps: 100 } }; // 1% of 10000 = 100
    expect(status(reconcile([inv('a', '10000')], [pay('p', '9900', { invoiceId: 'a' })], b), 'a')).toBe('paid');
    expect(status(reconcile([inv('a', '10000')], [pay('p', '9899', { invoiceId: 'a' })], b), 'a')).toBe('partial');
  });
  it('partial then topped up, over, unmatched', () => {
    const r = reconcile(
      [inv('a', '1000'), inv('b', '500'), inv('c', '77')],
      [pay('p1', '400', { invoiceId: 'a' }), pay('p2', '600', { invoiceId: 'a', observedAt: T0 + 1 }), pay('p3', '501', { invoiceId: 'b' })],
      { now: T0 },
    );
    expect(status(r, 'a')).toBe('paid');
    expect(r.invoices[1]).toMatchObject({ status: 'over', deltaMinor: '1' });
    expect(status(r, 'c')).toBe('unmatched');
    expect(status(reconcile([inv('a', '1000')], [pay('p1', '400', { invoiceId: 'a' })], { now: T0 }), 'a')).toBe('partial');
  });
  it('expired with and without partial; late payments not counted', () => {
    const now = T0 + 2000;
    expect(status(reconcile([inv('a', '10')], [], { now }), 'a')).toBe('expired');
    const r = reconcile([inv('a', '10')], [pay('p', '4', { invoiceId: 'a' })], { now });
    expect(r.invoices[0]).toMatchObject({ status: 'expired', paidMinor: '4' });
    const late = reconcile([inv('a', '10')], [pay('p', '10', { invoiceId: 'a', observedAt: T0 + 1000 })], { now });
    expect(late.invoices[0]).toMatchObject({ status: 'expired', paidMinor: '0', latePaymentIds: ['p'] });
    const ok = reconcile([inv('a', '10')], [pay('p', '10', { invoiceId: 'a', observedAt: T0 + 999 })], { now });
    expect(ok.invoices[0]?.status).toBe('paid');
  });
  it('rejects bad rows without throwing', () => {
    const r = reconcile(
      [inv('a', '100')],
      [
        pay('1', '100', { invoiceId: 'zzz' }),
        pay('2', '100', { invoiceId: 'a', currency: 'EUR' }),
        pay('3', '1.5', { invoiceId: 'a' }),
        pay('4', '0', { invoiceId: 'a' }),
        pay('5', '-3', { invoiceId: 'a' }),
        pay('6', '999'),
      ],
      { now: T0 },
    );
    expect(r.unmatchedPayments.map((u) => u.reason)).toEqual([
      'unknown-invoice',
      'currency-mismatch',
      'bad-amount',
      'bad-amount',
      'bad-amount',
      'no-candidate',
    ]);
    expect(status(r, 'a')).toBe('unmatched');
  });
  it('dedupes payment ids', () => {
    const r = reconcile([inv('a', '100')], [pay('p', '100', { invoiceId: 'a' }), pay('p', '100', { invoiceId: 'a', observedAt: T0 + 5 })], { now: T0 });
    expect(r.invoices[0]?.paidMinor).toBe('100');
    expect(r.unmatchedPayments).toEqual([{ paymentId: 'p', reason: 'duplicate' }]);
  });
  it('matches by amount only when unique', () => {
    const one = reconcile([inv('a', '100'), inv('b', '200')], [pay('p', '200')], { now: T0 });
    expect(one.invoices[1]).toMatchObject({ status: 'paid', paymentIds: ['p'] });
    const amb = reconcile([inv('a', '100'), inv('b', '100')], [pay('p', '100')], { now: T0 });
    expect(amb.unmatchedPayments).toEqual([{ paymentId: 'p', reason: 'ambiguous' }]);
    // second same-amount payment goes to the other (first no longer open)
    const two = reconcile([inv('a', '100'), inv('b', '100')], [pay('p', '100', { invoiceId: 'a' }), pay('q', '100', { observedAt: T0 + 1 })], { now: T0 });
    expect(two.invoices.map((i) => i.status)).toEqual(['paid', 'paid']);
    // tolerance applies to amount matching; currency and expiry respected
    const tol = reconcile([inv('a', '1000')], [pay('p', '1004')], { now: T0, tolerance: { absoluteMinor: 5n } });
    expect(tol.invoices[0]?.status).toBe('paid');
    const cur = reconcile([inv('a', '1000')], [pay('p', '1000', { currency: 'EUR' })], { now: T0 });
    expect(cur.unmatchedPayments[0]?.reason).toBe('no-candidate');
    const exp = reconcile([inv('a', '1000')], [pay('p', '1000', { observedAt: T0 + 1000 })], { now: T0 });
    expect(exp.unmatchedPayments[0]?.reason).toBe('no-candidate');
  });
  it('order independent; duplicate invoice ids and bad invoice amount throw', () => {
    const invs = [inv('b', '5'), inv('a', '9')];
    const ps = [pay('x', '5', { invoiceId: 'b' }), pay('y', '9', { invoiceId: 'a' })];
    const r1 = reconcile(invs, ps, { now: T0 });
    const r2 = reconcile([...invs].reverse(), [...ps].reverse(), { now: T0 });
    expect(r1).toEqual(r2);
    expect(r1.invoices.map((i) => i.invoiceId)).toEqual(['a', 'b']);
    expect(() => reconcile([inv('a', '1'), inv('a', '2')], [], { now: T0 })).toThrow(/duplicate-invoice/);
    expect(() => reconcile([inv('a', '1.0')], [], { now: T0 })).toThrow(LedgerError);
  });
  it('handles amounts beyond 2^64 and zero-amount invoice', () => {
    const big = (10n ** 40n).toString();
    expect(status(reconcile([inv('a', big)], [pay('p', big, { invoiceId: 'a' })], { now: T0 }), 'a')).toBe('paid');
    expect(status(reconcile([inv('z', '0')], [], { now: T0 }), 'z')).toBe('paid');
  });
});

const E = (id: string, over: Partial<ExportInvoice> = {}): ExportInvoice => ({
  id,
  customer: 'Acme, Inc.',
  currency: 'USD',
  createdAt: Date.UTC(2026, 0, 15) / 1000,
  dueAt: Date.UTC(2026, 1, 15) / 1000,
  lineItems: [
    { description: 'Consulting', quantity: '2', unitMinor: '5000' },
    { description: 'Setup', quantity: '1', unitMinor: '2000' },
  ],
  taxRateBps: 500,
  ...over,
});

describe('text safety', () => {
  it('escapes formulas and controls', () => {
    for (const s of ['=cmd|\' /C calc\'!A0', '+1', '-1', '@SUM(1)', '\tx', '\rx', ' =1+1'])
      expect(sanitizeText(s).startsWith("'")).toBe(true);
    expect(sanitizeText('safe')).toBe('safe');
    expect(sanitizeText('a\u0000b‮c')).toBe('a b‮c');
    expect(sanitizeText('a b')).toBe('a b');
    expect(quoteCell('a"b')).toBe('"a""b"');
    expect(quoteCell('a,b')).toBe('"a,b"');
    expect(quoteCell('a\nb')).toBe('"a\nb"');
    expect(textCell('=1,2')).toBe('"\'=1,2"');
    expect(joinCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
  });
});

describe('totals and exports', () => {
  it('computes totals with computed and explicit tax', () => {
    const t = totalsOf(E('i1'));
    expect([t.subtotalMinor, t.taxMinor, t.totalMinor]).toEqual([12000n, 600n, 12600n]);
    expect(totalsOf(E('i1', { taxMinor: '1' })).totalMinor).toBe(12001n);
    expect(totalsOf(E('i1', { currency: 'JPY' })).exponent).toBe(0);
    expect(totalsOf(E('i1', { taxRateBps: 333 }), { rounding: 'down' }).taxMinor).toBe(399n);
    expect(totalsOf(E('i1', { taxRateBps: 333 })).taxMinor).toBe(400n);
  });
  it('rejects bad data', () => {
    expect(() => totalsOf(E('i', { lineItems: [{ description: 'x', quantity: '1.5', unitMinor: '1' }] }))).toThrow(LedgerError);
    expect(() => totalsOf(E('i', { createdAt: -1 }))).toThrow(/bad-date/);
    expect(() => totalsOf(E('i', { createdAt: 1.5 }))).toThrow(/bad-date/);
    expect(() => isoDate(1e12)).toThrow(LedgerError);
    expect(() => resolveAll([E('i'), E('i')])).toThrow(/duplicate/);
    expect(() => totalsOf(E('i', { taxRateBps: -1 }))).toThrow(/bad-rate/);
  });
  const sample = [E('inv-2', { createdAt: Date.UTC(2026, 0, 16) / 1000 }), E('inv-1', { customer: '=HYPERLINK("http://evil")', status: 'paid', paidMinor: '12600' })];
  it('csv golden + order independence + injection', () => {
    const csv = exportCsv(sample);
    expect(csv).toBe(
      'invoice_id,date,due_date,customer,currency,subtotal,tax_rate_bps,tax,total,paid,status\r\n' +
        'inv-1,2026-01-15,2026-02-15,"\'=HYPERLINK(""http://evil"")",USD,120.00,500,6.00,126.00,126.00,paid\r\n' +
        'inv-2,2026-01-16,2026-02-15,"Acme, Inc.",USD,120.00,500,6.00,126.00,0.00,\r\n',
    );
    expect(exportCsv([...sample].reverse())).toBe(csv);
  });
  it('json', () => {
    const j = JSON.parse(exportJson(sample)) as { id: string; total: string; lines: { amount: string }[] }[];
    expect(j.map((x) => x.id)).toEqual(['inv-1', 'inv-2']);
    expect(j[0]?.total).toBe('126.00');
    expect(j[0]?.lines[0]?.amount).toBe('100.00');
    expect(exportJson([...sample].reverse())).toBe(exportJson(sample));
  });
  it('xero', () => {
    const x = exportXeroCsv([E('inv-1', { taxRateBps: 0 }), E('inv-2', { customer: '+x', taxRateBps: 750 })], { salesAccount: '=bad' });
    const lines = x.trim().split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe('"Acme, Inc.",inv-1,2026-01-15,2026-02-15,Consulting,2,50.00,\'=bad,Tax Exempt,USD');
    expect(lines[3]).toContain("'+x,inv-2");
    expect(lines[3]).toContain('Tax 7.50%');
    expect(exportXeroCsv([E('i')])).toContain(',200,');
  });
  it('iif', () => {
    const out = exportIif([E('inv-1', { customer: 'A\tB\nC' }), E('inv-2', { taxRateBps: 0 })]);
    const rows = out.trim().split('\r\n');
    expect(rows[3]).toBe('TRNS\tINVOICE\t01/15/2026\tAccounts Receivable\tA B C\t126.00\tinv-1');
    expect(rows[4]).toContain('\t-100.00\tConsulting');
    expect(rows.filter((r) => r.includes('Sales Tax Payable'))).toHaveLength(1);
    expect(rows.filter((r) => r === 'ENDTRNS')).toHaveLength(2);
    expect(exportIif([E('i')], { receivableAccount: 'AR', salesAccount: 'S', taxAccount: 'T' })).toContain('\tT\t');
  });
  it('adapts schema invoices', () => {
    const si = {
      nonce: 'a'.repeat(32),
      fiat: { currency: 'USD', minorUnits: '100' },
      quote: { timestamp: 1_800_000_000 },
      expiresAt: 1_800_003_600,
      lineItems: [{ description: 'd', quantity: '1', unitMinorUnits: '100' }],
      tax: { rateBps: 0, minorUnits: '0' },
    } as unknown as Parameters<typeof fromSchemaInvoice>[0];
    const e = fromSchemaInvoice(si, 'Bob', 'paid', '100');
    expect(e).toMatchObject({ id: 'a'.repeat(32), customer: 'Bob', status: 'paid', paidMinor: '100', taxMinor: '0' });
    expect(fromSchemaInvoice(si).customer).toBeUndefined();
    expect(totalsOf(e).totalMinor).toBe(100n);
  });
});

describe('tax summary', () => {
  const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): number => Date.UTC(y, m - 1, d, h, mi, s) / 1000;
  const invs = [
    E('a', { createdAt: at(2025, 12, 31, 23, 59, 59) }),
    E('b', { createdAt: at(2026, 1, 1) }),
    E('c', { createdAt: at(2026, 3, 31) }),
    E('d', { createdAt: at(2026, 4, 1), taxRateBps: 0 }),
    E('e', { createdAt: at(2026, 4, 2), currency: 'JPY', lineItems: [{ description: 'x', quantity: '3', unitMinor: '1000' }] }),
  ];
  it('groups by month/quarter/year', () => {
    const m = taxSummary(invs, 'month');
    expect(m.map((r) => `${r.period}/${r.currency}/${r.rateBps}/${r.count}`)).toEqual([
      '2025-12/USD/500/1',
      '2026-01/USD/500/1',
      '2026-03/USD/500/1',
      '2026-04/JPY/500/1',
      '2026-04/USD/0/1',
    ]);
    const q = taxSummary(invs, 'quarter');
    expect(q.find((r) => r.period === '2026-Q1')).toMatchObject({ count: 2, taxableMinor: '24000', taxMinor: '1200' });
    expect(q.map((r) => r.period)).toEqual(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q2']);
    const y = taxSummary(invs, 'year');
    expect(y.find((r) => r.period === '2026' && r.currency === 'USD' && r.rateBps === 500)).toMatchObject({ count: 2 });
    expect(taxSummary([...invs].reverse(), 'year')).toEqual(y);
  });
  it('csv with per-currency exponent', () => {
    const csv = taxSummaryCsv(taxSummary(invs, 'month'));
    expect(csv).toContain('2026-04,JPY,500,1,3000,150\r\n');
    expect(csv).toContain('2026-01,USD,500,1,120.00,6.00\r\n');
    expect(taxSummaryCsv([{ period: 'p', currency: 'USD', rateBps: 1, count: 1, taxableMinor: '1', taxMinor: '0' }], { exponents: { USD: 3 } })).toContain('0.001,0.000');
  });
});
