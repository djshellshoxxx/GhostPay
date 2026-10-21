import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT } from './amount.js';
import { exportCsv } from './encoder.js';
import { ExportError } from './errors.js';
import { row } from './fixtures.testutil.js';
import { parseLedgerCsv } from './import.js';
import { MAX_TIMESTAMP_MS } from './time.js';
import type { LedgerRow } from './types.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof ExportError ? e.code : 'OTHER';
  }
  return undefined;
};

describe('round trip', () => {
  it('restores rows exactly, including hostile text', () => {
    const rows = [
      row(),
      row({
        id: "'=x",
        memo: "=cmd|' /C calc'!A0",
        counterparty: '-5',
        direction: 'out',
        amount: MAX_AMOUNT,
        fee: 7n,
        decimals: 18,
      }),
      row({ id: '@a', memo: 'line1\r\nline2,\t"q"', txHash: '+1', status: 'pending', timestampMs: 0 }),
      row({
        id: 'e',
        memo: '',
        chain: '',
        counterparty: '',
        txHash: '',
        amount: 0n,
        timestampMs: MAX_TIMESTAMP_MS,
        status: 'failed',
      }),
      row({ id: "''-", memo: "'''=", asset: '-X' }),
    ];
    expect(parseLedgerCsv(exportCsv(rows), {})).toEqual(rows);
    expect(parseLedgerCsv(exportCsv(rows, { bom: true, eol: 'lf', trimZeros: true }))).toEqual(rows);
  });
  it('property: arbitrary rows survive export -> import', () => {
    const text = fc.string({
      unit: fc.constantFrom('a', ',', '"', '\n', '\r', '\t', '=', '+', '-', '@', "'", ' ', 'é'),
    });
    const arb = fc.record({
      id: text.filter((s) => s !== ''),
      timestampMs: fc.integer({ min: 0, max: MAX_TIMESTAMP_MS }),
      direction: fc.constantFrom('in' as const, 'out' as const),
      chain: text,
      asset: text.filter((s) => s !== ''),
      decimals: fc.integer({ min: 0, max: 38 }),
      amount: fc.bigInt({ min: 0n, max: MAX_AMOUNT }),
      fee: fc.bigInt({ min: 0n, max: MAX_AMOUNT }),
      counterparty: text,
      txHash: text,
      memo: text,
      status: fc.constantFrom('pending' as const, 'confirmed' as const, 'failed' as const),
    });
    fc.assert(
      fc.property(fc.array(arb, { maxLength: 4 }), (rs) => {
        const rows: LedgerRow[] = rs.map((r, i) => ({ ...r, id: `${i}${r.id}` }));
        expect(parseLedgerCsv(exportCsv(rows))).toEqual(rows);
      }),
    );
  });
  it('works with signed_amount-only, custom headers and assetDecimals', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', direction: 'out', amount: 42n })];
    const columns = [
      { key: 'id' as const, header: 'Ref' },
      'timestamp' as const,
      'asset' as const,
      'signed_amount' as const,
    ];
    const csv = exportCsv(rows, { columns, dateFormat: 'unix' });
    const back = parseLedgerCsv(csv, { columns, dateFormat: 'unix', assetDecimals: new Map([['USDC', 6]]) });
    expect(back.map((r) => [r.id, r.direction, r.amount, r.timestampMs, r.status, r.fee])).toEqual([
      ['a', 'in', 1_500_000n, 1704164645000, 'confirmed', 0n],
      ['b', 'out', 42n, 1704164645000, 'confirmed', 0n],
    ]);
  });
  it('date format round trip is day-granular', () => {
    const r = row({ timestampMs: Date.UTC(2024, 5, 1) });
    expect(parseLedgerCsv(exportCsv([r], { dateFormat: 'date' }), { dateFormat: 'date' })).toEqual([r]);
  });
  it('unneutralize can be disabled', () => {
    const csv = exportCsv([row({ memo: '=x' })]);
    expect(parseLedgerCsv(csv, { unneutralize: false })[0]?.memo).toBe("'=x");
  });
  it('allows duplicates when asked', () => {
    const csv = exportCsv([row(), row()]);
    expect(code(() => parseLedgerCsv(csv))).toBe('PARSE_DUPLICATE');
    expect(parseLedgerCsv(csv, { rejectDuplicateIds: false })).toHaveLength(2);
  });
});

