import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { suggestCheapestChain, type ChainFeeQuote, type CheapestRates } from './cheapest.js';
import { UxFeesError } from './errors.js';

const NOW = 1_800_000_000n;
const gwei = 10n ** 9n;

function q(over: Partial<ChainFeeQuote> & { chainId: number }): ChainFeeQuote {
  return {
    name: `Chain${String(over.chainId)}`,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    enabled: true,
    gasUnits: 120_000n,
    maxFeePerGas: 30n * gwei,
    checkout: 'enforced',
    checkoutBps: 25,
    blockTimeMs: 12_000,
    finalityDepth: 2,
    quotedAt: NOW - 10n,
    ...over,
  };
}

const rates: CheapestRates = {
  fiatCurrency: 'USD',
  native: {
    ETH: { answer: 200_000n, decimals: 2, asOf: NOW - 60n },
    POL: { answer: 50n, decimals: 2, asOf: NOW - 60n },
  },
  token: { answer: 100n, decimals: 2, asOf: NOW - 60n },
};
const pay = { gross: 100_000_000n, tokenDecimals: 6 };

describe('suggestCheapestChain fiat mode', () => {
  it('ranks by exact fiat micro-units and explains why', () => {
    const r = suggestCheapestChain(
      [q({ chainId: 1 }), q({ chainId: 2, maxFeePerGas: 50_000_000n })],
      pay,
      { now: NOW },
      rates,
    );
    expect(r.status).toBe('ok');
    expect(r.mode).toBe('fiat');
    expect(r.bestChainId).toBe(2);
    // chain 1: 120000*30e9 = 3.6e15 wei * $2000 = $7.20 -> 7_200_000; fee 250_000 token units = $0.25
    expect(r.ranked[1]?.networkFiatMicro).toBe(7_200_000n);
    expect(r.ranked[1]?.checkoutFiatMicro).toBe(250_000n);
    expect(r.ranked[1]?.totalFiatMicro).toBe(7_450_000n);
    // chain 2: 120000*5e7 = 6e12 wei -> $0.012 -> 12_000
    expect(r.ranked[0]?.totalFiatMicro).toBe(262_000n);
    expect(r.savingsVsNext).toEqual({ unit: 'fiatMicro', amount: 7_188_000n });
    expect(r.fiatCurrency).toBe('USD');
    expect(r.why[0]?.key).toBe('fees.cheapest.why.lowestTotal');
    expect(r.why.some((m) => m.key === 'fees.cheapest.note.recipientMustAcceptChain')).toBe(true);
  });

  it('rounds fiat UP (never understates cost)', () => {
    // 1 wei at $2000 = 2e-15 USD -> 1e-6 granularity -> rounds up to 1 micro
    const r = suggestCheapestChain(
      [
        q({ chainId: 1, gasUnits: 1n, maxFeePerGas: 1n, checkoutBps: 0 }),
        q({ chainId: 2, gasUnits: 1n, maxFeePerGas: 2n, checkoutBps: 0 }),
      ],
      { gross: 0n, tokenDecimals: 6 },
      { now: NOW, tieToleranceBps: 0 },
      rates,
    );
    expect(r.ranked.map((c) => c.networkFiatMicro)).toEqual([1n, 1n]);
  });

  it('mixes different native assets via rates', () => {
    const r = suggestCheapestChain(
      [
        q({ chainId: 1 }),
        q({ chainId: 137, nativeSymbol: 'POL', maxFeePerGas: 100n * gwei, gasUnits: 150_000n }),
      ],
      pay,
      { now: NOW },
      rates,
    );
    // POL: 150000*1e11 = 1.5e16 wei * $0.50 = $0.0075*... = 0.0075 ETH-equivalent? 1.5e16/1e18=0.015 POL * 0.5 = $0.0075 -> 7_500
    expect(r.mode).toBe('fiat');
    expect(r.bestChainId).toBe(137);
    expect(r.ranked[0]?.networkFiatMicro).toBe(7_500n);
  });

  it('tie within tolerance: preferred chain wins', () => {
    const r = suggestCheapestChain(
      [q({ chainId: 1, maxFeePerGas: 100_000_000n }), q({ chainId: 2, maxFeePerGas: 100_500_000n })],
      pay,
      { now: NOW, preferredChainId: 2, tieToleranceBps: 100 },
      rates,
    );
    expect(r.bestChainId).toBe(2);
    expect(r.why.map((m) => m.key)).toContain('fees.cheapest.why.tieBrokenByPreference');
  });

  it('tie: faster finality wins, then lowest id', () => {
    const quotes = [
      q({ chainId: 5, finalityDepth: 10 }),
      q({ chainId: 3, finalityDepth: 1 }),
      q({ chainId: 4, finalityDepth: 1 }),
    ];
    const r = suggestCheapestChain(quotes, pay, { now: NOW }, rates);
    expect(r.bestChainId).toBe(3);
    expect(r.why.map((m) => m.key)).toContain('fees.cheapest.why.tieBrokenById');
    const r2 = suggestCheapestChain(
      [q({ chainId: 5, finalityDepth: 10 }), q({ chainId: 3, finalityDepth: 1 })],
      pay,
      { now: NOW },
      rates,
    );
    expect(r2.bestChainId).toBe(3);
    expect(r2.why.map((m) => m.key)).toContain('fees.cheapest.why.tieBrokenBySpeed');
  });

  it('outside tolerance the cheaper chain wins even if slower or not preferred', () => {
    const r = suggestCheapestChain(
      [
        q({ chainId: 1, maxFeePerGas: 100_000_000n, finalityDepth: 100 }),
        q({ chainId: 2, maxFeePerGas: 200_000_000n }),
      ],
      pay,
      { now: NOW, preferredChainId: 2 },
      rates,
    );
    expect(r.bestChainId).toBe(1);
  });

  it('suggests switch only above the saving threshold', () => {
    const quotes = [q({ chainId: 1 }), q({ chainId: 2, maxFeePerGas: 50_000_000n })];
    const sw = suggestCheapestChain(quotes, pay, { now: NOW, currentChainId: 1 }, rates);
    expect(sw.suggestion).toBe('switch');
    expect(sw.savingsVsCurrent?.amount).toBe(7_188_000n);
    const stay = suggestCheapestChain(quotes, pay, { now: NOW, currentChainId: 2 }, rates);
    expect(stay.suggestion).toBe('stay');
    expect(stay.savingsVsCurrent?.amount).toBe(0n);
    // saving 3.6 % of current < 5 % threshold -> stay
    const near = suggestCheapestChain(
      [q({ chainId: 1, maxFeePerGas: 1_000_000_000n }), q({ chainId: 2, maxFeePerGas: 964_000_000n })],
      { gross: 0n, tokenDecimals: 6 },
      { now: NOW, currentChainId: 1, tieToleranceBps: 0 },
      rates,
    );
    expect(near.bestChainId).toBe(2);
    expect(near.suggestion).toBe('stay');
    const missing = suggestCheapestChain(quotes, pay, { now: NOW, currentChainId: 99 }, rates);
    expect(missing.suggestion).toBeUndefined();
    expect(missing.warnings.map((m) => m.key)).toContain('fees.cheapest.warn.currentChainUnavailable');
  });

  it('stale or missing rates degrade to native mode / incomparable with warnings', () => {
    const stale: CheapestRates = {
      ...rates,
      native: { ETH: { answer: 200_000n, decimals: 2, asOf: NOW - 7200n } },
    };
    const r = suggestCheapestChain(
      [q({ chainId: 1 }), q({ chainId: 2, maxFeePerGas: 50_000_000n })],
      pay,
      { now: NOW },
      stale,
    );
    expect(r.mode).toBe('native');
    expect(r.bestChainId).toBe(2);
    expect(r.ranked[0]?.totalFiatMicro).toBeUndefined();
    expect(r.warnings.map((m) => m.key)).toContain('fees.cheapest.warn.nativeRateUnavailable');
    expect(r.savingsVsNext).toEqual({ unit: 'native', amount: 3_600_000_000_000_000n - 6_000_000_000_000n });
    const mixed = suggestCheapestChain(
      [q({ chainId: 1 }), q({ chainId: 137, nativeSymbol: 'POL' })],
      pay,
      { now: NOW },
      stale,
    );
    expect(mixed.status).toBe('incomparable');
    expect(mixed.bestChainId).toBeUndefined();
    expect(mixed.why[0]?.key).toBe('fees.cheapest.why.incomparable');
    expect(mixed.ranked.map((c) => c.chainId)).toEqual([1, 137]);
  });

  it('token rate missing only matters when a token fee exists', () => {
    const noTok = { ...rates, token: { answer: 0n, decimals: 2, asOf: NOW } };
    const r = suggestCheapestChain([q({ chainId: 1 }), q({ chainId: 2 })], pay, { now: NOW }, noTok);
    expect(r.mode).toBe('native');
    expect(r.warnings.map((m) => m.key)).toContain('fees.cheapest.warn.tokenRateUnavailable');
    const free = suggestCheapestChain(
      [q({ chainId: 1, checkoutBps: 0 }), q({ chainId: 2, checkoutBps: 0 })],
      pay,
      { now: NOW },
      noTok,
    );
    expect(free.mode).toBe('fiat');
  });

  it('rejects future rates and polluted prototype keys', () => {
    const future: CheapestRates = {
      ...rates,
      native: { ETH: { answer: 1n, decimals: 0, asOf: NOW + 1000n } },
    };
    expect(suggestCheapestChain([q({ chainId: 1 }), q({ chainId: 2 })], pay, { now: NOW }, future).mode).toBe(
      'native',
    );
    const proto = suggestCheapestChain(
      [q({ chainId: 1, nativeSymbol: 'CONSTRUCTOR' }), q({ chainId: 2, nativeSymbol: 'TOSTRING' })],
      pay,
      { now: NOW },
      rates,
    );
    expect(proto.status).toBe('incomparable');
  });
});

