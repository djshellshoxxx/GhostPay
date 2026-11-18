import fc from 'fast-check';
import { getAddress } from 'viem/utils';
import { describe, expect, it, vi } from 'vitest';
import { fiatToTokenAmount, readPrice, type AggregatorReader, type RoundData } from './quote.js';

const PRICE = getAddress('0x00000000000000000000000000000000000000f1');
const SEQUENCER = getAddress('0x00000000000000000000000000000000000000f2');
const REFERENCE = getAddress('0x00000000000000000000000000000000000000f3');
const NOW = 1_800_000_000n;
const options = { now: NOW, maxAgeSeconds: 300n, expectedDecimals: 8 };
const round = (over: Partial<RoundData> = {}): RoundData => ({
  roundId: 1n, answeredInRound: 1n, answer: 100_000_000n, startedAt: NOW - 10n, updatedAt: NOW - 10n, ...over,
});
const source = (answer = 100_000_000n, decimals = 8) => ({
  decimals: vi.fn(() => Promise.resolve(decimals)),
  latestRoundData: vi.fn(() => Promise.resolve(round({ answer }))),
});

describe('configured sequencer protection', () => {
  function setup(over: Partial<RoundData> = {}) {
    const latestRoundData = vi.fn((feed: string) => Promise.resolve(feed === SEQUENCER
      ? round({ answer: 0n, startedAt: NOW - 3601n, ...over }) : round()));
    return { decimals: vi.fn(() => Promise.resolve(8)), latestRoundData };
  }

  it('checks sequencer before reading price and accepts only after the full grace period', async () => {
    const reader = setup();
    await expect(readPrice(reader, PRICE, { ...options, sequencerFeed: SEQUENCER })).resolves.toMatchObject({ answer: 100_000_000n });
    expect(reader.latestRoundData.mock.calls.map(([feed]) => feed)).toEqual([SEQUENCER, PRICE]);
    expect(reader.decimals).toHaveBeenCalledExactlyOnceWith(PRICE);
  });

  it.each([
    ['down', { answer: 1n }],
    ['unknown status', { answer: 2n }],
    ['not initialized', { startedAt: 0n }],
    ['future transition', { startedAt: NOW + 1n }],
    ['within grace', { startedAt: NOW - 3599n }],
    ['exact grace boundary', { startedAt: NOW - 3600n }],
  ])('refuses %s before requesting a price', async (_name, invalid) => {
    const reader = setup(invalid);
    await expect(readPrice(reader, PRICE, { ...options, sequencerFeed: SEQUENCER })).rejects.toThrow(/QUOTE_FAILED: sequencer/);
    expect(reader.latestRoundData).toHaveBeenCalledExactlyOnceWith(SEQUENCER);
    expect(reader.decimals).not.toHaveBeenCalled();
  });

  it('does not apply price freshness to a long-running healthy sequencer status', async () => {
    const reader = setup({ startedAt: NOW - 1_000_000n, updatedAt: NOW - 1_000_000n });
    await expect(readPrice(reader, PRICE, { ...options, sequencerFeed: SEQUENCER })).resolves.toBeDefined();
  });

  it('fails closed on unreadable or malformed sequencer state without leaking causes', async () => {
    const broken: AggregatorReader = { decimals: vi.fn(), latestRoundData: () => Promise.reject(new Error('private endpoint key')) };
    await expect(readPrice(broken, PRICE, { ...options, sequencerFeed: SEQUENCER })).rejects.toThrow(/^QUOTE_FAILED: sequencer read failed$/);
    for (const invalid of [{ answer: 0 as unknown as bigint }, { startedAt: -1n }, { updatedAt: NOW + 61n }]) {
      await expect(readPrice(setup(invalid), PRICE, { ...options, sequencerFeed: SEQUENCER })).rejects.toThrow(/QUOTE_FAILED: sequencer/);
    }
  });

  it('refuses malformed or reused configured feeds before any reads', async () => {
    for (const sequencerFeed of ['invalid', '0x0000000000000000000000000000000000000000', PRICE]) {
      const reader = setup();
      await expect(readPrice(reader, PRICE, { ...options, sequencerFeed })).rejects.toThrow(/sequencer feed/);
      expect(reader.latestRoundData).not.toHaveBeenCalled();
      expect(reader.decimals).not.toHaveBeenCalled();
    }
  });
});

