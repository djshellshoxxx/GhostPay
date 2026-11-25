import { erc20Abi } from '@ghostpay/chain-adapters';
import { policyAccountAbi } from '@ghostpay/policy-scheme';
import { encodeFunctionData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { summarizeWalletCall } from './walletCallSummary';

const address = '0x5555555555555555555555555555555555555555';
const zeroHash = `0x${'0'.repeat(64)}` as const;

describe('wallet contract-call summary', () => {
  it('includes the exact asset and amount inside a policy withdrawal tuple', () => {
    const data = encodeFunctionData({ abi: policyAccountAbi, functionName: 'requestWithdraw', args: [
      { token: address, amount: 7001n, deadline: 200n, nonce: 3n, limitLeafHash: zeroHash },
      { limit: 0n, windowSeconds: 0n, proof: [] }, '0x1234',
    ] });
    const summary = summarizeWalletCall(data, policyAccountAbi);
    expect(summary?.name).toBe('requestWithdraw');
    expect(summary?.fields).toContainEqual(['w.token', address]);
    expect(summary?.fields).toContainEqual(['w.amount', '7001']);
    expect(JSON.stringify(summary)).not.toContain('0x1234');
    expect(summarizeWalletCall(data)).toBeUndefined();
  });

  it('omits inferred fields for truncated, unrecognized or noncanonical calls', () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [address, 0n] });
    expect(summarizeWalletCall(data)?.fields).toContainEqual(['value', '0']);
    for (const other of ['0x', '0xdeadbeef', '0x095ea7b3', `${data}00`] as const) {
      expect(summarizeWalletCall(other)).toBeUndefined();
    }
  });
});
