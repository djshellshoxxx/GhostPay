import { PayerSponsorError } from './errors.js';

/** Ethereum Sepolia, Base Sepolia and a local development chain (anvil). PH-GEN-1. */
export const TESTNET_CHAIN_IDS = [11155111, 84532, 31337] as const;

/** One of {@link TESTNET_CHAIN_IDS}. */
export type TestnetChainId = (typeof TESTNET_CHAIN_IDS)[number];

/**
 * Whether `chainId` is on the testnet allowlist.
 *
 * @param chainId Candidate chain id.
 * @returns True for 11155111, 84532 and 31337 only.
 */
export function isTestnetChainId(chainId: number): chainId is TestnetChainId {
  return (TESTNET_CHAIN_IDS as readonly number[]).includes(chainId);
}

/**
 * Throws unless `chainId` is on the testnet allowlist. Called at every exported entry point that
 * touches a chain id (PH-GEN-1).
 *
 * @param chainId Candidate chain id (must be a safe integer; anything else is refused as well).
 * @throws PayerSponsorError `MAINNET_FORBIDDEN`.
 * @security Mainnet is out of scope: this proof of concept is unaudited and must not handle real value.
 */
export function assertTestnet(chainId: number): asserts chainId is TestnetChainId {
  if (!Number.isSafeInteger(chainId) || !isTestnetChainId(chainId)) {
    throw new PayerSponsorError('MAINNET_FORBIDDEN', 'chain id is not on the testnet allowlist');
  }
}
