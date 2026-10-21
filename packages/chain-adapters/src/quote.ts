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

/** A configured price feed. */
export interface FeedConfig {
  readonly chainId: number;
  readonly address: Address;
  /** Quoted asset, e.g. `ETH`. */
  readonly base: string;
  /** Quote currency of the answer, e.g. `USD`. */
  readonly quote: string;
}

/**
 * Chainlink feed registry. EMPTY on purpose: no feed address could be verified against Chainlink
 * documentation in this environment (see TODO-VERIFY.md). Callers pass an explicit feed.
 */
export const FEEDS: readonly FeedConfig[] = Object.freeze([]);

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

/** Options for {@link readPrice}. */
export interface PriceOptions {
  /** Current unix seconds. */
  readonly now: bigint;
  /** Maximum accepted age of `updatedAt` in seconds, `1..604800`. */
  readonly maxAgeSeconds: bigint;
  /** Tolerated clock skew for an `updatedAt` slightly in the future, default 60 s. */
  readonly maxFutureSkewSeconds?: bigint;
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
 * future, decimals outside 0..30, and values outside the int256/uint256 ranges. The legacy
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
  if (opts.maxAgeSeconds < 1n || opts.maxAgeSeconds > 604_800n) return fail('QUOTE_FAILED', 'maxAge out of range');
  const skew = opts.maxFutureSkewSeconds ?? 60n;
  const addr = getAddress(feed);
  let decimals: number;
  let r: RoundData;
  try {
    [decimals, r] = await Promise.all([reader.decimals(addr), reader.latestRoundData(addr)]);
  } catch {
    return fail('QUOTE_FAILED', 'feed read failed');
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return fail('QUOTE_FAILED', 'decimals');
  for (const v of [r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound]) {
    if (typeof v !== 'bigint') return fail('QUOTE_FAILED', 'malformed round data');
  }
  if (r.answer <= 0n || r.answer > (1n << 255n) - 1n) return fail('QUOTE_FAILED', 'non-positive or oversized answer');
  if (r.roundId <= 0n || r.roundId > MAX_UINT256) return fail('QUOTE_FAILED', 'roundId');
  if (r.answeredInRound < r.roundId) return fail('QUOTE_FAILED', 'answer from an earlier round');
  if (r.updatedAt <= 0n) return fail('QUOTE_FAILED', 'round not updated');
  if (r.updatedAt > opts.now + skew) return fail('QUOTE_FAILED', 'updatedAt in the future');
  if (opts.now > r.updatedAt && opts.now - r.updatedAt > opts.maxAgeSeconds) return fail('QUOTE_FAILED', 'stale price');
  return { answer: r.answer, decimals, updatedAt: r.updatedAt, roundId: r.roundId };
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
  if (p.price.answer <= 0n) return fail('QUOTE_FAILED', 'price');
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
