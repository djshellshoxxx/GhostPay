import { describe, expect, it } from 'vitest';
import {
  analyzeMessage,
  formatToParts,
  MessageSyntaxError,
  parseMessage,
  partsToString,
  pseudolocalize,
  stringifyMessage,
  type FormatIssue,
  type MessageValues,
} from './message';

function fmt(src: string, values: MessageValues = {}, locale = 'en', issues?: FormatIssue[]): string {
  return partsToString(formatToParts(parseMessage(src), values, { locale, onIssue: (i) => issues?.push(i) }));
}

const PLURAL = (one: string, other: string): string => `{n, plural, one {${one}} other {${other}}}`;

describe('plurals use Intl.PluralRules for the active locale', () => {
  it('english: one / other and exact matches', () => {
    const m = '{n, plural, =0 {none} one {# item} other {# items}}';
    expect(fmt(m, { n: 0 })).toBe('none');
    expect(fmt(m, { n: 1 })).toBe('1 item');
    expect(fmt(m, { n: 2 })).toBe('2 items');
    expect(fmt(m, { n: 1234 })).toBe('1,234 items');
  });

  it('russian: one / few / many / other', () => {
    const m = '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла (дробное)}}';
    const cases: [number, string][] = [
      [1, '1 файл'], [21, '21 файл'], [101, '101 файл'],
      [2, '2 файла'], [3, '3 файла'], [4, '4 файла'], [22, '22 файла'],
      [0, '0 файлов'], [5, '5 файлов'], [11, '11 файлов'], [12, '12 файлов'], [14, '14 файлов'], [25, '25 файлов'], [100, '100 файлов'],
      [1.5, '1,5 файла (дробное)'],
    ];
    for (const [n, out] of cases) expect(fmt(m, { n }, 'ru').replace(/ /g, ' ')).toBe(out);
  });

  it('polish: one / few / many / other', () => {
    const m = '{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}';
    expect(fmt(m, { n: 1 }, 'pl')).toBe('1 plik');
    expect(fmt(m, { n: 2 }, 'pl')).toBe('2 pliki');
    expect(fmt(m, { n: 4 }, 'pl')).toBe('4 pliki');
    expect(fmt(m, { n: 5 }, 'pl')).toBe('5 plików');
    expect(fmt(m, { n: 12 }, 'pl')).toBe('12 plików');
    expect(fmt(m, { n: 22 }, 'pl')).toBe('22 pliki');
    expect(fmt(m, { n: 1.5 }, 'pl')).toBe('1,5 pliku');
  });

  it('arabic: all six categories, with native digits only where the locale uses them', () => {
    const m = '{n, plural, zero {Z} one {O} two {T} few {F} many {M} other {X}}';
    const picked = (n: number): string => fmt(m, { n }, 'ar');
    expect(picked(0)).toBe('Z');
    expect(picked(1)).toBe('O');
    expect(picked(2)).toBe('T');
    expect(picked(3)).toBe('F');
    expect(picked(10)).toBe('F');
    expect(picked(11)).toBe('M');
    expect(picked(99)).toBe('M');
    expect(picked(100)).toBe('X');
    expect(picked(102)).toBe('X');
    expect(picked(103)).toBe('F');
  });

  it('japanese has only "other"; offset and ordinal plurals work', () => {
    expect(fmt('{n, plural, other {# 件}}', { n: 1 }, 'ja')).toBe('1 件');
    expect(fmt('{n, plural, offset:1 =0 {nobody} =1 {just you} one {you and # other} other {you and # others}}', { n: 3 })).toBe('you and 2 others');
    expect(fmt('{n, plural, offset:1 =0 {nobody} =1 {just you} one {you and # other} other {you and # others}}', { n: 2 })).toBe('you and 1 other');
    const ord = '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';
    expect([1, 2, 3, 4, 11, 21, 22, 23].map((n) => fmt(ord, { n }))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '21st', '22nd', '23rd']);
  });

  it('falls back to "other" when the locale category has no branch, and accepts bigint', () => {
    expect(fmt('{n, plural, other {x#}}', { n: 1n })).toBe('x1');
    expect(fmt(PLURAL('a', 'b'), { n: 5 })).toBe('b');
  });
});

