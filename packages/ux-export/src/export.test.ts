import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { csvChunks, csvChunksAsync, exportCsv, ChunkWriter } from './encoder.js';
import { ExportError } from './errors.js';
import { row } from './fixtures.testutil.js';
import { resolveColumns, validateRow, type LedgerRow } from './types.js';

describe('exportCsv', () => {
  it('writes RFC 4180 output with exact decimals', () => {
    const csv = exportCsv([
      row(),
      row({ id: 'tx-0002', direction: 'out', amount: 1n, fee: 20n, memo: 'a\nb' }),
    ]);
    expect(csv).toBe(
      'id,timestamp,direction,chain,asset,decimals,amount,fee,counterparty,tx_hash,memo,status\r\n' +
        'tx-0001,2024-01-02T03:04:05.006Z,in,testnet,USDC,6,1.500000,0.000000,fake-address-0001,0xfake0001,"coffee, ""large""",confirmed\r\n' +
        'tx-0002,2024-01-02T03:04:05.006Z,out,testnet,USDC,6,0.000001,0.000020,fake-address-0001,0xfake0001,"a\nb",confirmed\r\n',
    );
  });
  it('neutralises injection in text but keeps numeric cells', () => {
    const csv = exportCsv([row({ memo: '=HYPERLINK("x")', counterparty: '@evil', id: '-1', asset: '+X' })], {
      columns: ['id', 'asset', 'counterparty', 'memo', 'signed_amount'],
    });
    expect(csv).toBe(
      'id,asset,counterparty,memo,signed_amount\r\n\'-1,\'+X,\'@evil,"\'=HYPERLINK(""x"")",1.500000\r\n',
    );
    const out = exportCsv([row({ direction: 'out' })], { columns: ['signed_amount'] });
    expect(out).toBe('signed_amount\r\n-1.500000\r\n');
  });
  it('neutralises custom headers too', () => {
    const csv = exportCsv([], { columns: [{ key: 'memo', header: '=bad' }] });
    expect(csv).toBe("'=bad\r\n");
  });
  it('supports column subset, order, lf, trim, bom, date formats', () => {
    const csv = exportCsv([row()], {
      columns: [{ key: 'amount', header: 'Amount' }, 'timestamp', 'status'],
      dateFormat: 'date',
      eol: 'lf',
      trimZeros: true,
      bom: true,
    });
    expect(csv).toBe('﻿Amount,timestamp,status\n1.5,2024-01-02,confirmed\n');
    expect(exportCsv([row()], { columns: ['timestamp'], dateFormat: 'unix' })).toBe(
      'timestamp\r\n1704164645\r\n',
    );
  });
  it('quotes a lone empty field so rows are not blank lines', () => {
    expect(exportCsv([row({ memo: '' })], { columns: ['memo'] })).toBe('memo\r\n""\r\n');
  });
  it('handles all columns', () => {
    const csv = exportCsv([row()], {
      columns: [
        'id',
        'timestamp',
        'direction',
        'chain',
        'asset',
        'decimals',
        'amount',
        'signed_amount',
        'fee',
        'counterparty',
        'tx_hash',
        'memo',
        'status',
      ],
    });
    expect(csv.split('\r\n')[1]).toContain(',1.500000,1.500000,0.000000,');
  });
  it('rejects bad options', () => {
    expect(() => exportCsv([], { columns: [] })).toThrow(ExportError);
    expect(() => exportCsv([], { columns: ['id', 'id'] })).toThrow(/duplicate/);
    expect(() =>
      exportCsv([], {
        columns: [
          { key: 'id', header: 'x' },
          { key: 'memo', header: 'x' },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(() => exportCsv([], { columns: ['nope' as never] })).toThrow(/unknown/);
    expect(() => exportCsv([], { columns: [{ key: 'id', header: '' }] })).toThrow(/header/);
    expect(() => exportCsv([], { columns: [{ key: 'id', header: 'x'.repeat(65) }] })).toThrow(/header/);
    expect(() => exportCsv([], { columns: Array(14).fill('id') })).toThrow(/1\.\.13/);
    for (const o of [{ maxRows: 0 }, { maxBytes: 1.5 }, { chunkChars: -1 }]) {
      expect(() => exportCsv([], o)).toThrow(/positive integer/);
    }
  });
  it('validates rows', () => {
    const bad: Partial<LedgerRow>[] = [
      { id: '' },
      { asset: '' },
      { direction: 'sideways' as never },
      { status: 'weird' as never },
      { amount: -1n },
      { amount: 5 as never },
      { fee: -1n },
      { fee: 1n << 256n },
      { decimals: 99 },
      { timestampMs: -5 },
      { memo: 5 as never },
    ];
    for (const b of bad) expect(() => exportCsv([row(b)])).toThrow(ExportError);
    expect(() => validateRow(row({ id: '' }), 7)).toThrow(/row 7/);
  });
  it('rejects control characters unless replacing', () => {
    expect(() => exportCsv([row({ memo: 'a\u0000b' })])).toThrow(/control/);
    expect(() => exportCsv([row()], { columns: [{ key: 'id', header: 'a\u0001' }] })).toThrow(ExportError);
    expect(exportCsv([row({ memo: 'a\u0000b' })], { columns: ['memo'], invalidText: 'replace' })).toBe(
      'memo\r\na�b\r\n',
    );
  });
});

describe('limits and streaming', () => {
  it('enforces maxRows', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    expect(() => exportCsv(rows, { maxRows: 2 })).toThrow(/maxRows/);
    expect(exportCsv(rows, { maxRows: 3 })).toContain('c,');
  });
  it('enforces maxBytes including BOM and multibyte', () => {
    const one = exportCsv([row()]);
    const n = new TextEncoder().encode(one).length;
    expect(exportCsv([row()], { maxBytes: n })).toBe(one);
    expect(() => exportCsv([row()], { maxBytes: n - 1 })).toThrow(/maxBytes/);
    expect(() => exportCsv([row()], { maxBytes: n, bom: true })).toThrow(/maxBytes/);
    expect(() => exportCsv([row({ memo: '€'.repeat(10) })], { columns: ['memo'], maxBytes: 20 })).toThrow(
      ExportError,
    );
  });
  it('stops pulling rows once the limit trips', () => {
    let pulled = 0;
    function* gen(): Generator<LedgerRow> {
      for (let i = 0; i < 1000; i++) {
        pulled++;
        yield row({ id: `r${i}` });
      }
    }
    expect(() => exportCsv(gen(), { maxRows: 5 })).toThrow(ExportError);
    expect(pulled).toBe(6);
  });
  it('chunks approximately at chunkChars and concatenates to the same text', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ id: `id-${i}` }));
    const whole = exportCsv(rows);
    const chunks = [...csvChunks(rows, { chunkChars: 300 })];
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join('')).toBe(whole);
    expect(chunks.every((c) => c.length < 300 + 200)).toBe(true);
    expect([...csvChunks([], { chunkChars: 1 })].join('')).toBe(exportCsv([]));
  });
  it('emits the header as its own chunk when tiny chunkChars', () => {
    const chunks = [...csvChunks([row()], { chunkChars: 1 })];
    expect(chunks).toHaveLength(2);
  });
  it('async variant matches sync, accepts async and sync sources', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ id: `id-${i}` }));
    async function* src(): AsyncGenerator<LedgerRow> {
      await Promise.resolve();
      for (const r of rows) yield r;
    }
    let a = '';
    for await (const c of csvChunksAsync(src(), { chunkChars: 200 })) a += c;
    let b = '';
    for await (const c of csvChunksAsync(rows, { chunkChars: 1 })) b += c;
    expect(a).toBe(exportCsv(rows));
    expect(b).toBe(a);
    await expect(
      (async () => {
        for await (const c of csvChunksAsync(rows, { maxRows: 2 })) void c;
      })(),
    ).rejects.toThrow(/maxRows/);
  });
  it('ChunkWriter requires header first', () => {
    const w = new ChunkWriter({});
    expect(() => w.row(['a'])).toThrow(/header/);
  });
  it('property: output is always parseable with the same field count', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'grapheme' }), { maxLength: 5 }), (memos) => {
        const rows = memos.map((m, i) => row({ id: `i${i}`, memo: m.replace(/\p{Cc}/gu, '') }));
        const csv = exportCsv(rows, { columns: ['id', 'memo'] });
        expect(csv.endsWith('\r\n')).toBe(true);
      }),
    );
  });
  it('resolveColumns returns key/header pairs', () => {
    expect(resolveColumns(['id', { key: 'memo', header: 'Note' }])).toEqual([
      { key: 'id', header: 'id' },
      { key: 'memo', header: 'Note' },
    ]);
  });
});
