import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ExportError } from './errors.js';
import { assertRectangular, parseCsv } from './parser.js';
import { quoteField } from './text.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof ExportError ? e.code : 'OTHER';
  }
  return undefined;
};

describe('parseCsv accepts', () => {
  it('basic shapes', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('﻿')).toEqual([]);
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('﻿a\n')).toEqual([['a']]);
    expect(parseCsv('a,\n,b')).toEqual([['a', ''], ['', 'b']]);
    expect(parseCsv('a,')).toEqual([['a', '']]);
  });
  it('quoted fields', () => {
    expect(parseCsv('"a,b","say ""hi""","l1\r\nl2","l3\nl4"\r\n')).toEqual([['a,b', 'say "hi"', 'l1\r\nl2', 'l3\nl4']]);
    expect(parseCsv('""\r\n""\r\n')).toEqual([[''], ['']]);
    expect(parseCsv('"a"\r\n')).toEqual([['a']]);
  });
});

describe('parseCsv rejects', () => {
  it.each([
    ['unterminated', '"abc', 'PARSE_SYNTAX'],
    ['quote in unquoted', 'ab"c', 'PARSE_SYNTAX'],
    ['text after quote', '"a"b', 'PARSE_SYNTAX'],
    ['bare CR', 'a\rb', 'PARSE_SYNTAX'],
    ['bare CR after quote', '"a"\rb', 'PARSE_SYNTAX'],
    ['blank line mid', 'a\n\nb', 'PARSE_SYNTAX'],
    ['blank line leading', '\na', 'PARSE_SYNTAX'],
    ['double trailing newline', 'a\n\n', 'PARSE_SYNTAX'],
    ['NUL', 'a\u0000', 'PARSE_SYNTAX'],
    ['lone surrogate', 'a\uD800', 'PARSE_SYNTAX'],
    ['escape ctrl', '\u001B[31m', 'PARSE_SYNTAX'],
  ])('%s', (_n, input, c) => {
    expect(code(() => parseCsv(input))).toBe(c);
  });
  it('reports positions without echoing content', () => {
    try {
      parseCsv('a,b\nc,"d"x');
      expect.unreachable();
    } catch (e) {
      const err = e as ExportError;
      expect(err.row).toBe(2);
      expect(err.column).toBe(2);
      expect(code(() => parseCsv('a\rb'))).toBe('PARSE_SYNTAX');
      expect(err.message).not.toContain('x"');
    }
  });
  it('only a BOM at the very start is skipped', () => {
    expect(parseCsv('a﻿')).toEqual([['a﻿']]);
  });
});

describe('limits', () => {
  it('bytes', () => {
    expect(code(() => parseCsv('abcd', { maxBytes: 3 }))).toBe('LIMIT_BYTES');
    expect(code(() => parseCsv('€€', { maxBytes: 5 }))).toBe('LIMIT_BYTES');
    expect(parseCsv('€', { maxBytes: 3 })).toEqual([['€']]);
  });
  it('rows', () => {
    expect(parseCsv('a\nb', { maxRows: 2 })).toHaveLength(2);
    expect(code(() => parseCsv('a\nb\nc', { maxRows: 2 }))).toBe('LIMIT_ROWS');
  });
  it('fields', () => {
    expect(parseCsv('a,b', { maxFields: 2 })).toEqual([['a', 'b']]);
    expect(code(() => parseCsv('a,b,c', { maxFields: 2 }))).toBe('LIMIT_FIELDS');
    expect(code(() => parseCsv(','.repeat(100)))).toBe('LIMIT_FIELDS');
  });
  it('field length, quoted and unquoted', () => {
    expect(code(() => parseCsv('abcd', { maxFieldChars: 3 }))).toBe('LIMIT_FIELD_LENGTH');
    expect(code(() => parseCsv('"abcd"', { maxFieldChars: 3 }))).toBe('LIMIT_FIELD_LENGTH');
    expect(code(() => parseCsv('"ab""cd"', { maxFieldChars: 4 }))).toBe('LIMIT_FIELD_LENGTH');
    expect(parseCsv('"abc"', { maxFieldChars: 3 })).toEqual([['abc']]);
  });
  it('option validation', () => {
    for (const o of [{ maxBytes: 0 }, { maxRows: 1.5 }, { maxFields: -1 }, { maxFieldChars: NaN }]) {
      expect(code(() => parseCsv('a', o))).toBe('INVALID_OPTION');
    }
  });
  it('hostile quote-heavy input stays fast', () => {
    const t0 = Date.now();
    expect(code(() => parseCsv('"' + '""'.repeat(200_000) + 'x', { maxFieldChars: 1_000_000 }))).toBe('PARSE_SYNTAX');
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('assertRectangular', () => {
  it('detects ragged rows', () => {
    expect(() => assertRectangular([['a', 'b'], ['c']])).toThrow(/field count/);
    expect(() => assertRectangular([['a'], ['b']])).not.toThrow();
    expect(() => assertRectangular([])).not.toThrow();
  });
});

describe('round trip property', () => {
  it('parse(encode(x)) === x for arbitrary valid text', () => {
    const text = fc.string({ unit: fc.constantFrom('a', 'b', ',', '"', '\n', '\r', ' ', "'", '=', 'é', '\u{1F600}') });
    fc.assert(
      fc.property(fc.array(fc.array(text, { minLength: 2, maxLength: 4 }), { minLength: 1, maxLength: 5 }), (rows0) => {
        const w = rows0[0]?.length ?? 0;
        const rows = rows0.map((r) => r.slice(0, 2).concat(Array(Math.max(0, w - 2)).fill('')).slice(0, 2));
        const csv = rows.map((r) => r.map((f) => quoteField(f)).join(',')).join('\r\n') + '\r\n';
        expect(parseCsv(csv)).toEqual(rows);
      }),
    );
  });
});
