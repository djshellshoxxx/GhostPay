import { fail } from '../errors.js';

/** Static, non-secret description of an EVM chain GhostPay can target. */
export interface ChainConfig {
  /** EIP-155 chain id. */
  readonly chainId: number;
  /** Human-readable name. */
  readonly name: string;
  /** Native currency symbol (the "gas token"). */
  readonly nativeSymbol: string;
  /** Native currency decimals (18 on every listed chain). */
  readonly nativeDecimals: 18;
  readonly testnet: boolean;
  /**
   * Whether the chain may be used. Mainnets stay `false` until a verified
   * deployment manifest exists (FEE_SCHEDULE principle 4, ADR-0007).
   */
  readonly enabled: boolean;
  /** Blocks of depth after which the scanner treats logs as final; also the reorg roll-back depth. */
  readonly finalityDepth: number;
  /** Maximum block span (inclusive range length) of one `eth_getLogs` request issued by the scanner. */
  readonly getLogsMaxRange: number;
  /** Nominal block time in milliseconds (informational; used for polling cadence only). */
  readonly blockTimeMs: number;
}

const base = { nativeDecimals: 18 } as const;

/**
 * Chain table. finalityDepth, getLogsMaxRange and blockTimeMs are conservative
 * engineering defaults, NOT provider-verified values (see TODO-VERIFY.md).
 */
export const CHAINS: readonly ChainConfig[] = Object.freeze([
  { ...base, chainId: 11155111, name: 'Ethereum Sepolia', nativeSymbol: 'ETH', testnet: true, enabled: true, finalityDepth: 64, getLogsMaxRange: 1000, blockTimeMs: 12000 },
  { ...base, chainId: 84532, name: 'Base Sepolia', nativeSymbol: 'ETH', testnet: true, enabled: true, finalityDepth: 100, getLogsMaxRange: 1000, blockTimeMs: 2000 },
  { ...base, chainId: 1, name: 'Ethereum', nativeSymbol: 'ETH', testnet: false, enabled: false, finalityDepth: 64, getLogsMaxRange: 1000, blockTimeMs: 12000 },
  { ...base, chainId: 8453, name: 'Base', nativeSymbol: 'ETH', testnet: false, enabled: false, finalityDepth: 100, getLogsMaxRange: 1000, blockTimeMs: 2000 },
  { ...base, chainId: 10, name: 'OP Mainnet', nativeSymbol: 'ETH', testnet: false, enabled: false, finalityDepth: 100, getLogsMaxRange: 1000, blockTimeMs: 2000 },
  { ...base, chainId: 42161, name: 'Arbitrum One', nativeSymbol: 'ETH', testnet: false, enabled: false, finalityDepth: 250, getLogsMaxRange: 1000, blockTimeMs: 250 },
  { ...base, chainId: 137, name: 'Polygon PoS', nativeSymbol: 'POL', testnet: false, enabled: false, finalityDepth: 128, getLogsMaxRange: 1000, blockTimeMs: 2000 },
  { ...base, chainId: 56, name: 'BNB Smart Chain', nativeSymbol: 'BNB', testnet: false, enabled: false, finalityDepth: 40, getLogsMaxRange: 1000, blockTimeMs: 750 },
  { ...base, chainId: 43114, name: 'Avalanche C-Chain', nativeSymbol: 'AVAX', testnet: false, enabled: false, finalityDepth: 12, getLogsMaxRange: 1000, blockTimeMs: 2000 },
]);

/**
 * Looks up a chain by id.
 *
 * @param chainId EIP-155 id.
 * @returns The config, or `undefined` for an unknown chain.
 */
export function findChain(chainId: number): ChainConfig | undefined {
  return CHAINS.find((c) => c.chainId === chainId);
}

/**
 * Returns the config of a known AND enabled chain.
 *
 * @param chainId EIP-155 id.
 * @returns The chain config.
 * @throws {ChainAdapterError} `CHAIN_DISABLED` for unknown or disabled chains (fail closed).
 */
export function requireEnabledChain(chainId: number): ChainConfig {
  const c = findChain(chainId);
  if (c === undefined || !c.enabled) return fail('CHAIN_DISABLED', `chain ${String(chainId)} is unknown or disabled`);
  return c;
}
