import { ScanSourceError } from './errors.js';

/** Chain ids this testnet-only PoC may operate on: anvil, Ethereum Sepolia, Base Sepolia. */
export const TESTNET_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/**
 * Testnet-only guard, called by every exported source factory and on every `fetch`.
 *
 * @security Fails closed for mainnets and non-integers.
 * @throws ScanSourceError `TESTNET_ONLY`.
 */
export function assertTestnetChainId(chainId: number): void {
  if (!Number.isInteger(chainId) || !TESTNET_CHAIN_IDS.includes(chainId)) {
    throw new ScanSourceError('TESTNET_ONLY', 'chain id is not an allowed testnet');
  }
}
