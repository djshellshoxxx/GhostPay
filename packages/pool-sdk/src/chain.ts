import { fail } from './errors.js';

/** Chain ids the shielded pool may be used on: local anvil, Ethereum Sepolia, Base Sepolia (SP-GEN-1). */
export const POOL_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/**
 * Chain guard for every exported entry point that takes a chain id.
 *
 * @throws PoolSdkError `WRONG_CHAIN` for any id outside {@link POOL_CHAIN_IDS} (fail closed).
 * @security Mainnet use is out of scope (N9); the contracts refuse it too.
 */
export function assertPoolChain(chainId: number): void {
  if (!Number.isSafeInteger(chainId) || !POOL_CHAIN_IDS.includes(chainId)) {
    fail('WRONG_CHAIN', `chain ${String(chainId)} is not a supported testnet`);
  }
}
