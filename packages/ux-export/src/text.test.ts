import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ExportError } from './errors.js';
import {
  cleanText,
  hasInvalidText,
  indexOfInvalidText,
  neutralizeFormula,
  quoteField,
  replaceInvalidText,
  unneutralizeFormula,
  utf8Length,
} from './text.js';

describe('neutralizeFormula', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx', "'=1", "''@x"])('guards %j', (v) => {
    expect(neutralizeFormula(v)).toBe(`'${v}`);
  });
  it.each(['', 'abc', "'abc", 'a=b', ' =x', "'", '1-2'])('leaves %j', (v) => {
    expect(neutralizeFormula(v)).toBe(v);
  });
  it('is exactly reversible', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('=', '+', '-', '@', '\t', '\r', "'", 'a', ' ', ',', '"') }),
        (s) => {
          expect(unneutralizeFormula(neutralizeFormula(s))).toBe(s);
        },
      ),
    );
  });
  it('output never starts with a trigger char', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect('=+-@\t\r'.includes(neutralizeFormula(s).charAt(0)) && neutralizeFormula(s) !== '').toBe(
          false,
        );
      }),
    );
  });
});

describe('quoteField', () => {
  it('quotes only when needed', () => {
    expect(quoteField('abc')).toBe('abc');
    expect(quoteField('a,b')).toBe('"a,b"');
    expect(quoteField('say "hi"')).toBe('"say ""hi"""');
    expect(quoteField('l1\nl2')).toBe('"l1\nl2"');
    expect(quoteField('l1\rl2')).toBe('"l1\rl2"');
    expect(quoteField('', true)).toBe('""');
  });
});

describe('utf8Length', () => {
  it('matches TextEncoder', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(
          utf8Length(
            s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD'),
          ),
        ).toBe(new TextEncoder().encode(s).length);
      }),
    );
  });
  it('counts lone surrogates as 3', () => {
    expect(utf8Length('\uD800')).toBe(3);
    expect(utf8Length('\uD800a')).toBe(4);
    expect(utf8Length('\uDC00')).toBe(3);
    expect(utf8Length('aé€\u{1F600}')).toBe(1 + 2 + 3 + 4);
  });
});

describe('invalid text', () => {
  it('detects controls and lone surrogates', () => {
    expect(hasInvalidText('ok\t\r\n')).toBe(false);
    expect(hasInvalidText('a\u0000b')).toBe(true);
    expect(hasInvalidText('a\u007F')).toBe(true);
    expect(hasInvalidText('\uD83D')).toBe(true);
    expect(hasInvalidText('\u{1F600}')).toBe(false);
    expect(indexOfInvalidText('abc')).toBe(-1);
    expect(indexOfInvalidText('ab\u0001')).toBe(2);
    expect(indexOfInvalidText('a\uD800\u0001')).toBe(1);
    expect(indexOfInvalidText('a\u0001\uD800')).toBe(1);
  });
  it('replaces or throws', () => {
    expect(replaceInvalidText('a\u0000b\uD800')).toBe('a�b�');
    expect(cleanText('fine', 'throw', 1, 1)).toBe('fine');
    expect(cleanText('a\u0000', 'replace', 1, 1)).toBe('a�');
    expect(() => cleanText('a\u0000', 'throw', 3, 2)).toThrow(ExportError);
    try {
      cleanText('a\u0000', 'throw', 3, 2);
    } catch (e) {
      expect((e as ExportError).code).toBe('INVALID_TEXT');
      expect((e as ExportError).row).toBe(3);
      expect((e as ExportError).column).toBe(2);
      expect((e as ExportError).message).not.toContain('a\u0000');
    }
  });
});
