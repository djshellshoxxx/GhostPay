import { describe, expect, it } from 'vitest';
import { assertNoFormula, BillingError, csvEscapeCell, DEFAULT_CSV_LIMITS, parseCsv } from './index.js';

describe('parseCsv', () => {
  it('parses LF, CRLF, trailing newline, BOM, quotes', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('﻿a,b\n"x,y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x,y', 'he said "hi"']]);
    expect(parseCsv('a,b\n,\n')).toEqual([['a', 'b'], ['', '']]);
    expect(parseCsv('"a"\n"b"')).toEqual([['a'], ['b']]);
  });
  it.each([
    ['empty', ''],
    ['blank line', 'a\n\nb'],
    ['ragged', 'a,b\n1'],
    ['stray quote', 'a,b"c'],
    ['unterminated', 'a,"b'],
    ['text after quote', '"a"x,b'],
    ['newline in quoted field', 'a\n"b\nc"'],
    ['lone CR', 'a\rb'],
    ['NUL', 'a\u0000b'],
    ['tab', 'a\tb'],
    ['C1 control', 'a\u0085b'],
    ['bidi override', 'a‮b'],
    ['zero width space', 'a​b'],
    ['inner BOM', 'a,﻿b'],
  ])('rejects %s', (_n, s) => {
    expect(() => parseCsv(s)).toThrow(BillingError);
  });
  it('enforces size, row, field limits', () => {
    expect(() => parseCsv('a'.repeat(11), { ...DEFAULT_CSV_LIMITS, maxBytes: 10 })).toThrow(/too large/);
    expect(() => parseCsv('é'.repeat(6), { ...DEFAULT_CSV_LIMITS, maxBytes: 10 })).toThrow(/too large/);
    expect(() => parseCsv('a\nb\nc', { ...DEFAULT_CSV_LIMITS, maxRows: 2 })).toThrow(/too many rows/);
    expect(parseCsv('a\nb', { ...DEFAULT_CSV_LIMITS, maxRows: 2 })).toHaveLength(2);
    expect(() => parseCsv('a,' + 'x'.repeat(201))).toThrow(/field too long/);
    expect(() => parseCsv(5 as never)).toThrow(BillingError);
  });
  it('errors report row only, not content', () => {
    try {
      parseCsv('a,b\nSECRET');
    } catch (e) {
      expect((e as BillingError).where).toBe('row 2');
      expect((e as Error).message).not.toContain('SECRET');
    }
  });
});

describe('formula guard', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', '  =cmd|calc', '=HYPERLINK("http://x")'])('rejects %j', (c) => {
    expect(() => assertNoFormula(c, 'row 2')).toThrow(BillingError);
  });
  it.each(['Alice', 'a=b', 'x-y', '', '1+1'])('allows %j', (c) => expect(() => assertNoFormula(c, 'r')).not.toThrow());
  it('csvEscapeCell neutralizes and quotes', () => {
    expect(csvEscapeCell('=1+1')).toBe("'=1+1");
    expect(csvEscapeCell('  @x')).toBe("'  @x");
    expect(csvEscapeCell('a,b')).toBe('"a,b"');
    expect(csvEscapeCell('say "x"')).toBe('"say ""x"""');
    expect(csvEscapeCell('plain')).toBe('plain');
    expect(csvEscapeCell('=a,b')).toBe(`"'=a,b"`);
  });
});
