import { describe, expect, it } from 'vitest';
import { I18nError } from './errors.js';
import { escapeHtml, formatMessage, pluralCategoriesFor } from './format.js';
import { argumentNames, parseMessage } from './parse.js';

const P = '{n, plural, =0{none} one{# item} other{# items}}';

describe('plural', () => {
  it('selects categories and exact matches', () => {
    expect(formatMessage(P, 'en', { n: 1 })).toBe('1 item');
    expect(formatMessage(P, 'en', { n: 0 })).toBe('none');
    expect(formatMessage(P, 'en', { n: 2 })).toBe('2 items');
    expect(formatMessage(P, 'en', { n: -1 })).toBe('-1 item');
    expect(formatMessage(P, 'en', { n: -0 })).toBe('none');
    expect(formatMessage(P, 'en', { n: 1.5 })).toBe('1.5 items');
  });
  it('supports bigint including huge values', () => {
    expect(formatMessage(P, 'en', { n: 1n })).toBe('1 item');
    expect(formatMessage(P, 'en', { n: 123456789012345678901n })).toBe('123456789012345678901 items');
    expect(formatMessage(P, 'en', { n: -(10n ** 30n) })).toBe(`-1${'0'.repeat(30)} items`);
    expect(formatMessage(P, 'en', { n: 10n ** 30n + 1n })).toBe(`1${'0'.repeat(29)}1 items`);
  });
  it('uses locale rules (fr: 0 and 1 are one; ru: few; ar: zero)', () => {
    const m = '{n, plural, zero{Z} one{O} two{T} few{F} many{M} other{X}}';
    expect(formatMessage(m, 'fr', { n: 0 })).toBe('O');
    expect(formatMessage(m, 'ru', { n: 3 })).toBe('F');
    expect(formatMessage(m, 'ru', { n: 5 })).toBe('M');
    expect(formatMessage(m, 'ar', { n: 0 })).toBe('Z');
    expect(formatMessage(m, 'ar', { n: 2 })).toBe('T');
  });
  it('falls back to other when the category branch is absent and for bad locales', () => {
    expect(formatMessage('{n, plural, other{# x}}', 'en', { n: 1 })).toBe('1 x');
    expect(formatMessage(P, 'not a locale', { n: 1 })).toBe('1 item');
    expect(pluralCategoriesFor('de')).toEqual(['one', 'other']);
  });
  it('rejects bad plural arguments', () => {
    expect(() => formatMessage(P, 'en', { n: 'abc' })).toThrow(/number or bigint/);
    expect(() => formatMessage(P, 'en', { n: Infinity })).toThrow(/finite/);
    expect(() => formatMessage(P, 'en', { n: NaN })).toThrow(I18nError);
  });
  it('nests placeholders and plurals', () => {
    const m = '{a, plural, one{{name} has # of {b, plural, one{# pet} other{# pets}}} other{many}}';
    expect(formatMessage(m, 'en', { a: 1, name: 'Ann', b: 3 })).toBe('Ann has 1 of 3 pets');
  });
  it('# outside plural is literal', () => {
    expect(formatMessage('Item #5', 'en')).toBe('Item #5');
  });
});

