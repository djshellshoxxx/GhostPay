import type { RpcLog } from '@ghostpay/chain-adapters';
import { policyAccountAbi, ZERO_ADDRESS, type Hex } from '@ghostpay/policy-scheme';
import { decodeEventLog, decodeFunctionData, encodeFunctionResult } from 'viem/utils';
import { account, fakeChain, DEPLOYMENT, type FakeChainState } from './fixtures.testutil';
import { policyCloneRuntime } from './withdrawalState';

const vector = account('acct-001');
const zeroHash: Hex = `0x${'0'.repeat(64)}`;

/** Test-only chain index: supplies real ABI-encoded getters and receipt copies for fixture logs. */
export function withdrawalChain(chainId: number, input: FakeChainState) {
  const logs = (input.logs ?? []).map((log, index) => log.address.toLowerCase() !== vector.accountAddress.toLowerCase() ? log : {
    ...log, logIndex: `0x${index.toString(16)}`,
    transactionHash: log.transactionHash ?? `0x${(BigInt(log.blockNumber) * 4096n + BigInt(index)).toString(16).padStart(64, '0')}`,
  });
  const extra = input.extra;
  return fakeChain(chainId, { ...input, logs, extra: (method, params) => {
    const first = params[0];
    if (method === 'eth_getCode' && typeof first === 'string' && first.toLowerCase() === vector.accountAddress.toLowerCase() && input.code?.has(first.toLowerCase())) return policyCloneRuntime(DEPLOYMENT.implementation);
    if (method === 'eth_getTransactionReceipt') {
      const included = logs.filter((log) => log.transactionHash === first);
      if (included.length > 0) return { transactionHash: first, status: '0x1', blockHash: included[0]!.blockHash, blockNumber: included[0]!.blockNumber, logs: included };
    }
    if (method === 'eth_call') {
      const tx = first as { to: string; data: Hex };
      if (tx.to.toLowerCase() === vector.accountAddress.toLowerCase()) {
        const decoded = decodeFunctionData({ abi: policyAccountAbi, data: tx.data });
        if (decoded.functionName === 'pendingProposalId') return encodeFunctionResult({ abi: policyAccountAbi, functionName: 'pendingProposalId', result: zeroHash });
        if (decoded.functionName === 'requests' || decoded.functionName === 'requestDestination') {
          const id = decoded.args[0];
          const events = logs.filter((log) => log.address.toLowerCase() === vector.accountAddress.toLowerCase()).map((log) => decodeEventLog({ abi: policyAccountAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data as Hex }));
          const requested = events.find((event) => event.eventName === 'WithdrawRequested' && event.args.id === id);
          if (requested?.eventName === 'WithdrawRequested') {
            if (decoded.functionName === 'requestDestination') return encodeFunctionResult({ abi: policyAccountAbi, functionName: 'requestDestination', result: vector.policy.destination });
            const closed = events.find((event) => (event.eventName === 'WithdrawExecuted' || event.eventName === 'WithdrawCancelled') && event.args.id === id);
            return encodeFunctionResult({ abi: policyAccountAbi, functionName: 'requests', result: {
              token: requested.args.token, status: closed?.eventName === 'WithdrawExecuted' ? 2 : closed?.eventName === 'WithdrawCancelled' ? 3 : 1,
              amount: requested.args.amount, executeAfter: requested.args.executeAfter, windowSeconds: 86400n, limit: 10n ** 18n,
            } });
          }
          return encodeFunctionResult({ abi: policyAccountAbi, functionName: 'requests', result: { token: ZERO_ADDRESS, status: 0, amount: 0n, executeAfter: 0n, windowSeconds: 0n, limit: 0n } });
        }
      }
    }
    return extra?.(method, params);
  } });
}

/** Explicit fixture lock provider for DOM unit tests; production never falls back to this. */
export function installPolicyTestLocks(): void {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    async request<T>(_name: string, _options: unknown, callback: () => Promise<T>): Promise<T> { return callback(); },
  } });
}

export function receipt(logs: readonly RpcLog[]) {
  return { transactionHash: logs[0]!.transactionHash, status: '0x1', blockHash: logs[0]!.blockHash, blockNumber: logs[0]!.blockNumber, logs };
}
