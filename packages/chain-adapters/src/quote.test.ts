import fc from 'fast-check';
import { encodeAbiParameters, getAddress } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { ChainAdapterError } from './errors.js';
import { findChain } from './config/chains.js';
import { FEEDS, createAggregatorReader, fiatToTokenAmount, findFeed, isQuoteAvailable, readPrice, type AggregatorReader, type RoundData } from './quote.js';
import { createClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import { SEPOLIA } from './fixtures.testutil.js';
import { MAX_UINT256 } from './types.js';

const FEED = getAddress('0x00000000000000000000000000000000000000f1');
const NOW = 1_800_000_000n;
const round = (over: Partial<RoundData> = {}): RoundData => ({
  roundId: 100n, answer: 2_000_00000000n, startedAt: NOW - 100n, updatedAt: NOW - 10n, answeredInRound: 100n, ...over,
});
const reader = (r: RoundData, decimals = 8): AggregatorReader => ({ decimals: () => Promise.resolve(decimals), latestRoundData: () => Promise.resolve(r) });
const opts = { now: NOW, maxAgeSeconds: 3600n };
const rejects = (r: RoundData, re: RegExp, decimals = 8, o = opts) => expect(readPrice(reader(r, decimals), FEED, o)).rejects.toThrow(re);

describe('readPrice', () => {
  it('accepts a healthy round', async () => {
    expect(await readPrice(reader(round()), FEED, opts)).toEqual({ answer: 2_000_00000000n, decimals: 8, updatedAt: NOW - 10n, roundId: 100n });
  });
  it('boundary: age exactly maxAge is ok, +1 is stale', async () => {
    await expect(readPrice(reader(round({ updatedAt: NOW - 3600n })), FEED, opts)).resolves.toBeDefined();
    await rejects(round({ updatedAt: NOW - 3601n }), /stale/);
  });
  it('accepts small future skew, rejects large', async () => {
    await expect(readPrice(reader(round({ updatedAt: NOW + 60n })), FEED, opts)).resolves.toBeDefined();
    await rejects(round({ updatedAt: NOW + 61n }), /future/);
    await expect(readPrice(reader(round({ updatedAt: NOW + 500n })), FEED, { ...opts, maxFutureSkewSeconds: 600n })).resolves.toBeDefined();
  });
  it('zero / negative / oversized answers', async () => {
    await rejects(round({ answer: 0n }), /non-positive/);
    await rejects(round({ answer: -1n }), /non-positive/);
    await rejects(round({ answer: 1n << 255n }), /oversized/);
  });
  it('round integrity', async () => {
    await rejects(round({ roundId: 0n, answeredInRound: 0n }), /roundId/);
    await rejects(round({ answeredInRound: 99n }), /earlier round/);
    await expect(readPrice(reader(round({ answeredInRound: 101n })), FEED, opts)).resolves.toBeDefined();
    await rejects(round({ updatedAt: 0n }), /not updated/);
    await rejects(round({ roundId: MAX_UINT256 + 1n, answeredInRound: MAX_UINT256 + 1n }), /roundId/);
    await rejects({ ...round(), answer: 5 as unknown as bigint }, /malformed/);
  });
  it('decimals', async () => {
    for (const d of [-1, 31, 1.5, Number.NaN]) await rejects(round(), /decimals/, d);
    await expect(readPrice(reader(round(), 0), FEED, opts)).resolves.toMatchObject({ decimals: 0 });
  });
  it('feed address and options', async () => {
    await expect(readPrice(reader(round()), '0x0000000000000000000000000000000000000000', opts)).rejects.toThrow(/feed address/);
    await expect(readPrice(reader(round()), 'nope', opts)).rejects.toThrow(/feed address/);
    await expect(readPrice(reader(round()), FEED, { ...opts, maxAgeSeconds: 0n })).rejects.toThrow(/maxAge/);
    await expect(readPrice(reader(round()), FEED, { ...opts, maxAgeSeconds: 604_801n })).rejects.toThrow(/maxAge/);
  });
  it('fails closed when the feed read throws (no leakage of the cause)', async () => {
    const r: AggregatorReader = { decimals: () => Promise.reject(new Error('secret https://k@x')), latestRoundData: () => Promise.resolve(round()) };
    await expect(readPrice(r, FEED, opts)).rejects.toThrow(/^QUOTE_FAILED: feed read failed$/);
  });
  it('registry holds only sourced, checksummed, testnet entries; mainnets and unsourced feeds stay absent', () => {
    for (const f of FEEDS) {
      expect(getAddress(f.address)).toBe(f.address);
      expect(f.sourceRef).toMatch(/^docs\/chains\/SOURCES-\d{4}-\d{2}-\d{2}\.md \(retrieved \d{4}-\d{2}-\d{2}\)$/);
      expect(f.sourceRef).not.toMatch(/https?:/);
      expect(findChain(f.chainId)?.testnet).toBe(true);
      expect(f.quote).toBe('USD');
    }
    expect(findFeed(1, 'ETH', 'USD')).toBeUndefined();
    expect(findFeed(8453, 'ETH', 'USD')).toBeUndefined();
    // Base Sepolia: no Chainlink-published source could be fetched, so it must stay fail-closed.
    expect(findFeed(84532, 'ETH', 'USD')).toBeUndefined();
    expect(findFeed(11155111, 'ETH', 'USD')?.address).toBe('0x694AA1769357215DE4FAC081bf1f309aDC325306');
    expect(findFeed(11155111, 'ETH', 'EUR')).toBeUndefined();
  });
  it('isQuoteAvailable is true only where a feed exists', () => {
    expect(isQuoteAvailable(11155111, 'ETH', 'USD')).toBe(true);
    expect(isQuoteAvailable(11155111, 'USDC', 'USD')).toBe(false);
    expect(isQuoteAvailable(84532, 'ETH', 'USD')).toBe(false);
    expect(isQuoteAvailable(1, 'ETH', 'USD')).toBe(false);
  });
});

describe('fiatToTokenAmount', () => {
  const base = { fiatDecimals: 2, fiatCurrency: 'USD', priceQuoteCurrency: 'USD' } as const;
  // ETH at $2000.00000000 (8 decimals); $10.00 -> 0.005 ETH
  it('converts exactly', () => {
    expect(fiatToTokenAmount({ ...base, fiatMinorUnits: 1000n, price: { answer: 2_000_00000000n, decimals: 8 }, tokenDecimals: 18, side: 'payer' })).toBe(5_000_000_000_000_000n);
  });
  it('USDC at $1.00: $10.00 -> 10_000_000', () => {
    expect(fiatToTokenAmount({ ...base, fiatMinorUnits: 1000n, price: { answer: 1_0000_0000n, decimals: 8 }, tokenDecimals: 6, side: 'payer' })).toBe(10_000_000n);
  });
  it('rounds up for the payer and down for the seller', () => {
    const p = { ...base, fiatMinorUnits: 1n, price: { answer: 3_00000000n, decimals: 8 }, tokenDecimals: 2 };
    // 1 cent / $3 = 0.00333 tokens = 0.333 units of 0.01 -> payer: 1, seller: 0 (rejected as zero)
    expect(fiatToTokenAmount({ ...p, side: 'payer' })).toBe(1n);
    expect(() => fiatToTokenAmount({ ...p, side: 'seller' })).toThrow(/zero/);
    const q = { ...base, fiatMinorUnits: 100n, price: { answer: 3_00000000n, decimals: 8 }, tokenDecimals: 6 };
    expect(fiatToTokenAmount({ ...q, side: 'payer' })).toBe(333_334n);
    expect(fiatToTokenAmount({ ...q, side: 'seller' })).toBe(333_333n);
  });
  it('property: payer amount >= seller amount, differ by at most 1, and payer*price >= fiat', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), fc.bigInt({ min: 1n, max: 10n ** 14n }), fc.integer({ min: 0, max: 18 }), (fiat, answer, td) => {
        const args = { ...base, fiatMinorUnits: fiat, price: { answer, decimals: 8 }, tokenDecimals: td };
        let up: bigint;
        try { up = fiatToTokenAmount({ ...args, side: 'payer' }); } catch { return; }
        expect(up * answer * 100n >= fiat * 10n ** BigInt(td) * 10n ** 8n).toBe(true);
        const down = (() => { try { return fiatToTokenAmount({ ...args, side: 'seller' }); } catch { return 0n; } })();
        expect(up - down === 0n || up - down === 1n).toBe(true);
      }),
    );
  });
  it('fails closed', () => {
    const ok = { ...base, fiatMinorUnits: 1000n, price: { answer: 1n, decimals: 8 }, tokenDecimals: 6, side: 'payer' } as const;
    expect(() => fiatToTokenAmount({ ...ok, priceQuoteCurrency: 'EUR' })).toThrow(/currency/);
    expect(() => fiatToTokenAmount({ ...ok, fiatMinorUnits: 0n })).toThrow(/positive/);
    expect(() => fiatToTokenAmount({ ...ok, fiatMinorUnits: -5n })).toThrow(/positive/);
    expect(() => fiatToTokenAmount({ ...ok, price: { answer: 0n, decimals: 8 } })).toThrow(/price/);
    expect(() => fiatToTokenAmount({ ...ok, tokenDecimals: 37 })).toThrow(/decimals/);
    expect(() => fiatToTokenAmount({ ...ok, fiatDecimals: -1 })).toThrow(/decimals/);
    expect(() => fiatToTokenAmount({ ...ok, tokenDecimals: 1.5 })).toThrow(/decimals/);
    expect(() => fiatToTokenAmount({ ...ok, fiatMinorUnits: 10n ** 70n, tokenDecimals: 36 })).toThrow(/overflows/);
    expect(() => fiatToTokenAmount({ ...ok, fiatMinorUnits: 1n, price: { answer: 10n ** 30n, decimals: 30 }, tokenDecimals: 0, side: 'seller' })).toThrow(/zero/);
    try { fiatToTokenAmount({ ...ok, price: { answer: 0n, decimals: 8 } }); } catch (e) { expect(e).toBeInstanceOf(ChainAdapterError); }
  });
});

