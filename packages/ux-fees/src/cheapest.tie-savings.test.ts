import { describe, expect, it } from 'vitest';
import { suggestCheapestChain, type ChainFeeQuote } from './cheapest.js';

const NOW = 1_800_000_000n;
const PAYMENT = { gross: 0n, tokenDecimals: 6 };

function quote(chainId: number, maxFeePerGas: bigint, finalityDepth = 2): ChainFeeQuote {
  return {
    chainId,
    name: `Chain${String(chainId)}`,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    enabled: true,
    gasUnits: 120_000n,
    maxFeePerGas,
    checkout: 'enforced',
    checkoutBps: 0,
    blockTimeMs: 12_000,
    finalityDepth,
    quotedAt: NOW - 10n,
  };
}

describe('suggestCheapestChain near-tie savings', () => {
  it('does not report negative savings when the preferred chain costs more', () => {
    const result = suggestCheapestChain(
      [quote(1, 100_000_000n), quote(2, 100_500_000n)],
      PAYMENT,
      { now: NOW, tieToleranceBps: 100, preferredChainId: 2, currentChainId: 1 },
    );
    expect(result.mode).toBe('native');
    expect(result.bestChainId).toBe(2);
    expect(result.ranked.map((entry) => entry.chainId)).toEqual([2, 1]);
    expect(result.savingsVsNext).toEqual({ unit: 'native', amount: 0n });
    expect(result.savingsVsCurrent).toEqual({ unit: 'native', amount: 0n });
    expect(result.suggestion).toBe('stay');
  });

  it('does not report negative savings when faster finality wins a more expensive tie', () => {
    const result = suggestCheapestChain(
      [quote(1, 100_000_000n, 3), quote(2, 100_500_000n, 1)],
      PAYMENT,
      { now: NOW, tieToleranceBps: 100 },
    );
    expect(result.bestChainId).toBe(2);
    expect(result.savingsVsNext).toEqual({ unit: 'native', amount: 0n });
    expect(result.why.map((entry) => entry.key)).toContain('fees.cheapest.why.tieBrokenBySpeed');
  });

  it('preserves positive savings when the winning chain really is cheaper', () => {
    const result = suggestCheapestChain(
      [quote(1, 100_000_000n), quote(2, 100_500_000n)],
      PAYMENT,
      { now: NOW, tieToleranceBps: 0 },
    );
    expect(result.bestChainId).toBe(1);
    expect(result.savingsVsNext).toEqual({ unit: 'native', amount: 60_000_000_000n });
  });

  it('reports zero savings for equal-cost ties', () => {
    const result = suggestCheapestChain(
      [quote(1, 100_000_000n), quote(2, 100_000_000n)],
      PAYMENT,
      { now: NOW, preferredChainId: 2 },
    );
    expect(result.bestChainId).toBe(2);
    expect(result.savingsVsNext).toEqual({ unit: 'native', amount: 0n });
  });
});
