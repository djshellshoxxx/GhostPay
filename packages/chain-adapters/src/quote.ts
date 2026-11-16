import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress } from 'viem/utils';
import { chainlinkAggregatorAbi } from './abi/chainlinkAggregator.js';
import { fail } from './errors.js';
import type { RpcClient } from './rpc.js';
import { MAX_UINT256, ZERO_ADDRESS, type Address, type Hex } from './types.js';

/** One `latestRoundData()` result. */
export interface RoundData {
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly startedAt: bigint;
  readonly updatedAt: bigint;
  readonly answeredInRound: bigint;
}

/** Injected reader of a Chainlink aggregator (no network in this module). */
export interface AggregatorReader {
  decimals(feed: Address): Promise<number>;
  latestRoundData(feed: Address): Promise<RoundData>;
}

const SOURCE_REF = 'docs/chains/SOURCES-2026-11-04.md (retrieved 2026-11-04)';

/** A configured price feed. */
export interface FeedConfig {
  readonly chainId: number;
  readonly address: Address;
  /** Quoted asset, e.g. `ETH`. */
  readonly base: string;
  /** Quote currency of the answer, e.g. `USD`. */
  readonly quote: string;
  /**
   * Where the address was sourced: a `docs/chains/SOURCES-*.md` path with retrieval date. Never empty. URLs stay in
   * comments and that file so they are not shipped in the web bundle (the bundle egress scan forbids them).
   */
  readonly sourceRef: string;
  /** Answer decimals from the saved Chainlink source (`decimals`, not display `decimalPlaces`). `readPrice` still reads `decimals()` on chain. */
  readonly decimals?: number;
  /**
   * Heartbeat in seconds from the saved Chainlink source. Metadata only: it does not define the tolerated quote
   * age (callers pass an explicit `maxAgeSeconds`) and does not prove the feed is updating.
   */
  readonly heartbeatSec?: number;
}

/**
 * Chainlink feed registry (testnets only). An entry exists only when its proxy address, `decimals` and `heartbeat`
 * were read from saved Chainlink reference data (SOURCES-2026-11-04.md); everything else, mainnets included, stays
 * absent so pricing fails closed. `heartbeatSec` is source metadata, not a freshness guarantee: `readPrice` still
 * enforces an explicit `maxAgeSeconds` on every read.
 */
export const FEEDS: readonly FeedConfig[] = Object.freeze([
  {
    // Sepolia ETH / USD (`eth-usd`; not the hidden `eth-usd-nops`).
    chainId: 11155111,
    address: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
    base: 'ETH',
    quote: 'USD',
    decimals: 8,
    heartbeatSec: 3600,
    sourceRef: SOURCE_REF,
  },
  {
    // Sepolia USDC / USD (`usdc-usd`).
    chainId: 11155111,
    address: '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E',
    base: 'USDC',
    quote: 'USD',
    decimals: 8,
    heartbeatSec: 86_400,
    sourceRef: SOURCE_REF,
  },
  {
    // Base Sepolia ETH / USD (`eth-usd`).
    chainId: 84532,
    address: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
    base: 'ETH',
    quote: 'USD',
    decimals: 8,
    heartbeatSec: 1200,
    sourceRef: SOURCE_REF,
  },
  {
    // Base Sepolia USDC / USD (`usdc-usd`).
    chainId: 84532,
    address: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
    base: 'USDC',
    quote: 'USD',
    decimals: 8,
    heartbeatSec: 86_400,
    sourceRef: SOURCE_REF,
  },
]);

/**
 * Whether a verified feed exists for exactly this chain, base asset and quote currency.
 *
 * @param chainId Chain id.
 * @param base Base asset symbol (native symbol or token symbol).
 * @param quote Quote currency.
 * @returns True when {@link findFeed} would return a feed.
 */
export function isQuoteAvailable(chainId: number, base: string, quote: string): boolean {
  return findFeed(chainId, base, quote) !== undefined;
}

/**
 * Looks up a configured feed.
 *
 * @param chainId Chain id.
 * @param base Base asset symbol.
 * @param quote Quote currency.
 * @returns The feed or `undefined`.
 */