describe('createAggregatorReader (ABI round trip through a fake node)', () => {
  const node = (decimalsRet: string | null, roundRet: string | null) =>
    createClient(SEPOLIA, 'https://rpc.example.test', {
      transport: fakeTransport((m, p) => {
        if (m === 'eth_chainId') return '0xaa36a7';
        const data = (p[0] as { data: string }).data;
        return data.startsWith('0x313ce567') ? decimalsRet : roundRet; // decimals() selector
      }),
      sleep: noSleep,
    });
  it('decodes decimals and latestRoundData', async () => {
    const dec = encodeAbiParameters([{ type: 'uint8' }], [8]);
    const rd = encodeAbiParameters([{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }], [7n, 123n, 1n, 2n, 7n]);
    const r = createAggregatorReader(await node(dec, rd));
    expect(await r.decimals(FEED)).toBe(8);
    expect(await r.latestRoundData(FEED)).toEqual({ roundId: 7n, answer: 123n, startedAt: 1n, updatedAt: 2n, answeredInRound: 7n });
  });
  it('negative answers survive decoding (and are then rejected by readPrice)', async () => {
    const dec = encodeAbiParameters([{ type: 'uint8' }], [8]);
    const rd = encodeAbiParameters([{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }], [7n, -5n, 1n, NOW, 7n]);
    const r = createAggregatorReader(await node(dec, rd));
    await expect(readPrice(r, FEED, opts)).rejects.toThrow(/non-positive/);
  });
  it('rejects non-hex eth_call results and garbage', async () => {
    const r = createAggregatorReader(await node(null, null));
    await expect(r.decimals(FEED)).rejects.toThrow(/eth_call result/);
    const r2 = createAggregatorReader(await node('0x12', '0x'));
    await expect(r2.decimals(FEED)).rejects.toThrow();
    await expect(readPrice(r2, FEED, opts)).rejects.toThrow(/feed read failed/);
  });
});

import { hasFeedsForChain as _hasFeeds, FEEDS as _FEEDS } from './quote.js';
describe('hasFeedsForChain (G-03)', () => {
  it('tracks FEEDS exactly and is false for unknown chains', () => {
    for (const c of [1, 11155111, 84532, 999]) expect(_hasFeeds(c)).toBe(_FEEDS.some((f) => f.chainId === c));
    expect(_hasFeeds(999)).toBe(false);
    expect(_hasFeeds(84532)).toBe(false);
  });
});