describe('suggestCheapestChain native / single / exclusions', () => {
  it('native mode compares wei and warns when token fees differ', () => {
    const r = suggestCheapestChain(
      [
        q({ chainId: 1, maxFeePerGas: 2n * gwei }),
        q({ chainId: 2, maxFeePerGas: gwei, checkout: 'not_enforceable' }),
      ],
      pay,
      { now: NOW },
    );
    expect(r.mode).toBe('native');
    expect(r.bestChainId).toBe(2);
    expect(r.ranked[0]?.checkoutFeeToken).toBe(0n);
    expect(r.ranked[0]?.notes[0]?.key).toBe('fees.cheapest.note.noCheckoutFee');
    expect(r.warnings.map((m) => m.key)).toContain('fees.cheapest.warn.tokenFeeNotCompared');
    expect(r.why.map((m) => m.key)).toContain('fees.cheapest.why.winnerHasNoCheckoutFee');
    expect(r.why.map((m) => m.key)).toContain('fees.cheapest.why.lowestNetworkFee');
  });

  it('single eligible chain is returned without a comparison', () => {
    const r = suggestCheapestChain([q({ chainId: 1 }), q({ chainId: 2, enabled: false })], pay, {
      now: NOW,
      currentChainId: 1,
    });
    expect(r.mode).toBe('single');
    expect(r.bestChainId).toBe(1);
    expect(r.suggestion).toBeUndefined();
    expect(r.why[0]?.key).toBe('fees.cheapest.why.onlyOption');
  });

  it('excludes with reasons: disabled, no checkout, stale, future, unsupported, invalid, duplicates', () => {
    const quotes: unknown[] = [
      q({ chainId: 1 }),
      q({ chainId: 2, enabled: false }),
      q({ chainId: 3, checkout: 'not_deployed' }),
      q({ chainId: 4, quotedAt: NOW - 121n }),
      q({ chainId: 5, quotedAt: NOW + 61n }),
      q({ chainId: 6 }),
      q({ chainId: 7 }),
      q({ chainId: 7 }),
      { chainId: 8 },
      null,
      q({ chainId: 9, quotedAt: NOW - 120n }),
    ];
    const r = suggestCheapestChain(quotes as ChainFeeQuote[], pay, {
      now: NOW,
      supportedChainIds: [1, 2, 3, 4, 5, 7, 8, 9],
    });
    expect(r.ranked.map((c) => c.chainId).sort()).toEqual([1, 9]);
    const reasons: Record<number, string> = {};
    for (const e of r.excluded) if (e.chainId !== null) reasons[e.chainId] = e.reason;
    expect(reasons).toEqual({
      2: 'chain_disabled',
      3: 'checkout_not_deployed',
      4: 'quote_stale',
      5: 'quote_from_future',
      6: 'recipient_unsupported',
      7: 'duplicate_chain',
    });
    expect(r.excluded.filter((e) => e.reason === 'invalid_quote')).toHaveLength(2);
    expect(r.excluded.filter((e) => e.reason === 'duplicate_chain')).toHaveLength(1);
  });

  it('returns status none when nothing qualifies', () => {
    const r = suggestCheapestChain([q({ chainId: 1, enabled: false })], pay, { now: NOW });
    expect(r.status).toBe('none');
    expect(r.bestChainId).toBeUndefined();
    expect(suggestCheapestChain([], pay, { now: NOW }).why[0]?.key).toBe('fees.cheapest.why.noneEligible');
  });

  it('rejects adversarial quote fields', () => {
    const bad: Partial<ChainFeeQuote>[] = [
      { gasUnits: 0n },
      { gasUnits: 30_000_001n },
      { maxFeePerGas: 0n },
      { maxFeePerGas: 10n ** 15n + 1n },
      { checkoutBps: 1001 },
      { checkoutBps: -1 },
      { checkoutBps: 1.5 },
      { nativeSymbol: 'eth<script>' },
      { nativeSymbol: '' },
      { name: '' },
      { name: 'x'.repeat(65) },
      { nativeDecimals: 37 },
      { blockTimeMs: 0 },
      { finalityDepth: -1 },
      { quotedAt: -1n },
      { chainId: 0 },
      { checkout: 'maybe' as never },
      { enabled: 'yes' as never },
      { gasUnits: 5 as never },
    ];
    for (const b of bad) {
      const r = suggestCheapestChain([q({ chainId: 1, ...b })], pay, { now: NOW });
      expect(
        r.status,
        JSON.stringify(b, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
      ).toBe('none');
      expect(r.excluded[0]?.reason).toBe('invalid_quote');
    }
    const noBps = { ...q({ chainId: 1 }) } as Partial<ChainFeeQuote>;
    delete (noBps as { checkoutBps?: number }).checkoutBps;
    expect(suggestCheapestChain([noBps as ChainFeeQuote], pay, { now: NOW }).status).toBe('none');
    const strayBps = suggestCheapestChain(
      [q({ chainId: 1, checkout: 'not_enforceable', checkoutBps: 5000 })],
      pay,
      { now: NOW },
    );
    expect(strayBps.status).toBe('none');
  });

  it('throws on structurally invalid calls', () => {
    const t = (f: () => unknown): void => {
      expect(f).toThrow(UxFeesError);
    };
    t(() => suggestCheapestChain('x' as never, pay, { now: NOW }));
    t(() =>
      suggestCheapestChain(
        Array.from({ length: 65 }, () => q({ chainId: 1 })),
        pay,
        { now: NOW },
      ),
    );
    t(() => suggestCheapestChain([], { gross: -1n, tokenDecimals: 6 }, { now: NOW }));
    t(() => suggestCheapestChain([], { gross: 1n, tokenDecimals: 37 }, { now: NOW }));
    t(() => suggestCheapestChain([], pay, { now: -1n }));
    t(() => suggestCheapestChain([], pay, { now: NOW, maxQuoteAgeSeconds: 0n }));
    t(() => suggestCheapestChain([], pay, { now: NOW, maxRateAgeSeconds: 0n }));
    t(() => suggestCheapestChain([], pay, { now: NOW, maxFutureSkewSeconds: 4000n }));
    t(() => suggestCheapestChain([], pay, { now: NOW, tieToleranceBps: 5001 }));
    t(() => suggestCheapestChain([], pay, { now: NOW, switchThresholdBps: -1 }));
  });

  it('honours custom age limits and clock at quote time', () => {
    const fresh = suggestCheapestChain([q({ chainId: 1, quotedAt: NOW - 500n })], pay, {
      now: NOW,
      maxQuoteAgeSeconds: 600n,
    });
    expect(fresh.status).toBe('ok');
    expect(fresh.ranked[0]?.ageSeconds).toBe(500n);
    const sameTick = suggestCheapestChain([q({ chainId: 1, quotedAt: NOW + 30n })], pay, { now: NOW });
    expect(sameTick.ranked[0]?.ageSeconds).toBe(0n);
  });

  it('computes confirm seconds rounded up', () => {
    const r = suggestCheapestChain([q({ chainId: 1, blockTimeMs: 250, finalityDepth: 3 })], pay, {
      now: NOW,
    });
    expect(r.ranked[0]?.confirmSeconds).toBe(1);
  });
});

describe('suggestCheapestChain properties', () => {
  it('fiat mode: the winner is always within tolerance of the true minimum and the ranking is a permutation', () => {
    const arb = fc.array(
      fc.record({
        fee: fc.bigInt({ min: 1n, max: 10n ** 12n }),
        gas: fc.bigInt({ min: 21_000n, max: 500_000n }),
        fin: fc.integer({ min: 0, max: 50 }),
      }),
      { minLength: 2, maxLength: 8 },
    );
    fc.assert(
      fc.property(arb, fc.bigInt({ min: 0n, max: 10n ** 12n }), (specs, gross) => {
        const quotes = specs.map((s, i) =>
          q({ chainId: i + 1, maxFeePerGas: s.fee, gasUnits: s.gas, finalityDepth: s.fin }),
        );
        const r = suggestCheapestChain(quotes, { gross, tokenDecimals: 6 }, { now: NOW }, rates);
        expect(r.mode).toBe('fiat');
        const totals = r.ranked.map((c) => c.totalFiatMicro as bigint);
        const min = totals.reduce((a, b) => (a < b ? a : b));
        const best = r.ranked[0]?.totalFiatMicro as bigint;
        expect((best - min) * 10_000n).toBeLessThanOrEqual(min * 100n + 10_000n);
        expect(r.ranked.map((c) => c.chainId).sort((a, b) => a - b)).toEqual(quotes.map((x) => x.chainId));
        expect(r.bestChainId).toBe(r.ranked[0]?.chainId);
      }),
    );
  });
});
