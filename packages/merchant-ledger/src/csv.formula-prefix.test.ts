import { describe, expect, it } from 'vitest';
import { quoteCell, sanitizeText, textCell } from './csv.js';

describe('CSV formula-prefix normalization', () => {
  it('protects formula-like text after mixed leading whitespace or a BOM', () => {
    const inputs = [
      ' \t=HYPERLINK("https://example.test")',
      '\n=1+1',
      '\uFEFF=2+2',
      '  \r@SUM(A1:A2)',
      ' \tplain',
    ];
    for (const input of inputs) {
      expect(sanitizeText(input)).toBe(`'${input}`);
      expect(textCell(input)).toBe(quoteCell(`'${input}`));
    }
  });

  it('protects every operator after supported leading whitespace combinations', () => {
    for (const prefix of ['', ' ', '\t', '\r', '\n', '\uFEFF', ' \t', '\t ', ' \n ', '\uFEFF \r ']) {
      for (const operator of ['=', '+', '-', '@']) {
        const input = `${prefix}${operator}1`;
        expect(sanitizeText(input), JSON.stringify(input)).toBe(`'${input}`);
      }
    }
  });

  it('preserves benign text and previously defended inputs', () => {
    for (const input of ['plain', '  plain', 'name=value', 'alpha\tbeta', '\uFEFFplain']) {
      expect(sanitizeText(input)).toBe(input);
    }
    for (const input of ['=1+1', ' +1', '-1', '@SUM(1)', '\tplain', '\rplain']) {
      expect(sanitizeText(input)).toBe(`'${input}`);
    }
    expect(textCell(' ordinary, user')).toBe('" ordinary, user"');
  });
});
