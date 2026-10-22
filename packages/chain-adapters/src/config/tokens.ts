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
  /** Issuer can blacklist/freeze addresses; a transfer or sweep may revert for a blocked party. */
  readonly blacklistCapable?: boolean;
  /** `approve` returns no bool / needs zero-first (USDT-style); callers must use a safe-approve wrapper. */
  readonly nonStandardApprove?: boolean;
}

/**
 * Token allowlist. ONLY addresses that were verified against official issuer
 * documentation are listed; everything else is in TODO-VERIFY.md and must not
 * be added without verification. No mainnet token is listed yet (USDT/DAI/PYUSD/FDUSD/WETH/WBTC: unverified, see docs/chains/).
 */
export const TOKENS: readonly TokenConfig[] = Object.freeze([
  // Circle USDC testnet deployments (https://developers.circle.com/stablecoins/usdc-contract-addresses)
  { chainId: 11155111, symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 84532, symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 11155420, symbol: 'USDC', address: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 421614, symbol: 'USDC', address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 80002, symbol: 'USDC', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 43113, symbol: 'USDC', address: '0x5425890298aed601595a70AB815c96711a31Bc65', decimals: 6, permit: true, blacklistCapable: true },
  // Circle EURC testnet deployments (https://developers.circle.com/stablecoins/eurc-contract-addresses); seen via search snippets, re-check before release
  { chainId: 11155111, symbol: 'EURC', address: '0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 84532, symbol: 'EURC', address: '0x808456652fdb597867f38412077A9182bf77359F', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 43113, symbol: 'EURC', address: '0x5E44db7996c682E92a960b65AC713a54AD815c6B', decimals: 6, permit: true, blacklistCapable: true },
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
