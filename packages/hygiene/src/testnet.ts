import { fail } from './errors.js';

/** Chain ids this PoC accepts: anvil, Ethereum Sepolia, Base Sepolia. */
export const ALLOWED_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/**
 * Testnet-only guard.
 *
 * @param chainId Chain id to check.
 * @throws {HygieneError} `CHAIN_NOT_ALLOWED` for anything but 31337, 11155111, 84532.
 * @security Mainnet use is refused in code, not by convention.
 */
export function assertTestnetChain(chainId: number): void {
  if (!Number.isSafeInteger(chainId) || !ALLOWED_CHAIN_IDS.includes(chainId)) {
    fail('CHAIN_NOT_ALLOWED', 'testnet-only: chain id not allowed');
  }
}
