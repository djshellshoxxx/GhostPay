import { fail } from './errors.js';

/**
 * Chain ids on which any external-pool code may run: Ethereum Sepolia, Base Sepolia, local anvil.
 * Mainnets are excluded by design (EP-GEN-1, spec non-goal G4).
 */
export const ALLOWED_CHAIN_IDS: readonly number[] = Object.freeze([11155111, 84532, 31337]);

/**
 * Testnet guard: every exported adapter entry point calls this before any network access.
 *
 * @param chainId Candidate EIP-155 chain id.
 * @throws ExternalPoolError CHAIN_NOT_ALLOWED when `chainId` is not an allowlisted testnet.
 * @security Fail closed: non-integers, NaN and unknown ids are all rejected.
 */
export function assertChainAllowed(chainId: number): void {
  if (!Number.isInteger(chainId) || !ALLOWED_CHAIN_IDS.includes(chainId)) {
    fail('CHAIN_NOT_ALLOWED', `chain ${String(chainId)} is not an allowlisted testnet`);
  }
}

/**
 * @param chainId Candidate chain id.
 * @returns Whether the chain id is allowlisted (non-throwing form of {@link assertChainAllowed}).
 */
export function isChainAllowed(chainId: number): boolean {
  return Number.isInteger(chainId) && ALLOWED_CHAIN_IDS.includes(chainId);
}
