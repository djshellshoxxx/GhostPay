import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertNoRealData,
  assertNoTestData,
  containsTestData,
  isTestAddress,
  isTestProfileId,
  isTestTxId,
  parseTestAddress,
  toRealProfileId,
  toTestAmount,
  MAX_TEST_AMOUNT,
} from './brand.js';
import { SandboxError } from './errors.js';

const A = 'test1' + 'ab'.repeat(16);
const T = 'testtx_' + '01'.repeat(16);
const P = 'testprof_' + '0f'.repeat(8);

describe('brand guards', () => {
  it('recognises exact formats only', () => {
    expect(isTestAddress(A)).toBe(true);
    expect(isTestAddress(A + 'a')).toBe(false);
    expect(isTestAddress(A.toUpperCase())).toBe(false);
    expect(isTestAddress(5)).toBe(false);
    expect(isTestTxId(T)).toBe(true);
    expect(isTestTxId(A)).toBe(false);
    expect(isTestProfileId(P)).toBe(true);
    expect(isTestProfileId('testprof_zz')).toBe(false);
  });
  it('parseTestAddress throws typed error', () => {
    expect(parseTestAddress(A)).toBe(A);
    expect(() => parseTestAddress('bc1qfake')).toThrowError(SandboxError);
    try {
      parseTestAddress(null);
    } catch (e) {
      expect((e as SandboxError).code).toBe('invalid-address');
    }
  });
  it('toTestAmount validates', () => {
    expect(toTestAmount(5n)).toBe(5n);
    expect(toTestAmount(0n, true)).toBe(0n);
    for (const bad of [0n, -1n, MAX_TEST_AMOUNT + 1n, 5, '5', null]) {
      expect(() => toTestAmount(bad)).toThrowError(SandboxError);
    }
  });
});

describe('real profile ids', () => {
  it('accepts normal ids', () => expect(toRealProfileId('alice-1')).toBe('alice-1'));
  it('rejects bad charset, non-strings, and test ids', () => {
    for (const bad of ['', ' x', 'a/b', 'x'.repeat(65), 7, P, 'testprof_xyz']) {
      expect(() => toRealProfileId(bad)).toThrowError(SandboxError);
    }
    try {
      toRealProfileId(P);
    } catch (e) {
      expect((e as SandboxError).code).toBe('test-data-in-real-context');
    }
  });
  it('rejects ids embedding a test marker', () => {
    expect(() => toRealProfileId('x' + A)).toThrowError(/marker/);
  });
});

describe('containsTestData', () => {
  it('finds markers in nested values, keys and arrays', () => {
    expect(containsTestData({ a: [{ b: `to ${A}!` }] })).toBe(true);
    expect(containsTestData({ [T]: 1 })).toBe(true);
    expect(containsTestData([P])).toBe(true);
  });
  it('passes clean data incl. bigint/null/numbers', () => {
    expect(containsTestData({ a: 1n, b: null, c: 'hello', d: [1, 2], e: undefined })).toBe(false);
  });
  it('handles cycles', () => {
    const o: Record<string, unknown> = { a: 1 };
    o['self'] = o;
    expect(containsTestData(o)).toBe(false);
    o['x'] = A;
    expect(containsTestData(o)).toBe(true);
  });
  it('fails closed on too deep or too large', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 40; i++) deep = [deep];
    expect(containsTestData(deep)).toBe(true);
    expect(containsTestData(new Array<number>(100_001).fill(0))).toBe(true);
  });
  it('assertNoTestData throws only with markers', () => {
    expect(() => assertNoTestData({ a: 'ok' })).not.toThrow();
    expect(() => assertNoTestData({ a: A })).toThrowError(SandboxError);
  });
  it('property: marker anywhere in a string is found', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), (pre, post) => {
        expect(containsTestData(pre + A + post)).toBe(true);
      }),
    );
  });
});

describe('assertNoRealData', () => {
  const looksReal = (s: string): boolean => s.startsWith('REAL');
  it('rejects real-looking strings at any depth', () => {
    expect(() => assertNoRealData({ a: [{ b: 'REAL123' }] }, looksReal)).toThrowError(SandboxError);
    expect(() => assertNoRealData('REALx', looksReal)).toThrowError(SandboxError);
  });
  it('accepts clean data and nulls', () => {
    expect(() => assertNoRealData({ a: ['x', 1, null] }, looksReal)).not.toThrow();
  });
  it('fails on excessive depth', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 40; i++) deep = [deep];
    expect(() => assertNoRealData(deep, looksReal)).toThrowError(SandboxError);
  });
});
