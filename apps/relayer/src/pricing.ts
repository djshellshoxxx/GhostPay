import type { Address } from 'viem';
import { RelayerError } from './errors.js';
import type { ChainClient } from './chain.js';

/** An allowlisted sweep token as the relayer sees it. */
export interface AllowedToken {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
  /** Supports ERC-2612 (`sweepWithPermit`). */
  readonly permit: boolean;
  /** Pegged 1:1 to USD. v1 supports ONLY such tokens. */
  readonly usdStable: true;
}

/** Source of the current gas price. */
export interface GasPriceSource {
  /**
   * @param chainId Chain.
   * @returns Gas price in wei per gas unit.
   */
  getGasPrice(chainId: number): Promise<bigint>;
}

/** Source of native-to-token conversion. */
export interface TokenPriceSource {
  /**
   * Converts a native-currency cost to token base units, rounding UP.
   *
   * @param chainId Chain.
   * @param token Allowlisted token.
   * @param nativeWei Cost in wei.
   * @returns Cost in token base units.
   */
  nativeToTokenUnits(chainId: number, token: AllowedToken, nativeWei: bigint): Promise<bigint>;
}

/** Production gas price source: `eth_gasPrice` through the chain clients. */
export class RpcGasPriceSource implements GasPriceSource {
  public constructor(private readonly clients: ReadonlyMap<number, ChainClient>) {}

  public async getGasPrice(chainId: number): Promise<bigint> {
    const c = this.clients.get(chainId);
    if (c === undefined) throw new RelayerError(422, 'chain_not_supported');
    return c.getGasPrice();
  }
}

const MICRO = 1_000_000n;

/**
 * Parses a decimal USD price with at most 6 fractional digits into micro-USD.
 *
 * @param s e.g. `"3000.25"`.
 * @returns micro-USD per 1 native coin, `> 0`.
 * @throws {Error} on malformed or zero input (configuration error).
 */
export function parseUsdMicro(s: string): bigint {
  const m = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,6}))?$/.exec(s);
  if (m === null) throw new Error('invalid USD price');
  const micro = BigInt(m[1] as string) * MICRO + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (micro === 0n) throw new Error('USD price must be positive');
  return micro;
}

/**
 * Production token price source for v1: the token is a USD stablecoin worth exactly 1.0 USD, and the
 * native coin price is an operator-configured fixed USD value per chain (no oracle in v1).
 */
export class FixedStablePriceSource implements TokenPriceSource {
  public constructor(private readonly nativeUsdMicro: ReadonlyMap<number, bigint>) {}

  public nativeToTokenUnits(chainId: number, token: AllowedToken, nativeWei: bigint): Promise<bigint> {
    const micro = this.nativeUsdMicro.get(chainId);
    if (micro === undefined) return Promise.reject(new RelayerError(422, 'chain_not_supported'));
    const num = nativeWei * micro * 10n ** BigInt(token.decimals);
    const den = 10n ** 18n * MICRO;
    return Promise.resolve((num + den - 1n) / den);
  }
}
