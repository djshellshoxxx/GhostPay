import { describe, expect, it } from 'vitest';
import { parseCsv } from './parser.js';
import { quoteField } from './text.js';

describe('CSV leading BOM data preservation', () => {
  it.each(['\uFEFFAmount', '\uFEFF', '\uFEFF\uFEFF'])('preserves %j as the first field without a file BOM', (value) => {
    expect(parseCsv(quoteField(value) + ',id\r\n')).toEqual([[value, 'id']]);
  });

  it('preserves a literal BOM with an explicit file BOM', () => {
    const value = '\uFEFFAmount';
    expect(parseCsv('\uFEFF' + quoteField(value) + ',id\r\n')).toEqual([[value, 'id']]);
  });

  it.each(['Amount', 'A\uFEFFB', 'A,B', 'A"B'])('preserves neighboring case %j', (value) => {
    expect(parseCsv(quoteField(value) + ',id\r\n')).toEqual([[value, 'id']]);
  });
});
