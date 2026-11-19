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

  it('rejects sparse or decorated arrays rather than silently altering signed JSON', () => {
    const missingFirst: number[] = [];
    missingFirst.length = 1;
    const missingMiddle = [1];
    missingMiddle.length = 3;
    missingMiddle[2] = 3;
    const extra = [1] as number[] & { extra?: number };
    extra.extra = 2;
    const nonenumerable = [1];
    Object.defineProperty(nonenumerable, 'hidden', { value: 2 });
    const symbol = [1];
    (symbol as unknown as Record<symbol, number>)[Symbol('hidden')] = 3;
    for (const value of [missingFirst, missingMiddle, extra, nonenumerable, symbol]) {
      expect(() => canonicalize(value)).toThrow(JsonParseError);
    }
    expect(canonicalize([1, 2, { value: 3 }])).toBe('[1,2,{"value":3}]');
  });
  it('rejects a missing array index even when an extra key balances the count', () => {
    const value = [1] as number[] & { extra?: number };
    value.length = 2;
    value.extra = 2;
    expect(() => canonicalize(value)).toThrow(JsonParseError);
  });
  it('preserves empty and frozen dense array bytes', () => {
    expect(canonicalize([])).toBe('[]');
    expect(canonicalize(Object.freeze([1, 2]))).toBe('[1,2]');
  });

  it('rejects array accessors without invoking them', () => {
    const value = [1, 2];
    let calls = 0;
    Object.defineProperty(value, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        calls++;
        delete value[1];
        return 1;
      },
    });
    expect(() => canonicalize(value)).toThrow(JsonParseError);
    expect(calls).toBe(0);
  });
  it('does not use inherited map implementations or input get/has traps', () => {
    let calls = 0;
    const prototype = Object.create(Array.prototype) as { map: () => number[] };
    prototype.map = () => {
      calls++;
      return [9];
    };
    const custom = [1, 2];
    Object.setPrototypeOf(custom, prototype);
    expect(canonicalize(custom)).toBe('[1,2]');
    expect(calls).toBe(0);
    const wrapped = new Proxy([1, 2], {
      has: () => { throw new Error('array membership traps must not run'); },
      get: () => { throw new Error('array value getters must not run'); },
    });
    expect(canonicalize(wrapped)).toBe('[1,2]');
  });
  it('snapshots later data elements before recursively serializing earlier values', () => {
    const value: unknown[] = [null, 2];
    value[0] = {
      get first() {
        delete value[1];
        return 1;
      },
    };
    expect(canonicalize(value)).toBe('[{"first":1},2]');
  });
  it('accepts frozen, sealed, null-prototype and nonenumerable dense data arrays', () => {
    const withoutPrototype = [1, 2];
    Object.setPrototypeOf(withoutPrototype, null);
    const nonenumerableIndex = [1, 2];
    Object.defineProperty(nonenumerableIndex, '1', { enumerable: false });
    for (const value of [Object.freeze([1, 2]), Object.seal([1, 2]), withoutPrototype, nonenumerableIndex]) {
      expect(canonicalize(value)).toBe('[1,2]');
    }
    expect(canonicalize([])).toBe('[]');
  });
  it('rejects missing own indices even when an extra key balances the property count', () => {
    const value: unknown[] & { extra?: number } = [1];
    value.length = 2;
    value.extra = 3;
    const prototype = Object.create(Array.prototype) as Record<string, unknown>;
    prototype['1'] = 2;
    Object.setPrototypeOf(value, prototype);
    expect(() => canonicalize(value)).toThrow(JsonParseError);
  });
  it('does not depend on Proxy own-key enumeration order', () => {
    const value = new Proxy([1, 2], { ownKeys: () => ['length', '1', '0'] });
    expect(canonicalize(value)).toBe('[1,2]');
  });
  it.each([Number.NaN, Infinity, -1, 1.5, '1'])('rejects invalid array length descriptors (%s)', (length) => {
    const value = new Proxy([1], {
      getOwnPropertyDescriptor: (target, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        return key === 'length' ? { ...descriptor, value: length } : descriptor;
      },
    });
    expect(() => canonicalize(value)).toThrow(JsonParseError);
  });
  it('accepts null-prototype objects', () => {
    const o = Object.create(null) as Record<string, unknown>;
    o['k'] = 1;
    expect(canonicalize(o)).toBe('{"k":1}');
  });
});
