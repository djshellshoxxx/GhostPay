import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem/utils';
import { CHAINS, findChain, requireEnabledChain } from './config/chains.js';
import { TOKENS, findToken, tokensForChain } from './config/tokens.js';
import { ChainAdapterError } from './errors.js';

describe('chains', () => {
  it('has the required ids, unique', () => {
    expect(CHAINS.map((c) => c.chainId).sort((a, b) => a - b)).toEqual([1, 10, 56, 97, 137, 8453, 42161, 43113, 43114, 80002, 84532, 421614, 11155111, 11155420].sort((a, b) => a - b));
    expect(new Set(CHAINS.map((c) => c.chainId)).size).toBe(CHAINS.length);
  });
  it('testnets enabled, mainnets disabled', () => {
    for (const c of CHAINS) expect(c.enabled).toBe(c.testnet);
    expect(CHAINS.filter((c) => c.enabled).map((c) => c.chainId).sort((a, b) => a - b)).toEqual([97, 43113, 80002, 84532, 421614, 11155111, 11155420]);
    expect(CHAINS.filter((c) => !c.testnet).every((c) => !c.enabled)).toBe(true);
    expect(new Set(CHAINS.map((c) => c.name)).size).toBe(CHAINS.length);
  });
  it('native symbols and sane numeric limits', () => {
    expect(findChain(137)?.nativeSymbol).toBe('POL');
    expect(findChain(56)?.nativeSymbol).toBe('BNB');
    expect(findChain(43114)?.nativeSymbol).toBe('AVAX');
    for (const c of CHAINS) {
      expect(c.finalityDepth).toBeGreaterThan(0);
      expect(c.getLogsMaxRange).toBeGreaterThan(0);
      expect(c.blockTimeMs).toBeGreaterThan(0);
      expect(c.nativeDecimals).toBe(18);
    }
  });
  it('requireEnabledChain fails closed', () => {
    expect(requireEnabledChain(84532).name).toBe('Base Sepolia');
    expect(() => requireEnabledChain(1)).toThrow(ChainAdapterError);
    expect(() => requireEnabledChain(999999)).toThrow(/disabled/);
    expect(findChain(999999)).toBeUndefined();
  });
});

describe('tokens', () => {
  it('addresses are EIP-55 and belong to known chains', () => {
    for (const t of TOKENS) {
      expect(getAddress(t.address)).toBe(t.address);
      expect(findChain(t.chainId)).toBeDefined();
      expect(t.decimals).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(TOKENS.map((t) => `${String(t.chainId)}:${t.address.toLowerCase()}`)).size).toBe(TOKENS.length);
    expect(new Set(TOKENS.map((t) => `${String(t.chainId)}:${t.symbol}`)).size).toBe(TOKENS.length);
  });
  it('no mainnet token is listed until verified; tokens only on enabled testnets', () => {
    for (const t of TOKENS) {
      const c = findChain(t.chainId);
      expect(c?.testnet).toBe(true);
      expect(c?.enabled).toBe(true);
    }
  });
  it('lookups', () => {
    expect(tokensForChain(11155111).map((t) => t.symbol)).toEqual(['USDC', 'EURC']);
    expect(tokensForChain(1)).toHaveLength(0);
    const t = TOKENS[0];
    expect(findToken(t?.chainId ?? 0, (t?.address ?? '').toLowerCase())).toBe(t);
    expect(findToken(1, t?.address ?? '')).toBeUndefined();
  });
});
