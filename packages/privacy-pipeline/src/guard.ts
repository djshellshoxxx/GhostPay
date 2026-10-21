import { PipelineError } from './errors.js';

/** EVM chain ids this proof of concept may touch: anvil, Ethereum Sepolia, Base Sepolia. */
export const TESTNET_CHAIN_IDS: readonly number[] = [31337, 11155111, 84532];
/** Bitcoin networks this proof of concept may touch. */
export const BTC_TESTNETS: readonly string[] = ['testnet', 'signet', 'regtest'];

/** Chain reference of a pipeline (one chain id per pipeline, T-4). */
export type ChainRef =
  { readonly family: 'evm'; readonly chainId: number } | { readonly family: 'btc'; readonly network: string };

/**
 * True only for the allowed testnets.
 *
 * @security Testnet-only guard. Total: any `unknown` input returns a boolean.
 */
export function isTestnetChain(chain: unknown): chain is ChainRef {
  if (typeof chain !== 'object' || chain === null) return false;
  const c = chain as Record<string, unknown>;
  if (c['family'] === 'evm') {
    return typeof c['chainId'] === 'number' && TESTNET_CHAIN_IDS.includes(c['chainId']);
  }
  if (c['family'] === 'btc') {
    return typeof c['network'] === 'string' && BTC_TESTNETS.includes(c['network']);
  }
  return false;
}

/**
 * Throws `E_WRONG_CHAIN` unless the chain is an allowed testnet.
 *
 * @security Called at every exported entry point that plans, hashes or executes.
 */
export function assertTestnetChain(chain: unknown): asserts chain is ChainRef {
  if (!isTestnetChain(chain)) throw new PipelineError('E_WRONG_CHAIN');
}
