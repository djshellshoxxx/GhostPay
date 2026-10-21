import { describe, expect, it } from 'vitest';
import { exportCsv } from './encoder.js';
import { ExportError } from './errors.js';
import { row } from './fixtures.testutil.js';
import { parseCsv } from './parser.js';
import { periodKey, summarize, summaryToCsv, totalsPerAsset } from './summary.js';

const d = (y: number, m: number, day: number, h = 0): number => Date.UTC(y, m - 1, day, h);

describe('periodKey', () => {
  it('buckets in UTC', () => {
    const t = Date.UTC(2024, 11, 31, 23, 59, 59, 999);
    expect(periodKey(t, 'day')).toBe('2024-12-31');
    expect(periodKey(t, 'month')).toBe('2024-12');
    expect(periodKey(t, 'quarter')).toBe('2024-Q4');
    expect(periodKey(t, 'year')).toBe('2024');
    expect(periodKey(t, 'all')).toBe('ALL');
    expect(periodKey(t + 1, 'day')).toBe('2025-01-01');
    expect(periodKey(d(2024, 4, 1), 'quarter')).toBe('2024-Q2');
    expect(periodKey(d(2024, 3, 31), 'quarter')).toBe('2024-Q1');
    expect(periodKey(0, 'year')).toBe('1970');
    expect(() => periodKey(-1, 'day')).toThrow(ExportError);
  });
});

describe('summarize', () => {
  const rows = [
    row({ id: '1', timestampMs: d(2024, 1, 5), direction: 'in', amount: 10_000_000n }),
    row({ id: '2', timestampMs: d(2024, 1, 20), direction: 'out', amount: 2_500_000n, fee: 1_000n }),
    row({ id: '3', timestampMs: d(2024, 4, 2), direction: 'in', amount: 1n }),
    row({ id: '4', timestampMs: d(2024, 1, 6), direction: 'in', amount: 99n, asset: 'ETH', decimals: 18 }),
    row({ id: '5', timestampMs: d(2024, 1, 7), direction: 'in', amount: 777n, status: 'pending' }),
    row({ id: '6', timestampMs: d(2024, 1, 8), direction: 'in', amount: 888n, status: 'failed' }),
  ];
  it('totals per period and asset with exact bigint math', () => {
    const s = summarize(rows, { period: 'quarter' });
    expect(s).toEqual([
      {
        period: '2024-Q1',
        asset: 'ETH',
        decimals: 18,
        count: 1,
        received: 99n,
        sent: 0n,
        fees: 0n,
        net: 99n,
      },
      {
        period: '2024-Q1',
        asset: 'USDC',
        decimals: 6,
        count: 2,
        received: 10_000_000n,
        sent: 2_500_000n,
        fees: 1_000n,
        net: 7_499_000n,
      },
      { period: '2024-Q2', asset: 'USDC', decimals: 6, count: 1, received: 1n, sent: 0n, fees: 0n, net: 1n },
    ]);
  });
  it('filters by status and range [from, to)', () => {
    const s = summarize(rows, { period: 'all', statuses: ['pending', 'failed'] });
    expect(s).toHaveLength(1);
    expect(s[0]?.received).toBe(1665n);
    const r = summarize(rows, { period: 'all', fromMs: d(2024, 1, 5), toMs: d(2024, 1, 20) });
    expect(r.map((l) => l.asset + l.count)).toEqual(['ETH1', 'USDC1']);
  });
  it('keeps precision beyond 2^53', () => {
    const big = 9_007_199_254_740_993n;
    const s = summarize([row({ id: 'a', amount: big }), row({ id: 'b', amount: big })], { period: 'all' });
    expect(s[0]?.received).toBe(big * 2n);
  });
  it('net can be negative', () => {
    const s = summarize([row({ direction: 'out', amount: 5n, fee: 1n })], { period: 'day' });
    expect(s[0]?.net).toBe(-6n);
  });
  it('rejects mixed decimals and bad options', () => {
    expect(() => summarize([row({ id: 'a' }), row({ id: 'b', decimals: 8 })], { period: 'all' })).toThrow(
      /decimals/,
    );
    expect(() => summarize([], { period: 'all', statuses: ['bogus' as never] })).toThrow(ExportError);
    expect(() => summarize([], { period: 'all', fromMs: -1 })).toThrow(ExportError);
    expect(() => summarize([], { period: 'all', toMs: 1.5 })).toThrow(ExportError);
    expect(() => summarize([row({ id: '' })], { period: 'all' })).toThrow(ExportError);
    expect(summarize([], { period: 'all' })).toEqual([]);
  });
  it('is order independent and sorted deterministically', () => {
    const a = summarize(rows, { period: 'month' });
    const b = summarize([...rows].reverse(), { period: 'month' });
    expect(b).toEqual(a);
    expect(a.map((l) => `${l.period}/${l.asset}`)).toEqual(['2024-01/ETH', '2024-01/USDC', '2024-04/USDC']);
  });
});

