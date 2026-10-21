import type { Address } from 'viem';
import { assertTestnet } from '../chainGuard.js';
import type { FundingTx } from './types.js';

/** Source of funding history (an RPC log scan or an indexer). */
export interface FundingHistorySource {
  fundingTransfers(chainId: number, address: Address): Promise<readonly FundingTx[]>;
}

/**
 * Fetches funding transfers of `address` for {@link lintFunding}.
 *
 * @param source History source.
 * @param chainId Chain id (testnet allowlist enforced).
 * @param address Address to look up.
 * @returns The transfers.
 * @security PRIVACY: this call sends `address` to the history source (RPC provider or indexer), which
 *   learns that you are interested in it (D8). `planFunding` and `lintFunding` never do network I/O;
 *   only this helper does, and only when you call it. The UI must say so before calling it.
 */
export async function fetchFundingHistory(source: FundingHistorySource, chainId: number, address: Address): Promise<readonly FundingTx[]> {
  assertTestnet(chainId);
  return source.fundingTransfers(chainId, address);
}
