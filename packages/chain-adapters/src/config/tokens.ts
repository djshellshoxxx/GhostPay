import type { Address } from '../types.js';

/** An allowlisted ERC-20 token on one chain. */
export interface TokenConfig {
  readonly chainId: number;
  readonly symbol: string;
  /** EIP-55 checksummed address. */
  readonly address: Address;
  readonly decimals: number;
  /** True when the token implements ERC-2612 `permit` (not DAI-style permit). */
  readonly permit: boolean;
}

/**
 * Token allowlist. ONLY addresses that were verified against official issuer
 * documentation are listed; everything else is in TODO-VERIFY.md and must not
 * be added without verification. No mainnet token is listed yet.
 */
export const TOKENS: readonly TokenConfig[] = Object.freeze([
  // Circle USDC testnet deployments (https://developers.circle.com/stablecoins/usdc-contract-addresses)
  { chainId: 11155111, symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, permit: true },
  { chainId: 84532, symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, permit: true },
]);

/**
 * Returns the allowlist for one chain.
 *
 * @param chainId EIP-155 id.
 * @returns Tokens (possibly empty).
 */
export function tokensForChain(chainId: number): readonly TokenConfig[] {
  return TOKENS.filter((t) => t.chainId === chainId);
}

/**
 * Finds an allowlisted token by address (case-insensitive).
 *
 * @param chainId EIP-155 id.
 * @param address Token address.
 * @returns The token or `undefined` when not allowlisted.
 */
export function findToken(chainId: number, address: string): TokenConfig | undefined {
  const a = address.toLowerCase();
  return TOKENS.find((t) => t.chainId === chainId && t.address.toLowerCase() === a);
}
