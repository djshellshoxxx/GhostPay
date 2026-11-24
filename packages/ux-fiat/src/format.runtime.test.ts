import { describe, expect, it } from 'vitest';
import { parseFiatInput } from './format.js';

describe('parseFiatInput runtime separator boundary', () => {
  const invalidFormats: readonly (readonly [string, unknown])[] = [
    ['null format', null],
    ['undefined format', undefined],
    ['numeric format', 7],
    ['string format', 'USD'],
    ['empty format object', {}],
    ['missing group separator', { decimalSeparator: '.' }],
    ['missing decimal separator', { groupSeparator: ',' }],
    ['null group separator', { groupSeparator: null, decimalSeparator: '.' }],
    ['numeric group separator', { groupSeparator: 12, decimalSeparator: '.' }],
    ['boolean decimal separator', { groupSeparator: ',', decimalSeparator: false }],
    ['array decimal separator', { groupSeparator: ',', decimalSeparator: ['.'] }],
    ['overlong group separator', { groupSeparator: 'abc', decimalSeparator: '.' }],
    ['overlong decimal separator', { groupSeparator: ',', decimalSeparator: 'abc' }],
    ['identical separators', { groupSeparator: '.', decimalSeparator: '.' }],
    ['digit separator', { groupSeparator: '1', decimalSeparator: '.' }],
  ];

  it.each(invalidFormats)('returns bad-format, without throwing, for %s', (_label, rawFormat) => {
    const parse = () => parseFiatInput('1234.56', 2, rawFormat as Parameters<typeof parseFiatInput>[2]);
    expect(parse).not.toThrow();
    expect(parse()).toMatchObject({ ok: false, error: { code: 'bad-format' } });
  });

  it('preserves exact minor-unit parsing and supported locale separators', () => {
    expect(parseFiatInput('1,234.56', 2, { groupSeparator: ',', decimalSeparator: '.' })).toEqual({
      ok: true,
      value: 123456n,
    });
    expect(parseFiatInput('1.234,56', 2, { groupSeparator: '.', decimalSeparator: ',' })).toEqual({
      ok: true,
      value: 123456n,
    });
    expect(parseFiatInput('1234.56', 2, { groupSeparator: '', decimalSeparator: '.' })).toEqual({
      ok: true,
      value: 123456n,
    });
    expect(parseFiatInput('42', 0, { groupSeparator: '', decimalSeparator: '.' })).toEqual({
      ok: true,
      value: 42n,
    });
    expect(parseFiatInput('1.234', 2, { groupSeparator: ',', decimalSeparator: '.' })).toMatchObject({
      ok: false,
      error: { code: 'excess-precision' },
    });
  });
});
