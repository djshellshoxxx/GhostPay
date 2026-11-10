import { CHAINS, type RpcClient, type RpcLog } from '@ghostpay/chain-adapters';
import { parsePolicyRecord, ZERO_ADDRESS, policyAccountAbi, type Hex } from '@ghostpay/policy-scheme';
import type { Abi } from 'viem';
import { decodeFunctionData, encodeFunctionResult } from 'viem/utils';
import { describe, expect, it, vi } from 'vitest';
import { verifyPolicyDeployment } from './chain';
import { account, accountCalls, accountLog, clientVectors, DEPLOYMENT, LOCAL_POLICY_PROFILE, SEPOLIA } from './fixtures.testutil';
import { deploymentCalls, type FakeChainState } from './fixtures.testutil';
import { policyCloneRuntime, readWithdrawalSnapshot, recoveredExecution, withdrawalActionScope } from './withdrawalState';
import { withdrawalChain } from './withdrawal.testutil';

const a = account('acct-001');
const chain = CHAINS.find((c) => c.chainId === SEPOLIA)!;
const record = parsePolicyRecord(clientVectors.records.valid.find((r) => r.id === 'acct-001')!.canonical);
const id: Hex = `0x${'a1'.repeat(32)}`;
const id2: Hex = `0x${'a2'.repeat(32)}`;
const blockTime = 1_800_000_000n;
const eth = 10n ** 18n;
const requestLog = (opts: { amount?: bigint; executeAfter?: bigint; id?: Hex; block?: number } = {}) => accountLog(a.accountAddress, 'WithdrawRequested', { id: opts.id ?? id, token: ZERO_ADDRESS, amount: opts.amount ?? eth / 4n, executeAfter: opts.executeAfter ?? blockTime - 1n }, opts.block ?? 100);

async function fixture(over: FakeChainState = {}) {
  const base = deploymentCalls();
  base.code.add(a.accountAddress.toLowerCase());
  const client = withdrawalChain(SEPOLIA, {
    ...base, head: 900, timestamp: blockTime, balances: { [`native@${a.accountAddress.toLowerCase()}`]: 2n * eth },
    calls: { ...base.calls, ...accountCalls(a) }, logs: [requestLog()], ...over,
  });
  const deployment = await verifyPolicyDeployment(client, chain, { factory: DEPLOYMENT.factory, router: DEPLOYMENT.router }, LOCAL_POLICY_PROFILE);
  const args = { client, chain, deployment, account: a.accountAddress, owner: a.ownerAddress, record, token: ZERO_ADDRESS, knownIds: new Set<string>(), assertCurrent: vi.fn() };
  return { client, args, read: () => readWithdrawalSnapshot(args) };
}

function alter(client: RpcClient, change: (method: string, params: readonly unknown[], answer: unknown) => unknown) {
  const original = client.request.bind(client);
  client.request = async (method, params) => change(method, params, await original(method, params));
}

function changeRead(client: RpcClient, name: string, value: unknown) {
  alter(client, (method, params, answer) => {
    if (method !== 'eth_call') return answer;
    const tx = params[0] as { to: string; data: Hex };
    if (tx.to !== a.accountAddress) return answer;
    const d = decodeFunctionData({ abi: policyAccountAbi, data: tx.data });
    const abi: Abi = policyAccountAbi;
    return d.functionName === name ? encodeFunctionResult({ abi, functionName: name, result: value }) : answer;
  });
}

