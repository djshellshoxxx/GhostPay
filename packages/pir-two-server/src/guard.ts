import { PirError } from './errors.js';

/** The only chain ids this testnet-only PoC operates on: anvil, Ethereum Sepolia, Base Sepolia. */
export const TESTNET_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/**
 * Testnet-only guard (ADR-0006 PoC scope). Called at every exported entry point that names a chain.
 *
 * @security Fails closed: any chain id not in {@link TESTNET_CHAIN_IDS}, including mainnets and non-integers, is refused.
 * @throws PirError `TESTNET_ONLY`.
 */
export function assertTestnetChainId(chainId: number): void {
  if (!Number.isInteger(chainId) || !TESTNET_CHAIN_IDS.includes(chainId)) {
    throw new PirError('TESTNET_ONLY', 'chain id is not an allowed testnet');
  }
}
