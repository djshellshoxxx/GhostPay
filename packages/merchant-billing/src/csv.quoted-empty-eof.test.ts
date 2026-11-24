import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('quoted empty final CSV records', () => {
  it('rejects a final quoted empty row without a trailing newline instead of discarding it', () => {
    expect(() => parseCsv('name\n""')).toThrow('blank line');
    expect(() => parseCsv('name\r\n""')).toThrow('blank line');
  });

  it('classifies a lone explicitly quoted empty field as a blank row', () => {
    expect(() => parseCsv('""')).toThrow('blank line');
  });

  it('preserves the existing rejection when the last empty row has a newline', () => {
    expect(() => parseCsv('name\n""\n')).toThrow('blank line');
    expect(() => parseCsv('name\r\n""\r\n')).toThrow('blank line');
  });

  it('preserves legitimate empty quoted values in multicolumn rows', () => {
    expect(parseCsv('id,label\n1,""')).toEqual([['id', 'label'], ['1', '']]);
    expect(parseCsv('id,label\r\n1,""\r\n')).toEqual([['id', 'label'], ['1', '']]);
  });

  it('preserves quoted nonempty last fields and existing one-column records', () => {
    expect(parseCsv('name\n"Alice"')).toEqual([['name'], ['Alice']]);
    expect(parseCsv('name\nAlice')).toEqual([['name'], ['Alice']]);
    expect(parseCsv('name\n')).toEqual([['name']]);
  });

  it('still rejects malformed quoted cells that are not empty', () => {
    expect(() => parseCsv('name\n"unterminated')).toThrow('unterminated quote');
    expect(() => parseCsv('name\n"valid"x')).toThrow('text after quote');
  });
});
