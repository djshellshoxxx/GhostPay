import { describe, expect, it } from 'vitest';
import { exportCsv } from './encoder.js';
import { ExportError } from './errors.js';
import { resolveColumns, type ColumnSpec } from './types.js';

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof ExportError ? e.code : 'NATIVE_ERROR';
  }
  return undefined;
};

describe('runtime column configuration', () => {
  it('rejects missing sparse slots rather than silently emitting empty CSV columns', () => {
    const columns = new Array<ColumnSpec>(3);
    columns[0] = 'id';
    columns[2] = 'amount';
    expect(errorCode(() => resolveColumns(columns))).toBe('INVALID_OPTION');
    expect(errorCode(() => exportCsv([], { columns }))).toBe('INVALID_OPTION');
  });

  it('returns INVALID_OPTION for malformed descriptors instead of native exceptions', () => {
    for (const bad of [
      null,
      undefined,
      123,
      {},
      { key: 'id' },
      { key: 'id', header: null },
      { key: 'id', header: 123 },
    ]) {
      expect(errorCode(() => resolveColumns([bad as ColumnSpec]))).toBe('INVALID_OPTION');
    }
  });

  it('rejects non-array column collections with the same typed error', () => {
    expect(errorCode(() => resolveColumns(null as unknown as ColumnSpec[]))).toBe('INVALID_OPTION');
    expect(errorCode(() => resolveColumns({ length: 2, 0: 'id', 1: 'amount' } as unknown as ColumnSpec[]))).toBe('INVALID_OPTION');
  });

  it('preserves valid dense column selection, order, and custom headers', () => {
    expect(resolveColumns(['id', { key: 'memo', header: 'Memo' }, 'amount'])).toEqual([
      { key: 'id', header: 'id' },
      { key: 'memo', header: 'Memo' },
      { key: 'amount', header: 'amount' },
    ]);
    expect(exportCsv([], { columns: ['id', 'amount'] })).toBe('id,amount\r\n');
  });
});
