import { describe, expect, it } from 'vitest';
import { TESTNET_CHAIN_IDS, assertTestnet, isTestnetChainId } from './chainGuard.js';
import { PayerSponsorError, ensure } from './errors.js';

describe('chain guard (PH-GEN-1)', () => {
  it('allows exactly Sepolia, Base Sepolia and the local chain', () => {
    expect([...TESTNET_CHAIN_IDS].sort((a, b) => a - b)).toEqual([31337, 84532, 11155111]);
    for (const id of TESTNET_CHAIN_IDS) expect(() => assertTestnet(id)).not.toThrow();
  });
  it.each([1, 10, 137, 8453, 42161, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses %s', (id) => {
    expect(isTestnetChainId(id)).toBe(false);
    expect(() => assertTestnet(id)).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
  });
  it('ensure throws INVALID_ARGUMENT', () => {
    expect(() => ensure(true, 'x')).not.toThrow();
    expect(() => ensure(false, 'x')).toThrowError(PayerSponsorError);
  });
});
