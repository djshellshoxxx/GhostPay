import { afterEach, describe, expect, it } from 'vitest';
import {
  createPublicClient, createWalletClient, custom, decodeFunctionData, defineChain, keccak256,
  parseAbi, parseTransaction, serializeTransaction, size, toHex, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { buildSweepTypedData } from '@ghostpay/chain-adapters';
import { createViemChainClient, type SweepCall } from './chain.js';
import { SendRefused } from './errors.js';
import { buildRelayer, type Relayer } from './runtime.js';
import { MemoryStateBackend, StateJournal, decodeState } from './stateStore.js';
import { FakeChain, DEST, FEE_TO, NOPERMIT, NOW_MS, NOW_SEC, OWNER, OWNER_KEY, SWEEP_CONTRACT, USDC, testConfig } from './harness.testutil.js';
import { DailyBudget } from './budget.js';

const OP_ID = 84532;
const GWEI = 1_000_000_000n;
const EXTRA_RESERVE = 300_000n * GWEI;
const HASH: Hex = `0x${'ab'.repeat(32)}`;
const BLOCK: Hex = `0x${'cd'.repeat(32)}`;
const OP_ORACLE = '0x420000000000000000000000000000000000000F';
const account = privateKeyToAccount(OWNER_KEY);
const order: SweepCall = {
  sweepRelayer: SWEEP_CONTRACT,
  sweep: { token: USDC, owner: OWNER, destination: DEST, feeTo: FEE_TO, amount: 100_000_000n, fee: 2_000_000n, deadline: BigInt(NOW_SEC + 600), nonce: 1n },
  sweepSig: `0x${'11'.repeat(65)}`,
  permit: undefined,
};
const sendOptions = { nonce: 7, gas: 150_000n, gasPrice: GWEI, additionalFeeReserve: EXTRA_RESERVE };
const oracleAbi = parseAbi([
  'function getL1Fee(bytes) view returns (uint256)',
  'function getL1FeeUpperBound(uint256) view returns (uint256)',
  'function getOperatorFee(uint256) view returns (uint256)',
]);

class FeeChain extends FakeChain {
  public extra = EXTRA_RESERVE;
  public feeReads = 0;
  public feeFailure: Error | undefined;
  public readonly feeCalls: [bigint, boolean][] = [];
  public constructor(chainId = OP_ID) {
    super(chainId);
    this.receipt = { ...this.receipt, l1Fee: 0n, operatorFee: 0n };
  }
  public override estimateFeeReserve(gas: bigint, withPermit: boolean): Promise<bigint> {
    this.feeReads += 1;
    this.feeCalls.push([gas, withPermit]);
    if (this.feeFailure !== undefined) return Promise.reject(this.feeFailure);
    return Promise.resolve(this.extra);
  }
}

const relayers: Relayer[] = [];
afterEach(() => { for (const r of relayers.splice(0)) r.dispose(); });
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

async function service(over: { daily?: bigint; loss?: bigint; fake?: FeeChain; cacheSeconds?: number; backend?: MemoryStateBackend } = {}) {
  const fake = over.fake ?? new FeeChain(OP_ID);
  const base = testConfig();
  const cfg = base.chains[0];
  if (cfg === undefined) throw new Error('fixture');
  const backend = over.backend ?? new MemoryStateBackend();
  const clock = { ms: NOW_MS };
  const relayer = await buildRelayer({
    config: {
      ...base,
      gas: { ...base.gas, quoteCacheSeconds: over.cacheSeconds ?? base.gas.quoteCacheSeconds },
      chains: [{ ...cfg, chainId: OP_ID, dailyBudgetWei: over.daily ?? 10n ** 17n }],
      lossBudget: { ...base.lossBudget, perKeyWei: over.loss ?? 10n ** 16n },
    },
    clients: new Map([[OP_ID, fake]]),
    hotKey: new Uint8Array(32).fill(3), quoteSecret: new Uint8Array(32).fill(9),
    now: () => clock.ms,
    journal: new StateJournal(backend, () => clock.ms),
  });
  relayers.push(relayer);
  const quote = (token = USDC) => relayer.service.quote({ chainId: OP_ID, token, owner: OWNER, destination: DEST, amount: order.sweep.amount });
  const send = async (nonce = 1n) => {
    const q = await quote();
    const sweep = { ...order.sweep, nonce, fee: BigInt(q.fee) };
    const typed = buildSweepTypedData(OP_ID, SWEEP_CONTRACT, sweep);
    const sweepSig = await account.signTypedData(typed);
    return relayer.service.sweep({ chainId: OP_ID, sweep, sweepSig, quoteToken: q.quoteToken, permit: undefined }, { requestId: 'op-fees' });
  };
  return { fake, relayer, backend, clock, quote, send };
}

interface RpcScript {
  chainId?: number;
  l1Fee?: unknown;
  oracle?: unknown;
  receipt?: Record<string, unknown>;
  oracleCall?: (data: Hex, block: unknown) => unknown;
  events?: string[];
}

function rpcClient(script: RpcScript = {}) {
  const chainId = script.chainId ?? OP_ID;
  const chain = defineChain({ id: chainId, name: 'fixture', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://unused.invalid'] } } });
  const raw: Hex[] = [];
  const calls: { data: Hex; block: unknown }[] = [];
  const transport = custom({ request: (({ method, params }: { method: string; params?: unknown[] }) => Promise.resolve().then(() => {
    if (method === 'eth_chainId') return toHex(chainId);
    if (method === 'eth_call') {
      const tx = params?.[0] as { to: string; data: Hex };
      expect(tx.to.toLowerCase()).toBe(OP_ORACLE.toLowerCase());
      calls.push({ data: tx.data, block: params?.[1] });
      script.events?.push('fee-read');
      if (script.oracleCall !== undefined) return script.oracleCall(tx.data, params?.[1]);
      return script.oracle ?? toHex(10n, { size: 32 });
    }
    if (method === 'eth_sendRawTransaction') {
      const bytes = params?.[0] as Hex;
      raw.push(bytes);
      script.events?.push('broadcast');
      return keccak256(bytes);
    }
    if (method === 'eth_getTransactionReceipt') return {
      transactionHash: HASH, blockHash: BLOCK, blockNumber: '0x10', status: '0x1', gasUsed: '0x186a0',
      effectiveGasPrice: toHex(GWEI), logs: [], transactionIndex: '0x0', cumulativeGasUsed: '0x186a0',
      ...(script.l1Fee === undefined ? {} : { l1Fee: script.l1Fee }), ...script.receipt,
    };
    if (method === 'eth_blockNumber') return '0x10';
    throw new Error('unexpected fixture RPC');
  })) as never }, { retryCount: 0 });
  const client = createViemChainClient({
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account }), account, chain,
  });
  return { client, raw, calls };
}

describe('R07-4 OP total-cost service regression', () => {
  it('quotes execution plus the additional OP reserve', async () => {
    const s = await service();
    expect((await s.quote()).fee).toBe('1419000'); // (130k + 300k) gwei * $3000 * the published 110%
  });

  it('refuses a daily budget that only covers execution gas', async () => {
    const s = await service({ daily: 160_000n * GWEI });
    await expect(s.send()).rejects.toMatchObject({ code: 'budget_exhausted' });
    expect(s.fake.sent).toHaveLength(0);
  });

  it('refuses a loss budget that only covers execution gas', async () => {
    const s = await service({ loss: 160_000n * GWEI });
    await expect(s.send()).rejects.toMatchObject({ code: 'loss_budget_exhausted' });
    expect(s.fake.sent).toHaveLength(0);
  });

  it('settles actual L1/operator fees once, including cost above the original reservation', async () => {
    const fake = new FeeChain(OP_ID);
    fake.receipt = { status: 'success', gasUsed: 100_000n, ...{ l1Fee: 900_000n * GWEI, operatorFee: 100_000n * GWEI } };
    const s = await service({ fake });
    await s.send();
    await settle();
    expect(decodeState(s.backend.text ?? '').get(OP_ID)?.budget.spentWei).toBe(1_100_000n * GWEI);
    expect(s.relayer.metrics.render()).toContain('relayer_gas_spent_wei_total{chain_id="84532"} 1100000000000000');
  });

  it('shares simultaneous quote reads, separates permit shapes and refreshes expired or clock-rollback entries', async () => {
    const s = await service();
    await Promise.all(Array.from({ length: 8 }, () => s.quote()));
    expect(s.fake.feeCalls).toEqual([[130_000n, true]]);
    await s.quote(NOPERMIT);
    expect(s.fake.feeCalls).toEqual([[130_000n, true], [100_000n, false]]);
    s.clock.ms += 3001;
    await s.quote();
    s.clock.ms -= 3002;
    await s.quote();
    expect(s.fake.feeReads).toBe(4);
  });

  it('counts persistent fee-oracle failures despite healthy gas-price reads, without leaking provider text', async () => {
    const fake = new FeeChain();
    fake.feeFailure = new Error('https://private-node.invalid/secret');
    const s = await service({ fake, cacheSeconds: 0 });
    for (let i = 0; i < 3; i++) await expect(s.quote()).rejects.toMatchObject({ message: 'rpc_unavailable', status: 503 });
    expect(s.relayer.service.health().chains[0]?.breaker).toBe('open');
  });

  it('a good oracle read resets only its own quote failure streak', async () => {
    const s = await service({ cacheSeconds: 0 });
    s.fake.feeFailure = new Error('fixture');
    await expect(s.quote()).rejects.toThrow('rpc_unavailable');
    await expect(s.quote()).rejects.toThrow('rpc_unavailable');
    s.fake.feeFailure = undefined;
    await s.quote();
    s.fake.feeFailure = new Error('fixture');
    await expect(s.quote()).rejects.toThrow('rpc_unavailable');
    expect(s.relayer.service.health().chains[0]?.breaker).toBe('closed');
  });

  it('checks fresh OP costs against the signed fee, without reusing quote cache in the send lane', async () => {
    const s = await service();
    s.fake.extra = 0n;
    expect((await s.quote()).fee).toBe('500000');
    s.fake.extra = EXTRA_RESERVE;
    await expect(s.send()).rejects.toMatchObject({ code: 'fee_below_gas_cost' });
    expect(s.fake.sent).toHaveLength(0);
    expect(s.fake.feeCalls).toEqual([[130_000n, true], [150_000n, false]]);
  });

  it('quotes the permit-capable shape but reserves the actual plain sweep after admission', async () => {
    const s = await service();
    await s.send();
    await settle();
    expect(s.fake.feeCalls).toEqual([[130_000n, true], [150_000n, false], [150_000n, false]]);
    expect(s.fake.sent[0]?.opts.additionalFeeReserve).toBe(EXTRA_RESERVE);
  });

  it('an oracle failure in the lane refuses without broadcasting or reserving daily budget', async () => {
    const s = await service();
    await s.quote();
    s.fake.feeFailure = new Error('private RPC details');
    await expect(s.send()).rejects.toMatchObject({ code: 'rpc_unavailable' });
    expect(s.fake.sent).toHaveLength(0);
    expect(s.backend.text).toBeNull();
  });

  it('retains missing fee receipts across restart, then settles the complete late receipt once', async () => {
    const old = await service();
    old.fake.receipt = { status: 'success', gasUsed: 100_000n };
    await old.send();
    await settle();
    const held = 150_000n * GWEI + EXTRA_RESERVE;
    expect(decodeState(old.backend.text ?? '').get(OP_ID)?.budget.spentWei).toBe(held);
    expect(decodeState(old.backend.text ?? '').get(OP_ID)?.sends).toHaveLength(1);
    old.relayer.dispose();
    const fake = new FeeChain();
    fake.lookup = { status: 'success', gasUsed: 100_000n, l1Fee: 10_000n * GWEI, operatorFee: 20_000n * GWEI };
    fake.receipt = { status: 'timeout', gasUsed: 0n };
    const restarted = await service({ backend: old.backend, fake });
    await restarted.send(2n);
    await settle();
    expect(decodeState(old.backend.text ?? '').get(OP_ID)?.budget.spentWei).toBe(130_000n * GWEI + held);
    expect(decodeState(old.backend.text ?? '').get(OP_ID)?.sends).toHaveLength(1);
    expect(restarted.relayer.metrics.render()).toContain('relayer_gas_spent_wei_total{chain_id="84532"} 130000000000000');
  });

  it.each(['success', 'reverted'] as const)('records %s overage and refuses further spending at the relevant limit', async (status) => {
    const fake = new FeeChain();
    fake.receipt = { status, gasUsed: 100_000n, l1Fee: 900_000n * GWEI, operatorFee: 100_000n * GWEI };
    const s = await service({ fake, ...(status === 'success' ? { daily: 500_000n * GWEI } : { loss: 500_000n * GWEI }) });
    await s.send();
    await settle();
    expect(decodeState(s.backend.text ?? '').get(OP_ID)?.budget.spentWei).toBe(1_100_000n * GWEI);
    await expect(s.send(2n)).rejects.toMatchObject({ code: status === 'success' ? 'budget_exhausted' : 'loss_budget_exhausted' });
    expect(s.fake.sent).toHaveLength(1);
  });
});

describe('R07-4 OP chain admission and receipt regression', () => {
  it('checks signed transaction fees before any broadcast', async () => {
    const s = rpcClient({ oracle: toHex(EXTRA_RESERVE, { size: 32 }) });
    await expect(s.client.sendSweep(order, sendOptions)).rejects.toBeInstanceOf(SendRefused);
    expect(s.raw).toHaveLength(0);
  });

  it.each(['0x', '0x01', `0x${'ff'.repeat(33)}`, 'private-rpc-error'])('refuses malformed oracle answer %s before broadcast', async (oracle) => {
    const s = rpcClient({ oracle });
    await expect(s.client.sendSweep(order, sendOptions)).rejects.toBeInstanceOf(SendRefused);
    expect(s.raw).toHaveLength(0);
  });

  it.each([undefined, '0x', '-1', '0x00', `0x1${'00'.repeat(32)}`])('retains an unsettled receipt with missing/malformed L1 fee %s', async (l1Fee) => {
    const s = rpcClient({ l1Fee });
    await expect(s.client.getReceipt(HASH)).rejects.toThrow('rpc_failure');
  });

  it('returns actual L1 fee plus operator fee read at the canonical receipt block', async () => {
    const s = rpcClient({ l1Fee: '0x64' });
    expect(await s.client.getReceipt(HASH)).toEqual({ status: 'success', gasUsed: 100_000n, l1Fee: 100n, operatorFee: 10n });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.block).toEqual({ blockHash: BLOCK, requireCanonical: true });
  });

  it('leaves a non-OP send and receipt unchanged without an oracle call', async () => {
    const s = rpcClient({ chainId: 11155111 });
    await s.client.sendSweep(order, sendOptions);
    expect(s.raw).toHaveLength(1);
    expect(await s.client.getReceipt(HASH)).toEqual({ status: 'success', gasUsed: 100_000n });
    expect(s.calls).toHaveLength(0);
  });

  it.each([false, true])('bounds and reprices actual legacy transaction bytes with permit=%s without double-counting signatures', async (withPermit) => {
    const s = rpcClient();
    const max = (1n << 256n) - 1n;
    expect(await s.client.estimateFeeReserve(max, withPermit)).toBe(40n);
    const sized = decodeFunctionData({ abi: oracleAbi, data: s.calls[0]?.data ?? '0x' });
    expect(sized.functionName).toBe('getL1FeeUpperBound');
    const fullOrder: SweepCall = {
      ...order,
      sweep: { ...order.sweep, amount: max, fee: max, deadline: max, nonce: max },
      permit: withPermit ? { value: max, deadline: max, v: 28, r: toHex(max), s: toHex(max) } : undefined,
    };
    await s.client.sendSweep(fullOrder, { ...sendOptions, nonce: Number.MAX_SAFE_INTEGER, gas: max, gasPrice: max });
    const signed = s.raw[0];
    if (signed === undefined) throw new Error('not sent');
    const tx = parseTransaction(signed);
    const exact = decodeFunctionData({ abi: oracleAbi, data: s.calls[2]?.data ?? '0x' });
    expect(exact.functionName).toBe('getL1Fee');
    if (exact.functionName !== 'getL1Fee' || sized.functionName !== 'getL1FeeUpperBound' || tx.type !== 'legacy') throw new Error('wrong calls');
    const unsigned = serializeTransaction({ type: 'legacy', chainId: OP_ID, nonce: tx.nonce, gas: tx.gas, gasPrice: tx.gasPrice, to: tx.to, value: tx.value, data: tx.data });
    expect(exact.args[0]).toBe(unsigned);
    expect(size(unsigned)).toBeLessThan(size(signed));
    expect(BigInt(size(unsigned))).toBeLessThanOrEqual(sized.args[0]);
    expect(size(tx.data ?? '0x')).toBe(withPermit ? 580 : 420);
    expect(s.calls.map((c) => decodeFunctionData({ abi: oracleAbi, data: c.data }).functionName))
      .toEqual(['getL1FeeUpperBound', 'getOperatorFee', 'getL1Fee', 'getOperatorFee']);
  });

  it('performs both exact signed-cost reads before the journal hook and broadcast', async () => {
    const events: string[] = [];
    const s = rpcClient({ events });
    await s.client.sendSweep(order, { ...sendOptions, onSigned: () => { events.push('journal'); } });
    expect(events).toEqual(['fee-read', 'fee-read', 'journal', 'broadcast']);
  });

  it('requires an explicit held OP reserve and accepts a genuine zero cost', async () => {
    const s = rpcClient({ oracle: toHex(0n, { size: 32 }), l1Fee: '0x0' });
    await expect(s.client.sendSweep(order, { nonce: 7, gas: 150_000n, gasPrice: GWEI })).rejects.toBeInstanceOf(SendRefused);
    expect(s.calls).toHaveLength(0);
    await s.client.sendSweep(order, { ...sendOptions, additionalFeeReserve: 0n });
    expect(await s.client.getReceipt(HASH)).toEqual({ status: 'success', gasUsed: 100_000n, l1Fee: 0n, operatorFee: 0n });
    expect(s.raw).toHaveLength(1);
  });

  it('a reverting or unavailable operator getter is not treated as zero', async () => {
    const s = rpcClient({ oracleCall: (data) => {
      const fn = decodeFunctionData({ abi: oracleAbi, data }).functionName;
      if (fn === 'getOperatorFee') throw Object.assign(new Error('execution reverted: private url'), { code: 3 });
      return toHex(10n, { size: 32 });
    }, l1Fee: '0x1' });
    await expect(s.client.estimateFeeReserve(100_000n, false)).rejects.toThrow('rpc_failure');
    await expect(s.client.sendSweep(order, sendOptions)).rejects.toThrow('send_refused');
    await expect(s.client.getReceipt(HASH)).rejects.toThrow('rpc_failure');
    expect(s.raw).toHaveLength(0);
  });

  it.each([{ blockHash: null }, { blockHash: '0xabc' }, { gasUsed: null }])('rejects incomplete receipt coordinates/usage %j', async (receipt) => {
    const s = rpcClient({ l1Fee: '0x1', receipt });
    await expect(s.client.getReceipt(HASH)).rejects.toThrow('rpc_failure');
  });

  it('maps missing receipt fee data to a timeout so the service retains its reservation', async () => {
    const s = rpcClient();
    expect(await s.client.waitForReceipt(HASH, 1000)).toEqual({ status: 'timeout', gasUsed: 0n });
  });

  it('the successful receipt-wait path carries both actual fee components', async () => {
    const s = rpcClient({ l1Fee: '0x64' });
    expect(await s.client.waitForReceipt(HASH, 1000)).toEqual({ status: 'success', gasUsed: 100_000n, l1Fee: 100n, operatorFee: 10n });
  });

  it('non-OP estimation returns zero without making an oracle request', async () => {
    const s = rpcClient({ chainId: 11155111 });
    expect(await s.client.estimateFeeReserve(150_000n, true)).toBe(0n);
    expect(s.calls).toHaveLength(0);
  });
});