describe('number, date and select formatting follow the locale', () => {
  it('formats numbers and styles', () => {
    expect(fmt('{n, number}', { n: 1234567.5 })).toBe('1,234,567.5');
    expect(fmt('{n, number}', { n: 1234567.5 }, 'de')).toBe('1.234.567,5');
    expect(fmt('{n, number, percent}', { n: 0.256 })).toBe('26%');
    expect(fmt('{n, number, integer}', { n: 2.7 })).toBe('3');
    expect(fmt('{n, number, compact}', { n: 1500 })).toBe('1.5K');
    expect(fmt('{n}', { n: 12000n })).toBe('12,000');
    expect(fmt('{n, number}', { n: 12n })).toBe('12');
    expect(fmt('{n, number}', { n: 1234 }, 'ar')).toMatch(/١٢٣٤|1,234|1٬234/);
  });

  it('formats dates and times in UTC-independent ways', () => {
    const d = new Date(Date.UTC(2026, 0, 5, 12, 0, 0));
    expect(fmt('{d, date, long}', { d }, 'en')).toMatch(/2026/);
    expect(fmt('{d, date}', { d }, 'en')).toMatch(/2026/);
    expect(fmt('{d, time, short}', { d }, 'en')).toMatch(/\d/);
    expect(fmt('{d}', { d }, 'en')).toMatch(/2026/);
    expect(fmt('{d, date, short}', { d: d.getTime() }, 'ja')).toMatch(/2026/);
  });

  it('selects by value with an "other" fallback', () => {
    const m = '{g, select, f {she} m {he} other {they}}';
    expect([fmt(m, { g: 'f' }), fmt(m, { g: 'm' }), fmt(m, { g: 'x' })]).toEqual(['she', 'he', 'they']);
    expect(fmt('{n, plural, one {{g, select, a {A#} other {B#}}} other {many}}', { n: 1, g: 'a' })).toBe('A1');
  });
});

describe('interpolation escaping', () => {
  it('inserts values as inert text and never re-parses them', () => {
    const issues: FormatIssue[] = [];
    expect(fmt('Hello {name}!', { name: '{other} <b>x</b> &amp; {#b}y{/b} #' }, 'en', issues)).toBe('Hello {other} <b>x</b> &amp; {#b}y{/b} #!');
    expect(issues).toEqual([]);
    expect(fmt('{n, plural, other {# {name}}}', { n: 2, name: '#' })).toBe('2 #');
  });

  it('a tag-looking value inside rich text stays a string part, not a tag', () => {
    const parts = formatToParts(parseMessage('{#b}{v}{/b}'), { v: '{#i}x{/i}' }, { locale: 'en' });
    expect(parts).toEqual([{ tag: 'b', children: ['{#i}x{/i}'] }]);
  });

  it('apostrophe quoting: literals, doubled quotes and quoted braces', () => {
    expect(fmt("It''s {n} o''clock", { n: 5 })).toBe("It's 5 o'clock");
    expect(fmt("Use '{'braces'}' here")).toBe('Use {braces} here');
    expect(fmt("don't")).toBe("don't");
    expect(fmt("{n, plural, other {'#' is # and ''quoted'' '{x}'}}", { n: 3 })).toBe("# is 3 and 'quoted' {x}");
    expect(fmt("'{it''s}'")).toBe("{it's}");
    expect(fmt('plain # outside plural')).toBe('plain # outside plural');
  });

  it('reports missing and bad arguments without throwing', () => {
    const issues: FormatIssue[] = [];
    expect(fmt('a {x} b', {}, 'en', issues)).toBe('a {x} b');
    expect(fmt('{x, number}', {}, 'en', issues)).toBe('{x}');
    expect(fmt('{x, plural, other {#}}', {}, 'en', issues)).toBe('{x}');
    expect(fmt('{x, select, other {#}}', {}, 'en', issues)).toBe('{x}');
    expect(fmt('{x, plural, other {#}}', { x: 'abc' }, 'en', issues)).toBe('abc');
    expect(fmt('{x, number}', { x: 'abc' }, 'en', issues)).toBe('abc');
    expect(fmt('{x, date}', { x: 'abc' }, 'en', issues)).toBe('abc');
    expect(fmt('{x}', { x: new Date(NaN) }, 'en', issues)).toBe('{x}');
    expect(issues.map((i) => i.kind)).toEqual(['missing-argument', 'missing-argument', 'missing-argument', 'missing-argument', 'bad-argument', 'bad-argument', 'bad-argument', 'bad-argument']);
    expect(fmt('{x}', {})).toBe('{x}');
    expect(fmt('{x, number}', { x: Infinity })).toBe('Infinity');
  });
});

