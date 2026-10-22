import type { Invoice } from '@ghostpay/invoice-schema';
import { LedgerError } from './errors.js';
import { computeTax, currencyExponent, formatMinor, parseMinor, type RoundingMode } from './decimal.js';
import { joinCsv, quoteCell, sanitizeText, textCell } from './csv.js';

export interface ExportLineItem {
  readonly description: string;
  readonly quantity: string;
  readonly unitMinor: string;
}

export interface ExportInvoice {
  readonly id: string;
  readonly customer?: string;
  readonly currency: string;
  /** Unix seconds. */
  readonly createdAt: number;
  /** Unix seconds. */
  readonly dueAt: number;
  readonly lineItems: readonly ExportLineItem[];
  readonly taxRateBps: number;
  /** Explicit tax; computed from the rate when absent. */
  readonly taxMinor?: string;
  readonly status?: string;
  readonly paidMinor?: string;
}

export interface ExportOptions {
  readonly rounding?: RoundingMode;
  readonly exponents?: Readonly<Record<string, number>>;
  /** Xero/IIF account names / codes. */
  readonly salesAccount?: string;
  readonly taxAccount?: string;
  readonly receivableAccount?: string;
}

/** Computed, fully-resolved invoice amounts. */
export interface InvoiceTotals {
  readonly id: string;
  readonly customer: string;
  readonly currency: string;
  readonly date: string;
  readonly dueDate: string;
  readonly createdAt: number;
  readonly subtotalMinor: bigint;
  readonly taxMinor: bigint;
  readonly taxRateBps: number;
  readonly totalMinor: bigint;
  readonly status: string;
  readonly paidMinor: bigint;
  readonly exponent: number;
  readonly lines: readonly { description: string; quantity: bigint; unitMinor: bigint; amountMinor: bigint }[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** UTC date `YYYY-MM-DD` for unix seconds. @throws {LedgerError} `bad-date`. */
export function isoDate(unixSeconds: number): string {
  if (!Number.isSafeInteger(unixSeconds) || unixSeconds < 0 || unixSeconds > 253_402_300_799)
    throw new LedgerError('bad-date');
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Adapt a GhostPay invoice. Id is the invoice nonce; created = quote timestamp.
 *
 * @param inv Validated invoice.
 * @param customer Optional label (untrusted text).
 */
export function fromSchemaInvoice(inv: Invoice, customer?: string, status?: string, paidMinor?: string): ExportInvoice {
  return {
    id: inv.nonce,
    ...(customer === undefined ? {} : { customer }),
    currency: inv.fiat.currency,
    createdAt: inv.quote.timestamp,
    dueAt: inv.expiresAt,
    lineItems: inv.lineItems.map((l) => ({ description: l.description, quantity: l.quantity, unitMinor: l.unitMinorUnits })),
    taxRateBps: inv.tax.rateBps,
    taxMinor: inv.tax.minorUnits,
    ...(status === undefined ? {} : { status }),
    ...(paidMinor === undefined ? {} : { paidMinor }),
  };
}

/**
 * Resolve totals for one invoice.
 *
 * @throws {LedgerError} On malformed money, rate or date.
 * @security Rounding is explicit and integer-only; tax given on the invoice is trusted as signed data, not recomputed.
 */
export function totalsOf(inv: ExportInvoice, options: ExportOptions = {}): InvoiceTotals {
  const lines = inv.lineItems.map((l) => {
    const quantity = parseMinor(l.quantity);
    const unitMinor = parseMinor(l.unitMinor);
    return { description: l.description, quantity, unitMinor, amountMinor: quantity * unitMinor };
  });
  const subtotalMinor = lines.reduce((a, l) => a + l.amountMinor, 0n);
  const taxMinor =
    inv.taxMinor === undefined ? computeTax(subtotalMinor, inv.taxRateBps, options.rounding) : parseMinor(inv.taxMinor);
  return {
    id: inv.id,
    customer: inv.customer ?? '',
    currency: inv.currency,
    date: isoDate(inv.createdAt),
    dueDate: isoDate(inv.dueAt),
    createdAt: inv.createdAt,
    subtotalMinor,
    taxMinor,
    taxRateBps: inv.taxRateBps,
    totalMinor: subtotalMinor + taxMinor,
    status: inv.status ?? '',
    paidMinor: inv.paidMinor === undefined ? 0n : parseMinor(inv.paidMinor),
    exponent: currencyExponent(inv.currency, options.exponents),
    lines,
  };
}

/** Resolve and sort deterministically by (createdAt, id). Duplicate ids are rejected. */
export function resolveAll(invoices: readonly ExportInvoice[], options: ExportOptions = {}): InvoiceTotals[] {
  const all = invoices.map((i) => totalsOf(i, options));
  all.sort((a, b) => a.createdAt - b.createdAt || cmp(a.id, b.id));
  for (let i = 1; i < all.length; i++) if (all[i]?.id === all[i - 1]?.id) throw new LedgerError('duplicate-invoice');
  return all;
}

const fmt = (t: InvoiceTotals, v: bigint): string => formatMinor(v, t.exponent);

/** Generic one-row-per-invoice CSV (CRLF, formula-safe). */
export function exportCsv(invoices: readonly ExportInvoice[], options: ExportOptions = {}): string {
  const rows: string[][] = [
    ['invoice_id', 'date', 'due_date', 'customer', 'currency', 'subtotal', 'tax_rate_bps', 'tax', 'total', 'paid', 'status'],
  ];
  for (const t of resolveAll(invoices, options))
    rows.push([
      textCell(t.id),
      t.date,
      t.dueDate,
      textCell(t.customer),
      textCell(t.currency),
      fmt(t, t.subtotalMinor),
      String(t.taxRateBps),
      fmt(t, t.taxMinor),
      fmt(t, t.totalMinor),
      fmt(t, t.paidMinor),
      textCell(t.status),
    ]);
  return joinCsv(rows);
}

/** JSON export: array sorted deterministically, amounts as decimal strings, fixed key order. */
export function exportJson(invoices: readonly ExportInvoice[], options: ExportOptions = {}): string {
  const out = resolveAll(invoices, options).map((t) => ({
    currency: t.currency,
    customer: t.customer,
    date: t.date,
    dueDate: t.dueDate,
    id: t.id,
    lines: t.lines.map((l) => ({
      amount: fmt(t, l.amountMinor),
      description: l.description,
      quantity: l.quantity.toString(),
      unitAmount: fmt(t, l.unitMinor),
    })),
    paid: fmt(t, t.paidMinor),
    status: t.status,
    subtotal: fmt(t, t.subtotalMinor),
    tax: fmt(t, t.taxMinor),
    taxRateBps: t.taxRateBps,
    total: fmt(t, t.totalMinor),
  }));
  return JSON.stringify(out, null, 2) + '\n';
}

/** Xero-style sales-invoice import CSV: one row per line item. */
export function exportXeroCsv(invoices: readonly ExportInvoice[], options: ExportOptions = {}): string {
  const sales = options.salesAccount ?? '200';
  const rows: string[][] = [
    ['*ContactName', '*InvoiceNumber', '*InvoiceDate', '*DueDate', 'Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency'],
  ];
  for (const t of resolveAll(invoices, options))
    for (const l of t.lines)
      rows.push([
        textCell(t.customer),
        textCell(t.id),
        t.date,
        t.dueDate,
        textCell(l.description),
        l.quantity.toString(),
        fmt(t, l.unitMinor),
        textCell(sales),
        t.taxRateBps === 0 ? 'Tax Exempt' : `Tax ${formatMinor(BigInt(t.taxRateBps), 2)}%`,
        textCell(t.currency),
      ]);
  return joinCsv(rows);
}

const iifText = (s: string): string => sanitizeText(s).replace(/[\t\r\n]/g, ' ');

/** QuickBooks-IIF-like invoice export (tab separated, TRNS/SPL/ENDTRNS). Not validated against QuickBooks. */
export function exportIif(invoices: readonly ExportInvoice[], options: ExportOptions = {}): string {
  const ar = options.receivableAccount ?? 'Accounts Receivable';
  const sales = options.salesAccount ?? 'Sales';
  const taxAcc = options.taxAccount ?? 'Sales Tax Payable';
  const lines: string[] = [
    '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM',
    '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO',
    '!ENDTRNS',
  ];
  for (const t of resolveAll(invoices, options)) {
    const d = t.date.slice(5, 7) + '/' + t.date.slice(8, 10) + '/' + t.date.slice(0, 4);
    lines.push(['TRNS', 'INVOICE', d, iifText(ar), iifText(t.customer), fmt(t, t.totalMinor), iifText(t.id)].join('\t'));
    for (const l of t.lines)
      lines.push(['SPL', 'INVOICE', d, iifText(sales), iifText(t.customer), fmt(t, -l.amountMinor), iifText(l.description)].join('\t'));
    if (t.taxMinor > 0n)
      lines.push(['SPL', 'INVOICE', d, iifText(taxAcc), iifText(t.customer), fmt(t, -t.taxMinor), 'Tax'].join('\t'));
    lines.push('ENDTRNS');
  }
  return lines.join('\r\n') + '\r\n';
}

export type Period = 'month' | 'quarter' | 'year';

export interface TaxSummaryRow {
  readonly period: string;
  readonly currency: string;
  readonly rateBps: number;
  readonly count: number;
  readonly taxableMinor: string;
  readonly taxMinor: string;
}

/**
 * Per-period tax summary grouped by (period, currency, rate), UTC periods.
 *
 * @param invoices Invoices; only non-excluded statuses should be passed by the caller.
 * @param period Grouping.
 * @param options Rounding for computed tax.
 * @returns Rows sorted by period, currency, rate.
 */
export function taxSummary(
  invoices: readonly ExportInvoice[],
  period: Period,
  options: ExportOptions = {},
): TaxSummaryRow[] {
  const acc = new Map<string, { row: Omit<TaxSummaryRow, 'taxableMinor' | 'taxMinor'>; base: bigint; tax: bigint }>();
  for (const t of resolveAll(invoices, options)) {
    const y = t.date.slice(0, 4);
    const m = Number(t.date.slice(5, 7));
    const p = period === 'year' ? y : period === 'month' ? t.date.slice(0, 7) : `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    const key = `${p}\u0000${t.currency}\u0000${String(t.taxRateBps).padStart(6, '0')}`;
    const e = acc.get(key) ?? { row: { period: p, currency: t.currency, rateBps: t.taxRateBps, count: 0 }, base: 0n, tax: 0n };
    acc.set(key, { row: { ...e.row, count: e.row.count + 1 }, base: e.base + t.subtotalMinor, tax: e.tax + t.taxMinor });
  }
  return [...acc.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([, e]) => ({ ...e.row, taxableMinor: e.base.toString(), taxMinor: e.tax.toString() }));
}

/** Tax summary as CSV with decimal amounts (per-row currency exponent). */
export function taxSummaryCsv(rows: readonly TaxSummaryRow[], options: ExportOptions = {}): string {
  const out: string[][] = [['period', 'currency', 'rate_bps', 'invoices', 'taxable', 'tax']];
  for (const r of rows) {
    const e = currencyExponent(r.currency, options.exponents);
    out.push([r.period, quoteCell(sanitizeText(r.currency)), String(r.rateBps), String(r.count), formatMinor(BigInt(r.taxableMinor), e), formatMinor(BigInt(r.taxMinor), e)]);
  }
  return joinCsv(out);
}