describe('canonical withdrawal reconstruction', () => {
  it('recovers the actual request time after a reload, from the deployment origin and at one block', async () => {
    const f = await fixture();
    const first = await f.read();
    expect(first.summary.pending).toEqual([{ id, token: ZERO_ADDRESS, amount: eth / 4n, executeAfter: blockTime - 1n, known: false }]);
    expect(first.plan.max).toBe(3n * eth / 4n);
    const restarted = await readWithdrawalSnapshot({ ...f.args, knownIds: new Set([id]) });
    expect(restarted.requests).toEqual(first.requests);
    expect(restarted.summary.pending[0]!.known).toBe(true);
    expect(recoveredExecution(restarted, id).to).toBe(a.accountAddress);
    const filters = f.client.calls.filter((c) => c.method === 'eth_getLogs').map((c) => c.params[0] as { fromBlock: bigint });
    expect(filters.every((filter) => filter.fromBlock === LOCAL_POLICY_PROFILE.deploymentStartBlock)).toBe(true);
    const stateReads = f.client.calls.filter((c) => ['eth_call', 'eth_getCode', 'eth_getBalance'].includes(c.method));
    expect(stateReads.every((c) => typeof c.params[1] === 'object' && (c.params[1] as { requireCanonical: boolean }).requireCanonical)).toBe(true);
  });

  it('rechecks competing requests and available balance on each new snapshot', async () => {
    const f = await fixture({ logs: [requestLog(), requestLog({ id: id2, amount: eth / 2n, block: 200 })] });
    expect((await f.read()).plan.max).toBe(eth / 4n);
    alter(f.client, (m, _p, answer) => m === 'eth_getBalance' ? '0x1' : answer);
    expect((await f.read()).plan.max).toBe(0n);
  });

  it('sorts out-of-order canonical logs and recovers closed requests without offering execution', async () => {
    const event = accountLog(a.accountAddress, 'WithdrawExecuted', { id, destination: a.policy.destination, token: ZERO_ADDRESS, amount: eth / 4n }, 200);
    const f = await fixture({ logs: [event, requestLog()] });
    const state = await f.read();
    expect(state.summary.pending).toEqual([]);
    expect(() => recoveredExecution(state, id)).toThrow(/not pending/);
  });

  it('does not manufacture a deployed account or executable request before deployment', async () => {
    const f = await fixture({ ...deploymentCalls(), logs: [] });
    const state = await f.read();
    expect(state.view.deployed).toBe(false);
    expect(state.plan.max).toBe(0n);
    expect(state.requests).toEqual([]);
  });

  it.each(['removed', 'duplicate', 'outside-range', 'malformed', 'wrong-account'])('rejects %s logs', async (kind) => {
    const f = await fixture();
    const original = f.client.getLogs.bind(f.client);
    vi.spyOn(f.client, 'getLogs').mockImplementation(async (filter) => {
      const logs = await original(filter);
      const log = logs[0]!;
      if (kind === 'duplicate') return [log, log];
      const changes = kind === 'removed' ? { removed: true } : kind === 'outside-range' ? { blockNumber: '0xffffff' } : kind === 'wrong-account' ? { address: ZERO_ADDRESS } : { data: '0xdead' };
      return [{ ...log, ...changes }];
    });
    await expect(f.read()).rejects.toThrow(/canonical account history/);
  });

  it.each(['reverted', 'wrong-block', 'wrong-transaction', 'missing-log', 'conflicting-log', 'oversized-logs'])('rejects a %s receipt', async (kind) => {
    const f = await fixture();
    alter(f.client, (m, _p, answer) => {
      if (m !== 'eth_getTransactionReceipt') return answer;
      const r = answer as Record<string, unknown>;
      if (kind === 'reverted') return { ...r, status: '0x0' };
      if (kind === 'wrong-block') return { ...r, blockHash: id };
      if (kind === 'wrong-transaction') return { ...r, transactionHash: id };
      if (kind === 'missing-log') return { ...r, logs: [] };
      if (kind === 'oversized-logs') return { ...r, logs: Array(4097).fill({}) };
      return { ...r, logs: (r['logs'] as RpcLog[]).map((l) => ({ ...l, data: '0x' })) };
    });
    await expect(f.read()).rejects.toThrow(/canonical account history/);
  });

  it('rejects incomplete history exceeding its bounded paging budget', async () => {
    const f = await fixture();
    await expect(readWithdrawalSnapshot({ ...f.args, chain: { ...chain, getLogsMaxRange: 1 } })).rejects.toThrow(/canonical account history/);
  });

  it('rejects a closing event with no original request', async () => {
    const f = await fixture({ logs: [accountLog(a.accountAddress, 'WithdrawCancelled', { id }, 200)] });
    await expect(f.read()).rejects.toThrow(/canonical account history/);
  });

  it.each(['requests', 'requestDestination', 'pendingProposalId'])('rejects disagreement with %s storage', async (name) => {
    const f = await fixture();
    changeRead(f.client, name, name === 'requests' ? { token: ZERO_ADDRESS, status: 2, executeAfter: blockTime - 1n, windowSeconds: 86400n, amount: eth / 4n, limit: eth } : name === 'requestDestination' ? ZERO_ADDRESS : id2);
    await expect(f.read()).rejects.toThrow(/canonical account history/);
  });

  it('invalidates reorged history rather than reusing a saved request', async () => {
    const f = await fixture();
    expect((await f.read()).requests).toHaveLength(1);
    const getBlock = f.client.getBlock.bind(f.client);
    vi.spyOn(f.client, 'getBlock').mockImplementation(async (number) => ({ ...(await getBlock(number))!, hash: id2 }));
    await expect(f.read()).rejects.toThrow(/canonical account history/);
  });

  it('rejects a reorg or chain change while reading the snapshot', async () => {
    const f = await fixture();
    let sawReceipt = false;
    alter(f.client, (m, _p, answer) => {
      if (m === 'eth_getTransactionReceipt') sawReceipt = true;
      if (m === 'eth_getBlockByNumber' && sawReceipt) return { ...(answer as object), hash: id2 };
      return answer;
    });
    await expect(f.read()).rejects.toThrow(/changed|canonical/i);
    const g = await fixture();
    let sawAccount = false;
    alter(g.client, (m, _p, answer) => {
      if (m === 'eth_getTransactionReceipt') sawAccount = true;
      return m === 'eth_chainId' && sawAccount ? '0x1' : answer;
    });
    await expect(g.read()).rejects.toThrow(/changed|canonical/i);
  });

  it('checks seller/deployment guards after asynchronous history reads', async () => {
    const f = await fixture();
    let stale = false;
    alter(f.client, (m, _p, answer) => { if (m === 'eth_getTransactionReceipt') stale = true; return answer; });
    await expect(readWithdrawalSnapshot({ ...f.args, assertCurrent: () => { if (stale) throw new Error('session replaced'); } })).rejects.toThrow('session replaced');
  });
});