describe('totalsPerAsset', () => {
  it('collapses periods', () => {
    const s = summarize(
      [
        row({ id: '1', timestampMs: d(2023, 5, 1), amount: 5n }),
        row({ id: '2', timestampMs: d(2024, 5, 1), amount: 7n, fee: 1n, direction: 'out' }),
        row({ id: '3', timestampMs: d(2024, 5, 1), asset: 'ETH', decimals: 18 }),
      ],
      { period: 'year' },
    );
    const t = totalsPerAsset(s);
    expect(t.map((l) => l.asset)).toEqual(['ETH', 'USDC']);
    expect(t[1]).toMatchObject({ period: 'TOTAL', count: 2, received: 5n, sent: 7n, fees: 1n, net: -3n });
  });
  it('rejects decimals mismatch', () => {
    const base = { period: 'p', asset: 'X', count: 1, received: 0n, sent: 0n, fees: 0n, net: 0n };
    expect(() =>
      totalsPerAsset([
        { ...base, decimals: 1 },
        { ...base, decimals: 2 },
      ]),
    ).toThrow(ExportError);
  });
});

describe('summaryToCsv', () => {
  it('renders exact decimals and parses back', () => {
    const s = summarize([row({ direction: 'out', amount: 5n, fee: 1n })], { period: 'month' });
    const csv = summaryToCsv(s);
    expect(csv).toBe(
      'period,asset,decimals,count,received,sent,fees,net\r\n2024-01,USDC,6,1,0.000000,0.000005,0.000001,-0.000006\r\n',
    );
    expect(parseCsv(csv)[1]?.[7]).toBe('-0.000006');
  });
  it('neutralises asset, supports bom/trim/lf, empty input', () => {
    const s = summarize([row({ asset: '=EVIL()', amount: 1_000_000n })], { period: 'all' });
    const csv = summaryToCsv(s, { bom: true, trimZeros: true, eol: 'lf' });
    expect(csv).toBe("﻿period,asset,decimals,count,received,sent,fees,net\nALL,'=EVIL(),6,1,1,0,0,1\n");
    expect(summaryToCsv([])).toBe('period,asset,decimals,count,received,sent,fees,net\r\n');
    expect(exportCsv([])).toContain('id,timestamp');
  });
  it('rejects control chars in asset', () => {
    const l = {
      period: 'p',
      asset: 'A\u0000',
      decimals: 0,
      count: 1,
      received: 0n,
      sent: 0n,
      fees: 0n,
      net: 0n,
    };
    expect(() => summaryToCsv([l])).toThrow(/control/);
    expect(summaryToCsv([l], { invalidText: 'replace' })).toContain('A�');
  });
  it('applies size limits', () => {
    const l = { period: 'p', asset: 'A', decimals: 0, count: 1, received: 0n, sent: 0n, fees: 0n, net: 0n };
    expect(() => summaryToCsv([l, l, l], { maxRows: 2 })).toThrow(/maxRows/);
  });
});
