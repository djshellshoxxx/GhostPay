import { describe, expect, it } from 'vitest';
import {
  TEST_CHAIN_ID_MAX,
  TEST_MEMO_PREFIX,
  assertTestChainId,
  assertTestInvoice,
  brandAsTest,
  isTestChainId,
  isTestInvoice,
  mockAddress,
  mockHash,
} from './index.js';

describe('test mode marker', () => {
  it('range edges', () => {
    expect(isTestChainId(31336)).toBe(false);
    expect(isTestChainId(31337)).toBe(true);
    expect(isTestChainId(TEST_CHAIN_ID_MAX)).toBe(true);
    expect(isTestChainId(31400)).toBe(false);
    expect(isTestChainId(1)).toBe(false);
    expect(isTestChainId(8453)).toBe(false);
    expect(isTestChainId(31337.5)).toBe(false);
    expect(isTestChainId(NaN)).toBe(false);
  });
  it('brandAsTest prefixes memo, idempotent, refuses live chain', () => {
    const a = brandAsTest({ chainId: 31337, memo: 'Ref 1' });
    expect(a.memo).toBe(`${TEST_MEMO_PREFIX}Ref 1`);
    expect(brandAsTest(a).memo).toBe(a.memo);
    expect(brandAsTest({ chainId: 31338 }).memo).toBe(`${TEST_MEMO_PREFIX}sandbox`);
    expect(brandAsTest({ chainId: 31337, memo: '' }).memo).toBe(`${TEST_MEMO_PREFIX}sandbox`);
    expect(() => brandAsTest({ chainId: 8453, memo: 'x' })).toThrow(/reserved test range/);
    expect([...(brandAsTest({ chainId: 31337, memo: 'x'.repeat(900) }).memo)].length).toBe(500);
  });
  it('isTestInvoice needs BOTH chain id and memo marker', () => {
    expect(isTestInvoice({ chainId: 31337, memo: `${TEST_MEMO_PREFIX}a` })).toBe(true);
    expect(isTestInvoice({ chainId: 31337, memo: 'plain' })).toBe(false);
    expect(isTestInvoice({ chainId: 31337 })).toBe(false);
    expect(isTestInvoice({ chainId: 8453, memo: `${TEST_MEMO_PREFIX}a` })).toBe(false);
    expect(() => assertTestInvoice({ chainId: 8453, memo: `${TEST_MEMO_PREFIX}a` })).toThrow();
    expect(() => assertTestInvoice({ chainId: 31337, memo: `${TEST_MEMO_PREFIX}a` })).not.toThrow();
    expect(() => assertTestChainId(1)).toThrow();
  });
});

describe('mock hash', () => {
  it('is deterministic, well formed and input sensitive', () => {
    expect(mockHash('a')).toBe(mockHash('a'));
    expect(mockHash('a')).not.toBe(mockHash('b'));
    expect(mockHash('a')).toMatch(/^0x[0-9a-f]{64}$/);
    expect(mockAddress('x')).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
