import { describe, expect, it } from 'vitest';
import { JsonParseError, canonicalize, parseStrictJson } from './index.js';

const bad = (s: string): void => expect(() => parseStrictJson(s), s.slice(0, 40)).toThrow(JsonParseError);

describe('strict JSON parser', () => {
  it('parses plain documents', () => {
    expect(
      parseStrictJson(
        ' {"a":[1,2,{"b":"x"}],"c":true,"d":false,"e":null,"f":"\\u00e9\\n\\"\\\\\\/\\b\\f\\r\\t"} ',
      ),
    ).toEqual({
      a: [1, 2, { b: 'x' }],
      c: true,
      d: false,
      e: null,
      f: 'é\n"\\/\b\f\r\t',
    });
    expect(parseStrictJson('[]')).toEqual([]);
    expect(parseStrictJson('{}')).toEqual({});
    expect(parseStrictJson('0')).toBe(0);
    expect(parseStrictJson('9007199254740991')).toBe(9007199254740991);
  });
  it('rejects duplicate and prototype keys', () => {
    bad('{"a":1,"a":2}');
    bad('{"__proto__":{}}');
    bad('{"a":{"__proto__":1}}');
    bad('{"constructor":1}');
    bad('{"prototype":1}');
    bad('{"\\u005f_proto__":1}');
  });
  it('rejects floats, exponents, negatives, huge, leading zeros, NaN, Infinity', () => {
    for (const n of [
      '1.5',
      '1e3',
      '1E3',
      '-1',
      '-0',
      '01',
      '9007199254740992',
      '123456789012345678901234567890',
      '1e999',
      '+1',
      '.5',
      '5.',
      'NaN',
      'Infinity',
      '-Infinity',
      '0x10',
    ]) {
      bad(n);
      bad(`{"a":${n}}`);
    }
  });
  it('rejects syntax errors', () => {
    for (const s of [
      '',
      ' ',
      '{',
      '[',
      '{"a"}',
      '{"a":}',
      '{"a":1,}',
      '[1,]',
      '[1 2]',
      '{"a":1 "b":2}',
      '{a:1}',
      "{'a':1}",
      '"abc',
      '"a\nb"',
      '"\\x"',
      '"\\u12"',
      '"\\u12G4"',
      '"\\',
      'tru',
      'nul',
      'falsy',
      '{} x',
      '[] []',
      '{"a":1}}',
      '﻿{}',
      '{"a" 1}',
      '{1:2}',
      '[}',
    ])
      bad(s);
  });
  it('rejects nesting deeper than 8 without blowing the stack', () => {
    bad('['.repeat(9) + ']'.repeat(9));
    expect(parseStrictJson('['.repeat(8) + ']'.repeat(8))).toBeTruthy();
    bad('['.repeat(20000));
    bad('{"a":'.repeat(5000));
  });
  it('objects have a null prototype', () => {
    expect(Object.getPrototypeOf(parseStrictJson('{"a":1}'))).toBeNull();
  });
});

describe('canonicalize', () => {
  it('sorts keys and strips whitespace', () => {
    expect(canonicalize({ b: 1, a: { d: [3, 'x'], c: true }, e: null })).toBe(
      '{"a":{"c":true,"d":[3,"x"]},"b":1,"e":null}',
    );
    expect(canonicalize({ b: false })).toBe('{"b":false}');
  });
  it('is stable under key insertion order', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it('rejects non-integers, negatives, NaN, undefined, bigint, functions, class instances', () => {
    for (const v of [
      1.5,
      -1,
      NaN,
      Infinity,
      undefined,
      10n,
      () => 1,
      new Date(),
      new Map(),
      2 ** 53,
      Symbol('x'),
      { a: undefined },
    ]) {
      expect(() => canonicalize(v)).toThrow(JsonParseError);
    }
  });
  it('accepts null-prototype objects', () => {
    const o = Object.create(null) as Record<string, unknown>;
    o['k'] = 1;
    expect(canonicalize(o)).toBe('{"k":1}');
  });
});
