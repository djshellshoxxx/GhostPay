import { readQualifiedPrice, type AggregatorReader, type QualifiedFeed, type Price, type RoundData } from '@ghostpay/chain-adapters';
import type { AlertSink } from './alerts.js';
import { RelayerError } from './errors.js';
import type { Metrics } from './metrics.js';
import { FixedStablePriceSource, type AllowedToken, type TokenPriceSource } from './pricing.js';

export interface NativeFeedSource {
  readonly reader: AggregatorReader;
  readonly feed: QualifiedFeed;
  readonly maxAgeSeconds: number;
}
/** Explicit feed or legacy fixed mode. A failed configured feed never falls back to an operator constant. */
export class ConfiguredPriceSource implements TokenPriceSource {
  private readonly fixed: FixedStablePriceSource;
  private readonly pending = new Map<number, Promise<{ price: Price; validUntil: number }>>();
  private readonly seen = new Map<number, number>();
  public constructor(fixed: ReadonlyMap<number, bigint>, private readonly feeds: ReadonlyMap<number, NativeFeedSource>,
    private readonly alerts: AlertSink, private readonly metrics: Metrics, private readonly now: () => number) {
    this.fixed = new FixedStablePriceSource(fixed);
    metrics.gauge('relayer_price_age_seconds', 'Age of the last observed configured native/USD feed timestamp.', () =>
      [...this.seen].map(([chainId, updatedAt]) => ({ labels: { chain_id: String(chainId) }, value: Math.max(0, Math.floor(now() / 1000) - updatedAt) })));
  }
  public async nativeToTokenUnits(chainId: number, token: AllowedToken, nativeWei: bigint): Promise<bigint> {
    return (await this.quoteNativeToTokenUnits(chainId, token, nativeWei)).amount;
  }
  public async quoteNativeToTokenUnits(chainId: number, token: AllowedToken, nativeWei: bigint): Promise<{ amount: bigint; validUntil?: number; priceRoundId?: bigint }> {
    const source = this.feeds.get(chainId);
    if (source === undefined) return { amount: await this.fixed.nativeToTokenUnits(chainId, token, nativeWei) };
    let pending = this.pending.get(chainId);
    if (pending === undefined) {
      pending = this.read(chainId, source).finally(() => { this.pending.delete(chainId); }); this.pending.set(chainId, pending);
    }
    const { price, validUntil } = await pending;
    if (typeof nativeWei !== 'bigint' || nativeWei < 0n || nativeWei >= 1n << 256n || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36)
      throw new RelayerError(503, 'price_unavailable');
    const numerator = nativeWei * price.answer * 10n ** BigInt(token.decimals);
    const denominator = 10n ** (18n + BigInt(price.decimals));
    const amount = (numerator + denominator - 1n) / denominator;
    if (amount >= 1n << 256n) throw new RelayerError(503, 'price_unavailable');
    return { amount, validUntil, priceRoundId: price.roundId };
  }
  private stale(chainId: number): never {
    this.metrics.inc('relayer_price_stale_total', { chain_id: chainId }); this.alerts.send({ kind: 'price_stale', chainId });
    throw new RelayerError(503, 'price_stale');
  }
  private async read(chainId: number, source: NativeFeedSource): Promise<{ price: Price; validUntil: number }> {
    const now = BigInt(Math.floor(this.now() / 1000)); let observed: RoundData | undefined;
    const reader: AggregatorReader = { decimals: (feed) => source.reader.decimals(feed), latestRoundData: async (feed) => {
      const round = await source.reader.latestRoundData(feed);
      if (feed.toLowerCase() === source.feed.address.toLowerCase()) observed = round;
      return round;
    } };
    let price: Awaited<ReturnType<typeof readQualifiedPrice>>;
    try {
      price = await readQualifiedPrice(reader, source.feed, now, BigInt(source.maxAgeSeconds));
    } catch {
      if (typeof observed?.updatedAt === 'bigint' && observed.updatedAt > 0n && observed.updatedAt <= now && now - observed.updatedAt > BigInt(source.maxAgeSeconds)) {
        this.seen.set(chainId, Number(observed.updatedAt)); return this.stale(chainId);
      }
      throw new RelayerError(503, 'price_unavailable');
    }
    this.seen.set(chainId, Number(price.updatedAt));
    const validUntil = Math.min(Number(price.expiresAt), Number(price.updatedAt) + source.maxAgeSeconds);
    if (!Number.isSafeInteger(validUntil) || validUntil <= Math.floor(this.now() / 1000)) return this.stale(chainId);
    return { price, validUntil };
  }
}
