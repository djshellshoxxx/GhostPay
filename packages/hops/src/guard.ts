import { HopError, TESTNET_CHAIN_IDS } from './types.js';

/**
 * Testnet-only guard, called at every exported entry point that knows a chain id.
 *
 * @param chainId Chain id.
 * @throws {HopError} `MAINNET_FORBIDDEN` for any id outside 31337, 11155111, 84532.
 */
export function assertTestnet(chainId: number): void {
  if (!(TESTNET_CHAIN_IDS as readonly number[]).includes(chainId)) {
    throw new HopError('MAINNET_FORBIDDEN', 'only testnet chains are supported');
  }
}