export function findFeed(chainId: number, base: string, quote: string): FeedConfig | undefined {
  return FEEDS.find((f) => f.chainId === chainId && f.base === base && f.quote === quote);
}

/**
 * Whether ANY verified feed exists for a chain. UIs use it to hide fiat-priced invoices where they cannot be paid.
 *
 * @param chainId Chain id.
 * @returns True when `FEEDS` has at least one entry for the chain.
 */
export function hasFeedsForChain(chainId: number): boolean {
  return FEEDS.some((f) => f.chainId === chainId);
}

/** Options for {@link readPrice}. */
export interface PriceOptions {
  /** Current unix seconds. */
  readonly now: bigint;
  /** Maximum accepted age of `updatedAt` in seconds, `1..604800`. */
  readonly maxAgeSeconds: bigint;
  /** Expected decimals from a sourced feed registry. When supplied, on-chain metadata must agree exactly. */
  readonly expectedDecimals?: number;
  /** Tolerated clock skew for an `updatedAt` slightly in the future, default 60 s. */
  readonly maxFutureSkewSeconds?: bigint;
  /** Explicit, separately verified same-chain sequencer feed. Requires status up for more than 3600 seconds. */
  readonly sequencerFeed?: string;
  /**
   * Separately configured price for the same asset/currency. Both prices must be fresh and differ by at most 1%
   * of the lower price. Callers must verify source independence; different addresses alone do not prove it.
   */
  readonly reference?: PriceReference;
  /** Opt-in protection for a known USD-pegged asset: reject a price outside the inclusive $0.98..$1.02 range. */
  readonly enforceUsdPeg?: boolean;
}

/** Explicit second feed configuration. Its reader may use a separate provider; no endpoint is selected here. */
export interface PriceReference {
  readonly reader: AggregatorReader;
  readonly feed: string;
  readonly expectedDecimals: number;
  readonly maxAgeSeconds: bigint;
}

/** A validated price: `answer / 10^decimals` quote-currency units per 1 base unit. */
export interface Price {
  readonly answer: bigint;
  readonly decimals: number;
  readonly updatedAt: bigint;
  readonly roundId: bigint;
}

/**
 * Reads and validates a Chainlink price. Fails closed.
 *
 * @remarks Rejects: `answer <= 0`, `roundId == 0`, `updatedAt == 0`, `answeredInRound < roundId`
 * (stale round carried over), `updatedAt` older than `maxAgeSeconds` or more than the skew in the
 * future, decimals outside 0..30 or different from configured expected decimals, and values outside the int256/uint256 ranges. The legacy
 * `answeredInRound` rule is applied alongside the staleness check (modern aggregators return equal
 * values, so it never rejects a healthy feed).
 *
 * @param reader Aggregator reader.
 * @param feed Feed address.
 * @param opts Time and staleness options.
 * @returns Validated price.
 * @throws {ChainAdapterError} `QUOTE_FAILED`.
 */
