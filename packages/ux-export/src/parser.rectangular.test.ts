import { describe, expect, it } from 'vitest';
import { ExportError } from './errors.js';
import { parseCsv } from './parser.js';

describe('strict CSV rectangularity', () => {
  it.each([
    ['a,b\nc', 2],
    ['a\r\nb,c\r\n', 2],
    ['a,b\nc,d\ne,f,g', 3],
    ['a,b\n"c,d"', 2],
  ] as const)('rejects ragged records in %j', (csv, row) => {
    let error: unknown;
    try {
      parseCsv(csv);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ExportError);
    expect(error).toMatchObject({ code: 'PARSE_RAGGED', row });
  });

  it('preserves rectangular, empty and quoted-empty records', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
    expect(parseCsv('""\r\n""\r\n')).toEqual([[''], ['']]);
    expect(parseCsv('a,\n,b')).toEqual([['a', ''], ['', 'b']]);
  });
});