describe('configured reference-feed protection', () => {
  const reference = (reader: AggregatorReader) => ({ reader, feed: REFERENCE, expectedDecimals: 8, maxAgeSeconds: 300n });

  it('accepts the exact 1% boundary with different feed precision and rejects one unit beyond it', async () => {
    const second = { ...reference(source(10n ** 18n, 18)), expectedDecimals: 18 };
    await expect(readPrice(source(101_000_000n), PRICE, { ...options, reference: second })).resolves.toBeDefined();
    await expect(readPrice(source(101_000_001n), PRICE, { ...options, reference: second })).rejects.toThrow(/price deviation/);
    await expect(readPrice(source(100_000_000n), PRICE, { ...options, reference: reference(source(101_000_001n)) })).rejects.toThrow(/price deviation/);
  });

  it('revalidates reference freshness, configured decimals and read errors', async () => {
    const stale: AggregatorReader = source();
    stale.latestRoundData = () => Promise.resolve(round({ updatedAt: NOW - 301n }));
    await expect(readPrice(source(), PRICE, { ...options, reference: reference(stale) })).rejects.toThrow(/stale/);
    await expect(readPrice(source(), PRICE, { ...options, reference: reference(source(100_000_000n, 18)) })).rejects.toThrow(/configured decimals/);
    const broken: AggregatorReader = source();
    broken.latestRoundData = () => Promise.reject(new Error('private endpoint key'));
    await expect(readPrice(source(), PRICE, { ...options, reference: reference(broken) })).rejects.toThrow(/^QUOTE_FAILED: feed read failed$/);
  });

  it('rejects identical feed addresses and malformed reference configuration before reads', async () => {
    for (const invalid of [{ feed: PRICE }, { feed: 'invalid' }, { expectedDecimals: 31 }, { maxAgeSeconds: 0n }]) {
      const reader = source();
      const second = source();
      await expect(readPrice(reader, PRICE, { ...options, reference: { ...reference(second), ...invalid } })).rejects.toThrow(/reference/);
      expect(reader.latestRoundData).not.toHaveBeenCalled();
      expect(second.latestRoundData).not.toHaveBeenCalled();
    }
  });

  it('property: equivalent values with different precision agree without Number conversion', async () => {
    await fc.assert(fc.asyncProperty(fc.bigInt({ min: 1n, max: 10n ** 30n }), fc.integer({ min: 0, max: 12 }), async (answer, precision) => {
      const second = { ...reference(source(answer * 10n ** BigInt(precision), precision)), expectedDecimals: precision };
      await expect(readPrice(source(answer, 0), PRICE, { ...options, expectedDecimals: 0, reference: second })).resolves.toMatchObject({ answer });
    }), { numRuns: 30 });
  });
});

describe('optional USD peg protection', () => {
  it('accepts inclusive 2% boundaries and refuses one unit outside either bound', async () => {
    for (const answer of [98_000_000n, 100_000_000n, 102_000_000n]) {
      await expect(readPrice(source(answer), PRICE, { ...options, enforceUsdPeg: true })).resolves.toBeDefined();
    }
    for (const answer of [97_999_999n, 102_000_001n]) {
      await expect(readPrice(source(answer), PRICE, { ...options, enforceUsdPeg: true })).rejects.toThrow(/USD peg/);
    }
  });

  it('is explicit and uses the validated precision', async () => {
    await expect(readPrice(source(200_000_000n), PRICE, options)).resolves.toBeDefined();
    await expect(readPrice(source(10n ** 18n, 18), PRICE, { ...options, expectedDecimals: 18, enforceUsdPeg: true })).resolves.toBeDefined();
  });
});

describe('standalone conversion input bounds', () => {
  it('rejects malformed price precision before exponentiation', () => {
    const input = { fiatMinorUnits: 100n, fiatDecimals: 2, fiatCurrency: 'USD', priceQuoteCurrency: 'USD', tokenDecimals: 6, side: 'payer' } as const;
    for (const decimals of [-1, 31, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fiatToTokenAmount({ ...input, price: { answer: 100_000_000n, decimals } })).toThrow(/QUOTE_FAILED: decimals/);
    }
  });

  it('rejects oversized or malformed standalone price answers', () => {
    const input = { fiatMinorUnits: 100n, fiatDecimals: 2, fiatCurrency: 'USD', priceQuoteCurrency: 'USD', tokenDecimals: 6, side: 'payer' } as const;
    for (const answer of [1n << 255n, 1 as unknown as bigint]) {
      expect(() => fiatToTokenAmount({ ...input, price: { answer, decimals: 8 } })).toThrow(/QUOTE_FAILED: price/);
    }
  });

  it('rejects malformed quote clock and skew bounds before network reads', async () => {
    for (const invalid of [{ now: 0n }, { now: -1n }, { now: 1n << 256n }, { now: 1 as unknown as bigint },
      { maxFutureSkewSeconds: -1n }, { maxFutureSkewSeconds: 604_801n }, { maxFutureSkewSeconds: 1 as unknown as bigint }]) {
      const reader = source();
      await expect(readPrice(reader, PRICE, { ...options, ...invalid })).rejects.toThrow(/QUOTE_FAILED:/);
      expect(reader.latestRoundData).not.toHaveBeenCalled();
      expect(reader.decimals).not.toHaveBeenCalled();
    }
  });
});