export async function readPrice(reader: AggregatorReader, feed: string, opts: PriceOptions): Promise<Price> {
  if (!isAddress(feed, { strict: true }) || feed.toLowerCase() === ZERO_ADDRESS) return fail('QUOTE_FAILED', 'feed address');
  if (typeof opts.now !== 'bigint' || opts.now <= 0n || opts.now > MAX_UINT256) return fail('QUOTE_FAILED', 'current time out of range');
  if (typeof opts.maxAgeSeconds !== 'bigint' || opts.maxAgeSeconds < 1n || opts.maxAgeSeconds > 604_800n) return fail('QUOTE_FAILED', 'maxAge out of range');
  if (opts.expectedDecimals !== undefined && (!Number.isInteger(opts.expectedDecimals) || opts.expectedDecimals < 0 || opts.expectedDecimals > 30)) {
    return fail('QUOTE_FAILED', 'configured decimals are invalid');
  }
  const skew = opts.maxFutureSkewSeconds ?? 60n;
  if (typeof skew !== 'bigint' || skew < 0n || skew > 604_800n) return fail('QUOTE_FAILED', 'future skew out of range');
  const addr = getAddress(feed);
  if (opts.sequencerFeed !== undefined && (!isAddress(opts.sequencerFeed, { strict: true }) ||
    opts.sequencerFeed.toLowerCase() === ZERO_ADDRESS || opts.sequencerFeed.toLowerCase() === addr.toLowerCase())) {
    return fail('QUOTE_FAILED', 'sequencer feed address');
  }
  const reference = opts.reference;
  if (reference !== undefined && (!isAddress(reference.feed, { strict: true }) || reference.feed.toLowerCase() === ZERO_ADDRESS ||
    reference.feed.toLowerCase() === addr.toLowerCase() || !Number.isInteger(reference.expectedDecimals) ||
    reference.expectedDecimals < 0 || reference.expectedDecimals > 30 || typeof reference.maxAgeSeconds !== 'bigint' ||
    reference.maxAgeSeconds < 1n || reference.maxAgeSeconds > 604_800n)) {
    return fail('QUOTE_FAILED', 'reference feed configuration');
  }
  if (opts.sequencerFeed !== undefined) {
    let sequencer: RoundData;
    try { sequencer = await reader.latestRoundData(getAddress(opts.sequencerFeed)); }
    catch { return fail('QUOTE_FAILED', 'sequencer read failed'); }
    // Uptime rounds update on status changes, not price heartbeats. Do not reject a long-running up status as stale.
    if ([sequencer.roundId, sequencer.answer, sequencer.startedAt, sequencer.updatedAt, sequencer.answeredInRound]
      .some((value) => typeof value !== 'bigint') || sequencer.answer !== 0n || sequencer.roundId <= 0n ||
      sequencer.roundId > MAX_UINT256 || sequencer.answeredInRound < sequencer.roundId ||
      sequencer.answeredInRound > MAX_UINT256 || sequencer.startedAt <= 0n || sequencer.startedAt > opts.now ||
      sequencer.updatedAt < sequencer.startedAt || sequencer.updatedAt > MAX_UINT256 || sequencer.updatedAt > opts.now + skew) {
      return fail('QUOTE_FAILED', 'sequencer status invalid or down');
    }
    if (opts.now - sequencer.startedAt <= 3600n) return fail('QUOTE_FAILED', 'sequencer recovery grace period');
  }
  let decimals: number;
  let r: RoundData;
  try {
    [decimals, r] = await Promise.all([reader.decimals(addr), reader.latestRoundData(addr)]);
  } catch {
    return fail('QUOTE_FAILED', 'feed read failed');
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return fail('QUOTE_FAILED', 'decimals');
  if (opts.expectedDecimals !== undefined && decimals !== opts.expectedDecimals) return fail('QUOTE_FAILED', 'feed differs from configured decimals');
  for (const v of [r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound]) {
    if (typeof v !== 'bigint') return fail('QUOTE_FAILED', 'malformed round data');
  }
  if (r.answer <= 0n || r.answer > (1n << 255n) - 1n) return fail('QUOTE_FAILED', 'non-positive or oversized answer');
  if (r.roundId <= 0n || r.roundId > MAX_UINT256) return fail('QUOTE_FAILED', 'roundId');
  if (r.answeredInRound < r.roundId) return fail('QUOTE_FAILED', 'answer from an earlier round');
  if (r.updatedAt <= 0n) return fail('QUOTE_FAILED', 'round not updated');
  if (r.updatedAt > opts.now + skew) return fail('QUOTE_FAILED', 'updatedAt in the future');
  if (opts.now > r.updatedAt && opts.now - r.updatedAt > opts.maxAgeSeconds) return fail('QUOTE_FAILED', 'stale price');
  const price = { answer: r.answer, decimals, updatedAt: r.updatedAt, roundId: r.roundId };
  if (opts.enforceUsdPeg === true) {
    const dollar = 10n ** BigInt(decimals);
    const difference = r.answer >= dollar ? r.answer - dollar : dollar - r.answer;
    if (difference * 100n > dollar * 2n) return fail('QUOTE_FAILED', 'USD peg deviation');
  }
  if (reference !== undefined) {
    const other = await readPrice(reference.reader, reference.feed, {
      now: opts.now, maxAgeSeconds: reference.maxAgeSeconds, expectedDecimals: reference.expectedDecimals,
      maxFutureSkewSeconds: skew,
    });
    const primaryScaled = price.answer * 10n ** BigInt(other.decimals);
    const referenceScaled = other.answer * 10n ** BigInt(price.decimals);
    const lower = primaryScaled < referenceScaled ? primaryScaled : referenceScaled;
    const difference = primaryScaled >= referenceScaled ? primaryScaled - referenceScaled : referenceScaled - primaryScaled;
    if (difference * 100n > lower) return fail('QUOTE_FAILED', 'reference price deviation');
  }
  return price;
}

/** Who bears the rounding. */
export type RoundingSide = 'payer' | 'seller';

/**
 * Converts fiat minor units into token base units.
 *
 * @remarks `amount = fiatMinor * 10^tokenDecimals * 10^priceDecimals / (answer * 10^fiatDecimals)`
 * with exact bigint math. `payer` rounds UP (the payer never underpays the invoice by truncation),
 * `seller` rounds DOWN (for displaying what the seller can expect). The price must be quoted in the
 * invoice currency (`feed.quote === fiatCurrency`); cross-currency conversion is refused.
 *
 * @param p Conversion inputs.
 * @returns Token amount `>= 1`.
 * @throws {ChainAdapterError} `QUOTE_FAILED` on currency mismatch, zero result or uint256 overflow.
 */
export function fiatToTokenAmount(p: {
  readonly fiatMinorUnits: bigint;
  readonly fiatDecimals: number;
  readonly fiatCurrency: string;
  readonly priceQuoteCurrency: string;
  readonly price: Pick<Price, 'answer' | 'decimals'>;
  readonly tokenDecimals: number;
  readonly side: RoundingSide;
}): bigint {
  if (p.fiatCurrency !== p.priceQuoteCurrency) return fail('QUOTE_FAILED', 'currency mismatch');
  if (p.fiatMinorUnits <= 0n) return fail('QUOTE_FAILED', 'fiat amount must be positive');
  for (const d of [p.fiatDecimals, p.tokenDecimals]) {
    if (!Number.isInteger(d) || d < 0 || d > 36) return fail('QUOTE_FAILED', 'decimals');
  }
  if (!Number.isInteger(p.price.decimals) || p.price.decimals < 0 || p.price.decimals > 30) return fail('QUOTE_FAILED', 'decimals');
  if (typeof p.price.answer !== 'bigint' || p.price.answer <= 0n || p.price.answer > (1n << 255n) - 1n) return fail('QUOTE_FAILED', 'price');
  const num = p.fiatMinorUnits * 10n ** BigInt(p.tokenDecimals) * 10n ** BigInt(p.price.decimals);
  const den = p.price.answer * 10n ** BigInt(p.fiatDecimals);
  const out = p.side === 'payer' ? (num + den - 1n) / den : num / den;
  if (out < 1n) return fail('QUOTE_FAILED', 'amount rounds to zero');
  if (out > MAX_UINT256) return fail('QUOTE_FAILED', 'amount overflows uint256');
  return out;
}

/**
 * Builds an {@link AggregatorReader} on top of a verified RPC client (`eth_call`, latest block).
 *
 * @param client Verified client.
 * @returns Reader; malformed return data throws.
 */
export function createAggregatorReader(client: Pick<RpcClient, 'request'>): AggregatorReader {
  const call = async (to: Address, data: Hex): Promise<Hex> => {
    const r = await client.request('eth_call', [{ to, data }, 'latest']);
    if (typeof r !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r)) return fail('QUOTE_FAILED', 'eth_call result');
    return r as Hex;
  };
  return {
    async decimals(feed) {
      const data = encodeFunctionData({ abi: chainlinkAggregatorAbi, functionName: 'decimals' });
      return decodeFunctionResult({ abi: chainlinkAggregatorAbi, functionName: 'decimals', data: await call(feed, data) });
    },
    async latestRoundData(feed) {
      const data = encodeFunctionData({ abi: chainlinkAggregatorAbi, functionName: 'latestRoundData' });
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = decodeFunctionResult({
        abi: chainlinkAggregatorAbi,
        functionName: 'latestRoundData',
        data: await call(feed, data),
      });
      return { roundId, answer, startedAt, updatedAt, answeredInRound };
    },
  };
}
