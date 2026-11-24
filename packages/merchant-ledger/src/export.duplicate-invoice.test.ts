import { describe, expect, it } from 'vitest';
import { LedgerError } from './errors.js';
import { exportCsv, exportIif, exportJson, exportXeroCsv, resolveAll, taxSummary, type ExportInvoice } from './export.js';

const row = (id: string, createdAt: number): ExportInvoice => ({
  id,
  currency: 'USD',
  createdAt,
  dueAt: 1_800_000_000,
  lineItems: [{ description: 'item', quantity: '1', unitMinor: '100' }],
  taxRateBps: 500,
});

const T = 1_700_000_000;
const separated = [row('dup', T), row('other', T + 1), row('dup', T + 2)];
const valid = [row('z', T + 1), row('b', T), row('a', T)];

describe('merchant ledger duplicate invoice IDs', () => {
  it('rejects duplicate IDs separated by another date-sorted invoice in either input order', () => {
    expect(() => resolveAll(separated)).toThrow(new LedgerError('duplicate-invoice'));
    expect(() => resolveAll([...separated].reverse())).toThrow(new LedgerError('duplicate-invoice'));
  });

  it('preserves duplicate rejection for same-date and adjacent different-date records', () => {
    expect(() => resolveAll([row('dup', T), row('dup', T)])).toThrow(new LedgerError('duplicate-invoice'));
    expect(() => resolveAll([row('dup', T), row('dup', T + 2)])).toThrow(new LedgerError('duplicate-invoice'));
  });

  it('rejects the same duplicate across every invoice export and tax aggregation', () => {
    const outputs = [exportCsv, exportJson, exportXeroCsv, exportIif, (rows: readonly ExportInvoice[]) => taxSummary(rows, 'year')];
    for (const output of outputs)
      expect(() => output(separated)).toThrow(new LedgerError('duplicate-invoice'));
  });

  it('preserves unique-record date/id sorting, totals, deterministic output and empty input', () => {
    expect(resolveAll(valid).map((x) => x.id)).toEqual(['a', 'b', 'z']);
    expect(taxSummary(valid, 'year').map((x) => [x.count, x.taxableMinor, x.taxMinor])).toEqual([[3, '300', '15']]);
    expect(exportJson(valid)).toBe(exportJson([...valid].reverse()));
    expect(resolveAll([])).toEqual([]);
  });
});
