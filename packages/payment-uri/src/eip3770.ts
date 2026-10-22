import { fail } from './errors.js';
import { parseEvmAddress } from './addresses.js';

/**
 * Chain short names, copied from the ethereum-lists/chains registry (eip155-<id>.json `shortName`, checked 2026-10).
 * Pass a different registry to the functions below to extend it; the built-in table is intentionally small.
 */
export const DEFAULT_CHAIN_SHORT_NAMES: Readonly<Record<string, number>> = Object.freeze({
  eth: 1,
  oeth: 10,
  bnb: 56,
  gno: 100,
  pol: 137,
  zksync: 324,
  base: 8453,
  arb1: 42161,
  avax: 43114,
  linea: 59144,
  scr: 534352,
  sep: 11155111,
  basesep: 84532,
  'arb-sep': 421614,
  opsep: 11155420,
});

/** A parsed ERC-3770 chain-specific address. */
export interface ChainAddress {
  readonly shortName: string;
  readonly chainId: number;
  /** EIP-55 checksummed address. */
  readonly address: string;
  readonly checksummed: boolean;
}

const SHORT = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Strict `shortName:0xAddress` parser. The short name must be registered; the address must be a valid EVM address. */
export function parseChainAddress(
  text: string,
  registry: Readonly<Record<string, number>> = DEFAULT_CHAIN_SHORT_NAMES,
): ChainAddress {
  if (typeof text !== 'string' || text.length > 80) return fail('INVALID_INPUT');
  const i = text.indexOf(':');
  if (i <= 0) return fail('INVALID_INPUT');
  const shortName = text.slice(0, i);
  if (!SHORT.test(shortName) || !Object.prototype.hasOwnProperty.call(registry, shortName))
    return fail('INVALID_CHAIN_ID');
  const chainId = registry[shortName]!;
  const a = parseEvmAddress(text.slice(i + 1));
  return { shortName, chainId, address: a.address, checksummed: a.checksummed };
}

/** Builds `shortName:0xAddress` from a chain id (reverse lookup) and an address (checksum verified, then normalised). */
export function buildChainAddress(
  chainId: number,
  address: string,
  registry: Readonly<Record<string, number>> = DEFAULT_CHAIN_SHORT_NAMES,
): string {
  const names = Object.keys(registry).filter((k) => registry[k] === chainId);
  if (names.length !== 1) return fail('INVALID_CHAIN_ID');
  return `${names[0]}:${parseEvmAddress(address).address}`;
}
