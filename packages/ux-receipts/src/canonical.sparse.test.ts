import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical.js';
import { ReceiptError } from './errors.js';

describe('canonicalJson sparse arrays', () => {
  it.each([
    ['one omitted element', new Array(1)],
    ['two omitted elements', new Array(2)],
    ['interior omitted element', [1, , 3]],
    ['trailing omitted element', [1, ,]],
    ['sparse nested array', { values: [1, , 3] }],
    ['sparse deeply nested array', [{ values: new Array(1) }]],
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