describe('placeholders and injection', () => {
  it('substitutes strings, numbers, bigints', () => {
    expect(formatMessage('{a}-{b}-{c}', 'en', { a: 'x', b: 2, c: 3n })).toBe('x-2-3');
    expect(formatMessage('{a}', 'en', { a: NaN })).toBe('');
  });
  it('never re-parses values', () => {
    expect(formatMessage('{a}', 'en', { a: '{b} {n, plural, other{x}}' })).toBe('{b} {n, plural, other{x}}');
  });
  it('html-escapes values on request, not template', () => {
    expect(formatMessage('<b>{a}</b>', 'en', { a: `<img src=x onerror="a('b')">&` }, { escape: 'html' })).toBe(
      '<b>&#60;img src=x onerror=&#34;a(&#39;b&#39;)&#34;&#62;&#38;</b>',
    );
    expect(escapeHtml('`')).toBe('&#96;');
  });
  it('strips control and bidi override characters', () => {
    expect(formatMessage('{a}', 'en', { a: 'ab‮cd\u0000ef⁦g‎h\u009fi\n' })).toBe('abcdefghi');
  });
  it('isolates in RTL locales and when forced', () => {
    expect(formatMessage('x {a}', 'ar', { a: '0xabc' })).toBe('x ⁨0xabc⁩');
    expect(formatMessage('x {a}', 'ar', { a: '1' }, { isolate: 'never' })).toBe('x 1');
    expect(formatMessage('x {a}', 'en', { a: 'q' }, { isolate: 'always' })).toBe('x ⁨q⁩');
    expect(formatMessage('{a}', 'ar', { a: 5 })).toBe('5');
  });
  it('rejects object arguments and ignores inherited properties', () => {
    expect(() => formatMessage('{a}', 'en', { a: { toString: () => 'x' } as unknown as string })).toThrow(/must be string/);
    expect(formatMessage('{toString}', 'en', {})).toBe('{toString}');
    expect(formatMessage('{constructor}', 'en', {})).toBe('{constructor}');
    const hostile = JSON.parse('{"__proto__": {"a": "pwn"}}') as Record<string, string>;
    expect(formatMessage('{a}', 'en', hostile)).toBe('{a}');
  });
  it('reports or throws on missing args', () => {
    const miss: string[] = [];
    expect(formatMessage('{a} {n, plural, other{x}}', 'en', {}, { onMissingArg: (n) => miss.push(n) })).toBe('{a} {n}');
    expect(miss).toEqual(['a', 'n']);
    expect(formatMessage('{a}', 'en')).toBe('{a}');
    expect(() => formatMessage('{a}', 'en', {}, { strict: true })).toThrow(/missing argument/);
    expect(() => formatMessage('{n, plural, other{x}}', 'en', {}, { strict: true })).toThrow(/missing argument/);
  });
  it('caps output length', () => {
    expect(() => formatMessage('{a}{a}{a}', 'en', { a: 'x'.repeat(9000) })).toThrow(/too long/);
  });
});

describe('quoting', () => {
  it.each([
    ["it''s", "it's"],
    ["It's fine", "It's fine"],
    ["'{'x'}'", '{x}'],
    ["a '{b''c' d", "a {b'c d"],
    ["'}' ", '} '],
    ["'{unterminated", '{unterminated'],
    ["'#' stays", "'#' stays"],
  ])('%s', (src, out) => {
    expect(formatMessage(src, 'en')).toBe(out);
  });
  it('quotes # inside plural', () => {
    expect(formatMessage("{n, plural, other{'#' is # }}", 'en', { n: 4 })).toBe('# is 4 ');
  });
});

describe('parser errors', () => {
  const code = (m: string): string => {
    try {
      parseMessage(m);
    } catch (e) {
      return (e as I18nError).code;
    }
    return 'ok';
  };
  it('classifies', () => {
    expect(code('{')).toBe('syntax');
    expect(code('}')).toBe('syntax');
    expect(code('{a')).toBe('syntax');
    expect(code('{1a}')).toBe('syntax');
    expect(code('{}')).toBe('syntax');
    expect(code('{a b}')).toBe('syntax');
    expect(code('{a,}')).toBe('unsupported_type');
    expect(code('{a, select, other{x}}')).toBe('unsupported_type');
    expect(code('{a, number}')).toBe('unsupported_type');
    expect(code('{a, plural, one{x}}')).toBe('syntax');
    expect(code('{a, plural, other{x}')).toBe('syntax');
    expect(code('{a, plural, other{x} other{y}}')).toBe('syntax');
    expect(code('{a, plural, =1{x} =1{y} other{z}}')).toBe('syntax');
    expect(code('{a, plural, =x{x} other{z}}')).toBe('syntax');
    expect(code('{a, plural, =1234567890{x} other{z}}')).toBe('syntax');
    expect(code('{a, plural, few2{x} other{z}}')).toBe('syntax');
    expect(code('{a, plural, other{x}')).toBe('syntax');
    expect(code('{a, plural, other x}')).toBe('syntax');
    expect(code('{a, plural, ')).toBe('syntax');
    expect(code(`{${'a'.repeat(65)}}`)).toBe('syntax');
    expect(code(5 as unknown as string)).toBe('syntax');
    expect(code('x'.repeat(4001))).toBe('too_long');
    expect(code('{a}'.repeat(600))).toBe('too_complex');
  });
  it('limits nesting depth', () => {
    const nest = (d: number): string => (d === 0 ? 'x' : `{n, plural, other{${nest(d - 1)}}}`);
    expect(code(nest(4))).toBe('ok');
    expect(code(nest(5))).toBe('too_deep');
    expect(code(nest(40))).toBe('too_deep');
  });
  it('lists argument names', () => {
    expect(argumentNames(parseMessage('{b} {n, plural, one{{a}} other{#}}'))).toEqual(['a', 'b', 'n']);
  });
  it('whitespace is flexible', () => {
    expect(formatMessage('{ n , plural ,\n one { # x } other { # xs } }', 'en', { n: 1 })).toBe(' 1 x ');
  });
});