describe('R07-4 daily budget actual settlement', () => {
  it('records overages above the daily cap and keeps remaining budget at zero', () => {
    const b = new DailyBudget(100n, () => NOW_MS);
    expect(b.reserve(80n)).toBe(true);
    b.settle(80n, 120n, b.currentDay);
    expect(b.used).toBe(120n);
    expect(b.remaining).toBe(0n);
    expect(b.reserve(1n)).toBe(false);
  });

  it('does not release or charge a prior day settlement against a fresh day', () => {
    let now = NOW_MS;
    const b = new DailyBudget(100n, () => now);
    b.reserve(80n);
    const oldDay = b.currentDay;
    now += 86_400_000;
    b.reserve(40n);
    b.settle(80n, 20n, oldDay);
    b.settle(80n, 120n, oldDay);
    expect(b.used).toBe(40n);
  });
});

describe.each([OP_ID, 11155111])('inherited R07 receipt status admission on chain %s', (chainId) => {
  for (const method of ['lookup', 'wait'] as const) {
    it.each([undefined, null, '0x2', '0x02'])(`${method} refuses missing or unknown mined status %s`, async (status) => {
      const s = rpcClient({ chainId, l1Fee: '0x1', receipt: { status } });
      if (method === 'lookup') await expect(s.client.getReceipt(HASH)).rejects.toThrow('rpc_failure');
      else expect(await s.client.waitForReceipt(HASH, 1000)).toEqual({ status: 'timeout', gasUsed: 0n });
      expect(s.calls).toHaveLength(0); // refusal precedes even the OP fee read
    });

    it.each([['0x1', 'success'], ['0x0', 'reverted']] as const)(`${method} preserves valid %s status`, async (status, expected) => {
      const s = rpcClient({ chainId, l1Fee: '0x1', receipt: { status } });
      const receipt = method === 'lookup' ? await s.client.getReceipt(HASH) : await s.client.waitForReceipt(HASH, 1000);
      expect(receipt).toMatchObject({ status: expected, gasUsed: 100_000n });
      if (chainId === OP_ID) expect(receipt).toMatchObject({ l1Fee: 1n, operatorFee: 10n });
    });
  }
});
