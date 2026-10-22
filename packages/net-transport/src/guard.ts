import { NetTransportError } from './errors.js';

/** PoC flag (NP-C-4): while true every entry point refuses non-test networks. */
export const NET_PRIVACY_TESTNET_ONLY = true as const;

/** EVM chain ids this PoC may touch: anvil, Ethereum Sepolia, Base Sepolia. */
export const ALLOWED_EVM_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/** Bitcoin networks this PoC may touch. */
export const ALLOWED_BTC_NETWORKS: readonly string[] = Object.freeze(['testnet', 'signet', 'regtest']);

/** The network a profile or settings object is used for. */
export type NetworkRef =
  | { readonly kind: 'evm'; readonly chainId: number }
  | { readonly kind: 'btc'; readonly network: string };

/**
 * Testnet-only guard. Called by every exported entry point that creates a profile or validates settings.
 *
 * @security Fails closed: unknown shapes, non-integer ids, mainnet ids and names all throw.
 * @param ref Network reference.
 * @throws {NetTransportError} `NETWORK_NOT_ALLOWED` (fixed message, no echo).
 */
export function assertTestnet(ref: NetworkRef): void {
  const r = ref as { kind?: unknown; chainId?: unknown; network?: unknown } | null | undefined;
  const ok =
    r !== null &&
    typeof r === 'object' &&
    ((r.kind === 'evm' && typeof r.chainId === 'number' && ALLOWED_EVM_CHAIN_IDS.includes(r.chainId)) ||
      (r.kind === 'btc' && typeof r.network === 'string' && ALLOWED_BTC_NETWORKS.includes(r.network)));
  if (!ok) throw new NetTransportError('NETWORK_NOT_ALLOWED', 'network is not allowed in the testnet PoC');
}
