import { describe, expect, it } from 'vitest';
import { NATIVE_TOKEN_PLACEHOLDER, isNativeTokenPlaceholder, nativeTokenLabel, parseTokenAddress } from './token.js';
import { isReason } from './errors.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

describe('ERC-7528 native placeholder', () => {
  it('constant is the ERC-7528 address', () => {
    expect(NATIVE_TOKEN_PLACEHOLDER).toBe('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  });
  it('is recognised in any case', () => {
    expect(isNativeTokenPlaceholder(NATIVE_TOKEN_PLACEHOLDER)).toBe(true);
    expect(isNativeTokenPlaceholder(NATIVE_TOKEN_PLACEHOLDER.toLowerCase())).toBe(true);
    expect(isNativeTokenPlaceholder(USDC)).toBe(false);
    expect(isNativeTokenPlaceholder(5)).toBe(false);
  });
  it('parseTokenAddress never accepts it as a token address', () => {
    for (const s of [NATIVE_TOKEN_PLACEHOLDER, NATIVE_TOKEN_PLACEHOLDER.toLowerCase()]) {
      const r = parseTokenAddress(s);
      expect(isReason(r) && r.reason).toBe('native_placeholder');
    }
  });
  it('parseTokenAddress otherwise behaves like parseStrictAddress', () => {
    expect(parseTokenAddress(USDC)).toBe(USDC);
    const bad = parseTokenAddress('0x123');
    expect(isReason(bad) && bad.reason).toBe('bad_length');
    const zero = parseTokenAddress('0x0000000000000000000000000000000000000000');
    expect(isReason(zero) && zero.reason).toBe('zero_address');
  });
  it('label is display-only and fixed', () => {
    expect(nativeTokenLabel('ETH')).toBe('ETH (native, not a token contract)');
    expect(nativeTokenLabel('<script>')).toBe('native currency (not a token contract)');
    expect(nativeTokenLabel()).toBe('native currency (not a token contract)');
  });
});
