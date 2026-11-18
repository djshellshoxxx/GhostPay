import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  I18nError,
  escapeHtml,
  formatMessage,
  messageParamNames,
  parseMessage,
  renderMessage,
  sanitizeValue,
  defaultIntl,
} from './index.js';

const en = { locale: 'en' };
const text = { locale: 'en', escape: 'text' as const };

describe('parseMessage', () => {
  it('parses text and args', () => {
    expect(parseMessage('Hi {name}!')).toEqual([
      { t: 'text', v: 'Hi ' },
      { t: 'arg', name: 'name' },
      { t: 'text', v: '!' },
    ]);
    expect(parseMessage('')).toEqual([]);
  });
  it('handles apostrophe quoting', () => {
    expect(formatMessage("It''s '{'literal'}' don't", {}, en)).toBe("It's {literal} don't");
    expect(formatMessage("'{a''b}", {}, en)).toBe("{a'b}");
    expect(formatMessage("'{unterminated", {}, en)).toBe('{unterminated');
  });
  it('lists param names', () => {
    const n = parseMessage('{a} {n, plural, one {# {b}} other {# x}} {s, select, x {{c}} other {}}');
    expect(messageParamNames(n)).toEqual(['a', 'b', 'c', 'n', 's']);
  });
  it.each([
    ['{', 'unterminated'],
    ['}', 'unmatched'],
    ['{1a}', 'bad name'],
    ['{a b}', 'bad name'],
    ['{a, number}', 'type'],
    ['{a, plural other {x}}', 'comma'],
    ['{a, plural, one {x}}', 'other'],
    ['{a, plural, other {x} other {y}}', 'dup'],
    ['{a, plural, weird {x} other {y}}', 'selector'],
    ['{a, select, o^ther {x} other {y}}', 'selector'],
    ['{a, plural, other x}', 'brace'],
    ['{a, plural, other {x}', 'unterminated'],
    ['{a, plural, other {x', 'unterminated case'],
    ['{a, plural,', 'eof'],
    ['{a, select, other {x} ', 'eof2'],
  ])('rejects %j', (src) => {
    expect(() => parseMessage(src)).toThrow(I18nError);
  });
  it('rejects too long and too deep', () => {
    expect(() => parseMessage('a'.repeat(2001))).toThrowError(/too long/);
    const deep = '{a, select, x {'.repeat(6) + 'z' + '} other {}}'.repeat(6);
    expect(() => parseMessage(deep)).toThrowError(/deeply/);
    expect(() => parseMessage(5 as unknown as string)).toThrow(I18nError);
  });
  it('never throws a non-I18nError on random input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        try {
          parseMessage(s);
        } catch (e) {
          return e instanceof I18nError;
        }
        return true;
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('{', '}', "'", '#', ',', ' ', 'a', 'plural', 'select', 'other', 'one', '=0'),
          { maxLength: 40 },
        ),
        (parts) => {
          try {
            parseMessage(parts.join(''));
          } catch (e) {
            return e instanceof I18nError;
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('render: plural', () => {
  const tpl = '{n, plural, =0 {No items} one {# item} other {# items}}';
  it('selects exact then category', () => {
    expect(formatMessage(tpl, { n: 0 }, en)).toBe('No items');
    expect(formatMessage(tpl, { n: 1 }, en)).toBe('1 item');
    expect(formatMessage(tpl, { n: 2 }, en)).toBe('2 items');
    expect(formatMessage(tpl, { n: 1234567 }, en)).toBe('1,234,567 items');
    expect(formatMessage(tpl, { n: 5n }, en)).toBe('5 items');
  });
  it('uses locale plural rules (Arabic few/many, Russian)', () => {
    const ar = '{n, plural, zero {z} one {o} two {t} few {f} many {m} other {x}}';
    expect(formatMessage(ar, { n: 0 }, { locale: 'ar' })).toBe('z');
    expect(formatMessage(ar, { n: 2 }, { locale: 'ar' })).toBe('t');
    expect(formatMessage(ar, { n: 3 }, { locale: 'ar' })).toBe('f');
    expect(formatMessage(ar, { n: 11 }, { locale: 'ar' })).toBe('m');
    const ru = '{n, plural, one {o} few {f} many {m} other {x}}';
    expect(formatMessage(ru, { n: 21 }, { locale: 'ru' })).toBe('o');
    expect(formatMessage(ru, { n: 22 }, { locale: 'ru' })).toBe('f');
    expect(formatMessage(ru, { n: 5 }, { locale: 'ru' })).toBe('m');
  });
  it('falls back to other when category case is absent', () => {
    expect(formatMessage('{n, plural, one {o} other {x}}', { n: 3 }, { locale: 'ar' })).toBe('x');
  });
  it('localises the # number', () => {
    expect(formatMessage('{n, plural, other {#}}', { n: 1234.5 }, { locale: 'de' })).toBe('1.234,5');
  });
  it('rejects string for plural', () => {
    expect(() => formatMessage(tpl, { n: '2' }, en)).toThrowError(/plural needs number/);
  });
  it('pound outside plural body is literal #', () => {
    expect(formatMessage('# {a}', { a: 'x' }, en)).toBe('# x');
  });
  it('pound survives select nested in plural', () => {
    expect(
      formatMessage('{n, plural, other {{g, select, m {# he} other {# they}}}}', { n: 3, g: 'm' }, en),
    ).toBe('3 he');
  });
});

describe('render: select, args, errors', () => {
  it('select picks case or other (own keys only)', () => {
    const tpl = '{k, select, a {A} other {O}}';
    expect(formatMessage(tpl, { k: 'a' }, en)).toBe('A');
    expect(formatMessage(tpl, { k: 'zzz' }, en)).toBe('O');
    expect(formatMessage(tpl, { k: '__proto__' }, en)).toBe('O');
    expect(formatMessage(tpl, { k: 3 }, en)).toBe('O');
  });
  it('formats numeric args by locale', () => {
    expect(formatMessage('{n}', { n: 1234.5 }, { locale: 'de' })).toBe('1.234,5');
    expect(formatMessage('{n}', { n: 12345678901234567890n }, en)).toBe('12,345,678,901,234,567,890');
  });
  it('missing and non-finite params throw', () => {
    expect(() => formatMessage('{a}', {}, en)).toThrowError(/missing parameter/);
    expect(() => formatMessage('{a}', { a: NaN }, en)).toThrow(I18nError);
    expect(() => formatMessage('{a}', { a: Infinity }, en)).toThrow(I18nError);
    expect(() => formatMessage('{a}', { a: {} as unknown as string }, en)).toThrow(I18nError);
    expect(() => formatMessage('{toString}', {}, en)).toThrowError(/missing/);
  });
  it('falls back to en for invalid locale or Intl failure', () => {
    expect(formatMessage('{n}', { n: 1000 }, { locale: '!!bad' })).toBe('1,000');
    const flaky = {
      ...defaultIntl,
      NumberFormat: class extends Intl.NumberFormat {
        public constructor(l?: string | string[], o?: Intl.NumberFormatOptions) {
          if (l === 'de') throw new RangeError('x');
          super(l, o);
        }
      } as typeof Intl.NumberFormat,
      PluralRules: class extends Intl.PluralRules {
        public constructor(l?: string | string[], o?: Intl.PluralRulesOptions) {
          if (l === 'de') throw new RangeError('x');
          super(l, o);
        }
      } as typeof Intl.PluralRules,
    };
    expect(formatMessage('{n}', { n: 1000 }, { locale: 'de', intl: flaky })).toBe('1,000');
    expect(formatMessage('{n, plural, one {o} other {x}}', { n: 1 }, { locale: 'de', intl: flaky })).toBe(
      'o',
    );
  });
});

describe('escaping and sanitising (no HTML injection)', () => {
  const payload = '<img src=x onerror=alert(1)>"\'`&';
  it('escapes values by default, not the template', () => {
    const out = formatMessage('<b>{v}</b>', { v: payload }, en);
    expect(out).toBe('<b>&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&#96;&amp;</b>');
    expect(out).not.toMatch(/<img/);
  });
  it('text mode leaves value characters but still sanitises', () => {
    expect(formatMessage('{v}', { v: '<a>' }, text)).toBe('<a>');
  });
  it('strips bidi overrides, zero-width and control characters', () => {
    expect(sanitizeValue('ab‮cd​e\u0000f\u0007⁦g﻿')).toBe('abcdefg');
    expect(formatMessage('{a}', { a: '0x12‮34' }, text)).toBe('0x1234');
  });
  it('caps value length', () => {
    expect(sanitizeValue('a'.repeat(5000))).toHaveLength(1000);
  });
  it('value text containing template syntax is not re-interpreted', () => {
    expect(formatMessage('{a}', { a: '{b} {c, plural, other {x}}' }, text)).toBe(
      '{b} {c, plural, other {x}}',
    );
  });
  it('escapeHtml property: no raw specials survive', () => {
    fc.assert(fc.property(fc.string(), (s) => !/[<>"'`]/.test(escapeHtml(s))));
  });
  it('property: html-mode output of a single arg never contains < or >', () => {
    fc.assert(fc.property(fc.string(), (s) => !/[<>]/.test(formatMessage('{v}', { v: s }, en))));
  });
  it('renderMessage works with prebuilt nodes', () => {
    expect(renderMessage(parseMessage('x{a}'), { a: 1 }, en)).toBe('x1');
  });
});