describe('header and shape validation', () => {
  const good = exportCsv([row()]);
  it('rejects empty and header-only/ragged/mismatched', () => {
    expect(code(() => parseLedgerCsv(''))).toBe('PARSE_HEADER');
    expect(parseLedgerCsv(exportCsv([]))).toEqual([]);
    expect(code(() => parseLedgerCsv(good.replace('tx_hash', 'hash')))).toBe('PARSE_HEADER');
    expect(code(() => parseLedgerCsv(good.replace(',status', '')))).toBe('PARSE_RAGGED');
    expect(code(() => parseLedgerCsv(good.replace('1.500000,', '')))).toBe('PARSE_RAGGED');
    expect(code(() => parseLedgerCsv('id\r\nx\r\n'))).toBe('PARSE_HEADER');
    expect(
      code(() =>
        parseLedgerCsv(
          good.replace('status\r\n', 'status,extra\r\n').replace('confirmed\r\n', 'confirmed,x\r\n'),
        ),
      ),
    ).toBe('PARSE_HEADER');
  });
  it('requires essential columns / decimals source', () => {
    expect(
      code(() =>
        parseLedgerCsv(good, { columns: ['timestamp', 'asset', 'amount', 'direction', 'decimals'] }),
      ),
    ).toBe('INVALID_OPTION');
    expect(
      code(() => parseLedgerCsv(good, { columns: ['id', 'asset', 'amount', 'direction', 'decimals'] })),
    ).toBe('INVALID_OPTION');
    expect(
      code(() => parseLedgerCsv(good, { columns: ['id', 'timestamp', 'amount', 'direction', 'decimals'] })),
    ).toBe('INVALID_OPTION');
    expect(
      code(() => parseLedgerCsv(good, { columns: ['id', 'timestamp', 'asset', 'direction', 'decimals'] })),
    ).toBe('INVALID_OPTION');
    expect(
      code(() => parseLedgerCsv(good, { columns: ['id', 'timestamp', 'asset', 'amount', 'decimals'] })),
    ).toBe('INVALID_OPTION');
    expect(
      code(() => parseLedgerCsv(good, { columns: ['id', 'timestamp', 'asset', 'amount', 'direction'] })),
    ).toBe('INVALID_OPTION');
  });
  it('enforces limits through options', () => {
    const many = exportCsv(Array.from({ length: 5 }, (_, i) => row({ id: `i${i}` })));
    expect(parseLedgerCsv(many, { maxRows: 5 })).toHaveLength(5);
    expect(code(() => parseLedgerCsv(many, { maxRows: 4 }))).toBe('LIMIT_ROWS');
    expect(code(() => parseLedgerCsv(many, { maxBytes: 100 }))).toBe('LIMIT_BYTES');
    expect(code(() => parseLedgerCsv(many, { maxFields: 3 }))).toBe('LIMIT_FIELDS');
    expect(code(() => parseLedgerCsv(many, { maxFieldChars: 5 }))).toBe('LIMIT_FIELD_LENGTH');
  });
});

describe('cell validation', () => {
  const base = exportCsv([row()]);
  const bad = (from: string, to: string, opts = {}): string | undefined =>
    code(() => parseLedgerCsv(base.replace(from, to), opts));
  it('rejects malformed cells with PARSE_VALUE and positions only', () => {
    expect(bad(',in,', ',sideways,')).toBe('PARSE_VALUE');
    expect(bad(',confirmed', ',done')).toBe('PARSE_VALUE');
    expect(bad('1.500000', '1.5000001')).toBe('PARSE_VALUE');
    expect(bad('1.500000', '-1.5')).toBe('PARSE_VALUE');
    expect(bad('1.500000', '1e6')).toBe('PARSE_VALUE');
    expect(bad(',0.000000,', ',0.0000001,')).toBe('PARSE_VALUE');
    expect(bad('2024-01-02T03:04:05.006Z', '2024-01-02T03:04:05+01:00')).toBe('PARSE_VALUE');
    expect(bad(',6,', ',06,')).toBe('PARSE_VALUE');
    expect(bad(',6,', ',99,')).toBe('PARSE_VALUE');
    expect(bad('tx-0001', '')).toBe('PARSE_VALUE');
    expect(bad(',USDC,', ',,')).toBe('PARSE_VALUE');
    try {
      parseLedgerCsv(base.replace('1.500000', 'EVIL=1'));
      expect.unreachable();
    } catch (e) {
      expect((e as ExportError).row).toBe(2);
      expect((e as ExportError).column).toBe(7);
      expect((e as ExportError).message).not.toContain('EVIL');
    }
  });
  it('checks decimals against assetDecimals', () => {
    expect(bad(',6,', ',6,', { assetDecimals: new Map([['USDC', 8]]) })).toBe('PARSE_VALUE');
    expect(bad(',6,', ',6,', { assetDecimals: new Map([['USDC', 6]]) })).toBeUndefined();
    expect(bad(',6,', ',6,', { assetDecimals: new Map([['ETH', 18]]) })).toBeUndefined();
  });
  it('needs known decimals when no decimals column', () => {
    const columns = ['id', 'timestamp', 'asset', 'amount', 'direction'] as const;
    const csv = exportCsv([row()], { columns });
    expect(code(() => parseLedgerCsv(csv, { columns, assetDecimals: new Map() }))).toBe('PARSE_VALUE');
    expect(parseLedgerCsv(csv, { columns, assetDecimals: new Map([['USDC', 6]]) })[0]?.amount).toBe(
      1_500_000n,
    );
  });
  it('validates signed_amount against amount and direction', () => {
    const columns = ['id', 'timestamp', 'asset', 'decimals', 'direction', 'amount', 'signed_amount'] as const;
    const csv = exportCsv([row(), row({ id: 'z', amount: 0n, direction: 'out' })], { columns });
    expect(parseLedgerCsv(csv, { columns })).toHaveLength(2);
    expect(
      code(() => parseLedgerCsv(csv.replace(',in,1.500000,1.500000', ',out,1.500000,1.500000'), { columns })),
    ).toBe('PARSE_VALUE');
    expect(
      code(() => parseLedgerCsv(csv.replace(',1.500000,1.500000', ',1.500000,-1.500000'), { columns })),
    ).toBe('PARSE_VALUE');
    expect(code(() => parseLedgerCsv(csv.replace(',1.500000,1.500000', ',1.500000,2'), { columns }))).toBe(
      'PARSE_VALUE',
    );
    const only = ['id', 'timestamp', 'asset', 'decimals', 'signed_amount'] as const;
    const c2 = exportCsv([row()], { columns: only }).replace('1.500000', '-0');
    expect(code(() => parseLedgerCsv(c2, { columns: only }))).toBe('PARSE_VALUE');
  });
});