describe('rich text markup', () => {
  it('splits parts around tags, nested and inside plurals; t() drops the tags', () => {
    const nodes = parseMessage('See {#a}the {#b}docs{/b}{/a} ({n, plural, one {{#b}# page{/b}} other {# pages}}).');
    const parts = formatToParts(nodes, { n: 1 }, { locale: 'en' });
    expect(parts).toEqual(['See ', { tag: 'a', children: ['the ', { tag: 'b', children: ['docs'] }] }, ' (', { tag: 'b', children: ['1 page'] }, ').']);
    expect(partsToString(parts)).toBe('See the docs (1 page).');
  });
});

describe('syntax errors', () => {
  const bad = [
    '{', '{n', '{n,', '{n, bogus}', '{n, number, wide}', '{d, date, wide}', '{n, plural, one {a}}', '{n, plural, one {a} one {b} other {c}}',
    '{n, plural, offset:x other {a}}', '}', 'a {n, plural, other {a}', '{#b}text', '{/b}', '{#b}x{/c}', '{ }', '{n, plural, other a}', '{n, plural, other {a',
    '{n, plural,', '{#}', '{n, select, a {x}}',
  ];
  for (const src of bad) {
    it(`rejects ${JSON.stringify(src)}`, () => {
      expect(() => parseMessage(src)).toThrow(MessageSyntaxError);
    });
  }
  it('carries the position', () => {
    try {
      parseMessage('ab }');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MessageSyntaxError);
      expect((e as MessageSyntaxError).position).toBe(3);
    }
  });
});

describe('analysis and serialisation', () => {
  it('lists arguments, kinds, plural selectors, select options and tags', () => {
    const sig = analyzeMessage(parseMessage('{#b}{who}{/b}: {n, plural, =0 {none} one {#} other {# {unit, select, kg {kilo} other {x}}}} {d, date} {t, time} {o, selectordinal, other {#}} {n2, number} {who}'));
    expect(sig.tags).toEqual(['b']);
    expect(Object.keys(sig.args)).toEqual(['d', 'n', 'n2', 'o', 't', 'unit', 'who']);
    expect(sig.args['n']?.plurals).toEqual([['=0', 'one', 'other']]);
    expect(sig.args['o']?.ordinals).toEqual([['other']]);
    expect(sig.args['unit']?.selects).toEqual([['kg', 'other']]);
    expect(sig.args['who']?.kinds).toEqual(['plain']);
    expect(sig.args['d']?.kinds).toEqual(['date']);
  });

  it('stringify round-trips through parse', () => {
    const srcs = [
      "It''s {n, number, percent} {d, date, long} {d, time}",
      "{n, plural, offset:1 =0 {'#' none} one {# of {x}} other {# '{' items}} {#b}bold{/b}",
      '{g, select, a {A} other {{n, selectordinal, one {#st} other {#th}}}}',
    ];
    for (const s of srcs) {
      const once = stringifyMessage(parseMessage(s));
      expect(parseMessage(once)).toEqual(parseMessage(s));
    }
  });

  it('pseudo-locales keep placeholders, lengthen text by 40 percent and stay valid messages', () => {
    const src = 'Pay {amount, number} to {#b}{name}{/b}: {n, plural, one {# item} other {# items}}';
    const xa = pseudolocalize(src, 'XA');
    const xb = pseudolocalize(src, 'XB');
    for (const p of [xa, xb]) {
      expect(analyzeMessage(parseMessage(p))).toEqual(analyzeMessage(parseMessage(src)));
      expect(p.startsWith('[')).toBe(true);
      expect(p.endsWith(']')).toBe(true);
    }
    expect(xa).toContain('Þáý');
    expect(xb).toContain('‫');
    const plain = 'Hello world, this is a message';
    expect([...pseudolocalize(plain, 'XA')].length).toBeGreaterThanOrEqual(plain.length * 1.4);
    expect(partsToString(formatToParts(parseMessage(pseudolocalize("Don't {x}", 'XA')), { x: 'Z' }, { locale: 'en' }))).toContain("'");
  });
});
