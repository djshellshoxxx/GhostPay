import type { RelayerConfig, PoolEntry } from './config.js';

/**
 * Minimum relayer fee in fee-asset units for the current gas price (stateless, reproducible from
 * `/v1/info` parameters, SP-REL-5): `gasEstimate * min(gasPrice, cap) * (1 + margin) * rate`, rounded up.
 */
export function quoteFee(cfg: RelayerConfig, pool: PoolEntry, gasPrice: bigint): bigint {
  const price = gasPrice > cfg.maxGasPrice ? cfg.maxGasPrice : gasPrice;
  const costWei = cfg.gasEstimate * price;
  const withMargin = costWei * BigInt(10_000 + cfg.marginBps);
  const den = 10_000n * pool.rate.den;
  const num = withMargin * pool.rate.num;
  return (num + den - 1n) / den;
}

/** Lowest fee the relay endpoint accepts for a quote of `fee` (price drift slack). */
export function minAcceptableFee(cfg: RelayerConfig, fee: bigint): bigint {
  return (fee * BigInt(10_000 - cfg.slackBps) + 9_999n) / 10_000n;
}

/** Maximum fee for a withdrawn value under the relayer's cap. */
export function feeCap(cfg: RelayerConfig, withdrawnValue: bigint): bigint {
  return (withdrawnValue * BigInt(cfg.maxFeeBps)) / 10_000n;
}
