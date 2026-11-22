import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical.js';
import { ReceiptError } from './errors.js';

const sparse = (length: number, present: readonly (readonly [number, unknown])[] = []): unknown[] => {
  const values: unknown[] = Array(length);
  for (const [i, value] of present) values[i] = value;
  return values;
};

describe('canonicalJson sparse arrays', () => {
  it.each([
    ['one omitted element', sparse(1)],
    ['two omitted elements', sparse(2)],
    ['interior omitted element', sparse(3, [[0, 1], [2, 3]])],
    ['trailing omitted element', sparse(2, [[0, 1]])],
    ['sparse nested array', { values: sparse(3, [[0, 1], [2, 3]]) }],
    ['sparse deeply nested array', [{ values: sparse(1) }]],
  ])('rejects %s rather than silently dropping or invalidly emitting slots', (_name, input) => {
    expect(() => canonicalJson(input)).toThrow(ReceiptError);
    expect(() => canonicalJson(input)).toThrow('unsupported value type');
  });

  it('retains dense JSON array representations, including explicit null', () => {
    expect(canonicalJson([null, 1, { b: 2, a: 3 }])).toBe('[null,1,{"a":3,"b":2}]');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson([[]])).toBe('[[]]');
  });

  it('continues to reject explicitly undefined array entries', () => {
    expect(() => canonicalJson([undefined])).toThrow(ReceiptError);
  });

  it('preserves canonical object-key ordering for arrays nested in objects', () => {
    const canonical = canonicalJson({ z: [true, 'x', null], a: [1, 2, 3] });
    expect(canonical).toBe('{"a":[1,2,3],"z":[true,"x",null]}');
    expect(JSON.parse(canonical)).toEqual({ a: [1, 2, 3], z: [true, 'x', null] });
  });
});
