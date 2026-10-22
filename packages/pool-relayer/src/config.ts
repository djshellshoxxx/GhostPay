import { POOL_CHAIN_IDS } from '@ghostpay/pool-sdk';
import { getAddress, type Address } from 'viem';

/** One pool the relayer serves. */
export interface PoolEntry {
  readonly chainId: number;
  readonly pool: Address;
  /** Fee conversion: fee-asset units per 1 wei of gas cost, as `num/den`. Native pools: 1/1. */
  readonly rate: { readonly num: bigint; readonly den: bigint };
}

/** Relayer configuration (no secrets: the signing key is held by the {@link ChainPort}). */
export interface RelayerConfig {
  readonly pools: readonly PoolEntry[];
  readonly feeTo: Address;
  /** Cap on the fee the relayer accepts, bps of the withdrawn value (pool max is 1000). */
  readonly maxFeeBps: number;
  /** Margin over gas cost in the quote, bps. */
  readonly marginBps: number;
  /** A relayed fee may be this many bps below the current quote (price drift between quote and relay). */
  readonly slackBps: number;
  /** Gas used for the withdraw, for quoting. */
  readonly gasEstimate: bigint;
  /** Largest send gas limit (simulated estimate plus margin) the relayer accepts, bps of `gasEstimate`. Bounds what a recipient can make the relayer pay beyond the fee. */
  readonly gasCapBps: number;
  /** Refuse to quote or send above this gas price (wei). */
  readonly maxGasPrice: bigint;
  readonly quoteTtlSeconds: number;
  /** A request whose deadline is closer than this is refused. */
  readonly minDeadlineSeconds: number;
  readonly allowedOrigins: readonly string[];
  readonly host: string;
  readonly port: number;
  readonly trustedProxies: readonly string[];
  readonly version: string;
}

/** Defaults. */
export const DEFAULTS = Object.freeze({
  maxFeeBps: 500,
  marginBps: 2000,
  slackBps: 1000,
  gasEstimate: 600_000n,
  gasCapBps: 15_000,
  maxGasPrice: 200_000_000_000n,
  quoteTtlSeconds: 600,
  minDeadlineSeconds: 60,
  host: '127.0.0.1',
  port: 8788,
  version: '0.1.0',
});

/**
 * Validates and normalises a config.
 *
 * @throws Error on any invalid field, or any chain outside {31337, 11155111, 84532}.
 */
export function buildConfig(c: Partial<RelayerConfig> & Pick<RelayerConfig, 'pools' | 'feeTo'>): RelayerConfig {
  const cfg: RelayerConfig = {
    ...DEFAULTS,
    allowedOrigins: [],
    trustedProxies: [],
    ...c,
    feeTo: getAddress(c.feeTo),
    pools: c.pools.map((p) => ({ ...p, pool: getAddress(p.pool) })),
  };
  if (cfg.pools.length === 0) throw new Error('config: no pools');
  const seen = new Set<string>();
  for (const p of cfg.pools) {
    if (!POOL_CHAIN_IDS.includes(p.chainId)) throw new Error(`config: chain ${String(p.chainId)} is not a supported testnet`);
    if (p.rate.num <= 0n || p.rate.den <= 0n) throw new Error('config: rate must be positive');
    const k = `${String(p.chainId)}:${p.pool}`;
    if (seen.has(k)) throw new Error('config: duplicate pool');
    seen.add(k);
  }
  if (!Number.isInteger(cfg.maxFeeBps) || cfg.maxFeeBps < 0 || cfg.maxFeeBps > 1000) throw new Error('config: maxFeeBps must be 0..1000');
  if (!Number.isInteger(cfg.marginBps) || cfg.marginBps < 0 || cfg.marginBps > 10_000) throw new Error('config: marginBps must be 0..10000');
  if (!Number.isInteger(cfg.slackBps) || cfg.slackBps < 0 || cfg.slackBps > 5000) throw new Error('config: slackBps must be 0..5000');
  if (cfg.gasEstimate <= 0n || cfg.maxGasPrice <= 0n) throw new Error('config: gas values must be positive');
  if (!Number.isInteger(cfg.gasCapBps) || cfg.gasCapBps < 10_000 || cfg.gasCapBps > 100_000) throw new Error('config: gasCapBps must be 10000..100000');
  if (!Number.isInteger(cfg.quoteTtlSeconds) || cfg.quoteTtlSeconds < 1) throw new Error('config: quoteTtlSeconds must be >= 1');
  if (!Number.isInteger(cfg.minDeadlineSeconds) || cfg.minDeadlineSeconds < 0 || cfg.minDeadlineSeconds > cfg.quoteTtlSeconds) throw new Error('config: minDeadlineSeconds must be 0..quoteTtlSeconds');
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) throw new Error('config: port out of range');
  return Object.freeze(cfg);
}
