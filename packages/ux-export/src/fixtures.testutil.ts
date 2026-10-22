import type { LedgerRow } from './types.js';

/** Exact fake rows; addresses/hashes are obviously synthetic. */
export function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: 'tx-0001',
    timestampMs: Date.UTC(2024, 0, 2, 3, 4, 5, 6),
    direction: 'in',
    chain: 'testnet',
    asset: 'USDC',
    decimals: 6,
    amount: 1_500_000n,
    fee: 0n,
    counterparty: 'fake-address-0001',
    txHash: '0xfake0001',
    memo: 'coffee, "large"',
    status: 'confirmed',
    ...over,
  };
}
