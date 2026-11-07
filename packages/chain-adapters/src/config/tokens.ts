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
 * Token allowlist. ONLY addresses that were verified against issuer-owned sources are listed (per-row sources below and in
 * docs/chains/SOURCES-2026-10-25.md); everything else must not be added without verification. No mainnet token is listed yet (USDT/DAI/PYUSD/FDUSD/WETH/WBTC: unverified, see docs/chains/).
 */
export const TOKENS: readonly TokenConfig[] = Object.freeze([
  // Circle USDC testnet deployments. Addresses re-checked 2026-10-25 against Circle-owned GitHub repos (developers.circle.com
  // was unreachable from the build network): https://github.com/circlefin/skills/blob/main/plugins/circle/skills/use-usdc/SKILL.md
  // (all six chains), plus circlefin/msca-wallet-recovery src/utils/configs.ts (Amoy, Sepolia, Arbitrum Sepolia) and
  // circlefin/modularwallets-web-sdk contractAddress.ts (OP Sepolia). Decimals 6 on every chain: same SKILL.md ("The 6-Decimal Rule").
  // `permit: true` rests on circlefin/stablecoin-evm doc/tokendesign.md (FiatToken is ERC-2612 compatible); per-deployment
  // proxy implementation versions were NOT read on-chain (no RPC), so keep the fork test before relying on it.
  { chainId: 11155111, symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 84532, symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 11155420, symbol: 'USDC', address: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 421614, symbol: 'USDC', address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 80002, symbol: 'USDC', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6, permit: true, blacklistCapable: true },
  { chainId: 43113, symbol: 'USDC', address: '0x5425890298aed601595a70AB815c96711a31Bc65', decimals: 6, permit: true, blacklistCapable: true },
  // Circle EURC testnet deployments. Addresses (Sepolia, Base Sepolia, Fuji) re-checked 2026-10-25 in
  // https://github.com/circlefin/arc-fintech/blob/main/lib/constants/eurc-addresses.ts (which cites
  // developers.circle.com/stablecoins/eurc-contract-addresses). Decimals 6: circlefin/arc-fintech lib/circle/gateway-sdk.ts
  // ("USDC and EURC are both 6-decimal on every chain") and circlefin/txt2txn-web util/utils.ts (Sepolia). Same permit caveat as above.
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