describe('fresh policy withdrawal authorization', () => {
  it.each(['owner', 'delay', 'limitsRoot', 'policyHash'])('rejects changed %s before signing', async (name) => {
    const f = await fixture();
    changeRead(f.client, name, name === 'owner' ? ZERO_ADDRESS : name === 'delay' ? 7n : id2);
    await expect(f.read()).rejects.toThrow(/account, policy, destination or deployment changed/);
  });

  it('rejects missing authenticated deployment, wrong CREATE2 account, wrong clone, and unsupported token', async () => {
    const f = await fixture();
    await expect(readWithdrawalSnapshot({ ...f.args, deployment: DEPLOYMENT })).rejects.toThrow(/pinned and authenticated/);
    await expect(readWithdrawalSnapshot({ ...f.args, account: ZERO_ADDRESS })).rejects.toThrow(/changed/);
    await expect(readWithdrawalSnapshot({ ...f.args, token: record.limits[1]!.token })).rejects.toThrow(/changed/);
    alter(f.client, (m, params, answer) => m === 'eth_getCode' && params[0] === a.accountAddress ? '0x6001' : answer);
    await expect(f.read()).rejects.toThrow(/changed/);
  });

  it('blocks a pending destination proposal and a completed destination rotation', async () => {
    const nextDestination = account('acct-002').policy.destination;
    const proposal = accountLog(a.accountAddress, 'DestinationProposed', { id: id2, newDestination: nextDestination, effectiveAt: blockTime - 1n }, 200);
    const f = await fixture({ logs: [requestLog(), proposal] });
    changeRead(f.client, 'pendingDestination', nextDestination);
    changeRead(f.client, 'pendingEffectiveAt', blockTime - 1n);
    changeRead(f.client, 'pendingProposalId', id2);
    const pending = await f.read();
    expect(pending.plan.max).toBe(0n);
    expect(pending.summary.pendingDestination?.newDestination).toBe(nextDestination);
    expect(() => recoveredExecution(pending, id)).toThrow(/not pending/);
    const change = accountLog(a.accountAddress, 'DestinationChanged', { id: id2, newDestination: nextDestination }, 300);
    const g = await fixture({ logs: [requestLog(), proposal, change] });
    changeRead(g.client, 'destination', nextDestination);
    const changed = await g.read();
    expect(changed.plan.max).toBe(0n);
    expect(changed.summary.alerts.some((alert) => alert.level === 'warn')).toBe(true);
    expect(() => recoveredExecution(changed, id)).toThrow(/not pending/);
  });

  it('rejects missing destination history and duplicate or impossible request transitions', async () => {
    const g = await fixture({ logs: [requestLog(), requestLog({ block: 200 })] });
    await expect(g.read()).rejects.toThrow(/canonical account history/);
    const f = await fixture({ logs: [requestLog(), accountLog(a.accountAddress, 'DestinationChanged', { id: id2, newDestination: account('acct-002').policy.destination }, 300)] });
    await expect(f.read()).rejects.toThrow(/canonical account history/);
    const h = await fixture({ logs: [requestLog(), accountLog(a.accountAddress, 'WithdrawCancelled', { id }, 200), accountLog(a.accountAddress, 'WithdrawCancelled', { id }, 300)] });
    await expect(h.read()).rejects.toThrow(/canonical account history/);
  });

  it('checks the chosen nonce rather than silently replacing a used nonce', async () => {
    const f = await fixture();
    changeRead(f.client, 'nonceUsed', true);
    await expect(readWithdrawalSnapshot({ ...f.args, nonce: 9n })).rejects.toThrow(/nonce is already used/);
  });

  it('does not execute before the chain-recorded time or above current balance/window', async () => {
    const future = await fixture({ logs: [requestLog({ executeAfter: blockTime + 10n })] });
    const pending = await future.read();
    expect(() => recoveredExecution(pending, id)).toThrow(/still timelocked/);
    const f = await fixture();
    const state = await f.read();
    expect(() => recoveredExecution({ ...state, balance: 0n }, id)).toThrow(/current balance/);
    expect(() => recoveredExecution({ ...state, window: { window: 86400n, bucket: blockTime / 86400n, current: eth, previous: 0n } }, id)).toThrow(/policy window/);
    expect(() => recoveredExecution(state, id2)).toThrow(/not pending/);
  });

  it('scopes persisted attempts to seller, deployment, chain, account and token without storing those inputs', () => {
    const session = { spendingPublicKey: a.spendingPublicKey, viewingPublicKey: a.viewingPublicKey, signerPublicKey: '', metaAddress: a.metaAddress };
    const key = withdrawalActionScope(session, DEPLOYMENT, a.accountAddress, ZERO_ADDRESS);
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    expect(withdrawalActionScope({ ...session, viewingPublicKey: account('acct-002').viewingPublicKey }, DEPLOYMENT, a.accountAddress, ZERO_ADDRESS)).not.toBe(key);
    expect(withdrawalActionScope(session, { ...DEPLOYMENT, chainId: 1 }, a.accountAddress, ZERO_ADDRESS)).not.toBe(key);
    expect(withdrawalActionScope(session, { ...DEPLOYMENT, router: ZERO_ADDRESS }, a.accountAddress, ZERO_ADDRESS)).not.toBe(key);
    expect(withdrawalActionScope(session, DEPLOYMENT, ZERO_ADDRESS, ZERO_ADDRESS)).not.toBe(key);
    expect(withdrawalActionScope(session, DEPLOYMENT, a.accountAddress, a.ownerAddress)).not.toBe(key);
    expect(policyCloneRuntime(DEPLOYMENT.implementation)).toContain(DEPLOYMENT.implementation.slice(2).toLowerCase());
  });
});
