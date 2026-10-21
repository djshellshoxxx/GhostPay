import { createPublicClient, createWalletClient, custom, defineChain, encodeErrorResult, parseTransaction, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ghostPaySweepRelayerAbi } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { createViemChainClient, type SweepCall } from './chain.js';
import { SimulationRevert } from './errors.js';
import { CHAIN_ID, DEST, FEE_TO, OWNER, OWNER_KEY, SWEEP_CONTRACT, USDC } from './harness.testutil.js';

const chain = defineChain({ id: CHAIN_ID, name: 'T', nativeCurrency: { name: 'E', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://unused.invalid'] } } });
const account = privateKeyToAccount(OWNER_KEY);
const HASH: Hex = `0x${'ab'.repeat(32)}`;

interface Script {
  call?: () => unknown;
  estimate?: () => unknown;
  receipt?: () => unknown;
  raw: string[];
}

function rpcError(code: number, message: string, data?: Hex): Error {
  return Object.assign(new Error(message), { code, ...(data === undefined ? {} : { data }) });
}

function setup(script: Script) {
  const request = ({ method }: { method: string; params?: unknown }): Promise<unknown> => {
    switch (method) {
      case 'eth_chainId': return Promise.resolve(toHex(CHAIN_ID));
      case 'eth_gasPrice': return Promise.resolve('0x3b9aca00');
      case 'eth_getBalance': return Promise.resolve('0xde0b6b3a7640000');
      case 'eth_getTransactionCount': return Promise.resolve('0x7');
      case 'eth_call':
        try {
          return Promise.resolve(script.call?.() ?? '0x');
        } catch (e) {
          return Promise.reject(e instanceof Error ? e : new Error('x'));
        }
      case 'eth_estimateGas':
        try {
          return Promise.resolve(script.estimate?.() ?? '0x186a0');
        } catch (e) {
          return Promise.reject(e instanceof Error ? e : new Error('x'));
        }
      case 'eth_sendRawTransaction':
        return Promise.resolve(HASH);
      case 'eth_getTransactionReceipt': {
        const r = script.receipt?.();
        return Promise.resolve(r === undefined ? null : r);
      }
      case 'eth_fillTransaction':
        return Promise.reject(rpcError(-32601, 'the method eth_fillTransaction does not exist'));
      case 'eth_getBlockByNumber':
        return Promise.resolve({
          number: '0x1', hash: HASH, parentHash: HASH, nonce: '0x0000000000000000', sha3Uncles: HASH, logsBloom: `0x${'00'.repeat(256)}`,
          transactionsRoot: HASH, stateRoot: HASH, receiptsRoot: HASH, miner: account.address, difficulty: '0x0', totalDifficulty: '0x0',
          extraData: '0x', size: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', timestamp: '0x1', transactions: [], uncles: [], baseFeePerGas: '0x1',
        });
      default:
        return Promise.reject(new Error(`unexpected ${method}`));
    }
  };
  const transport = custom({ request: request as never }, { retryCount: 0 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport, account });
  const orig = walletClient.request.bind(walletClient);
  void orig;
  const wrapped = custom({
    request: (async (args: { method: string; params?: unknown }) => {
      if (args.method === 'eth_sendRawTransaction') script.raw.push((args.params as string[])[0] as string);
      return request(args);
    }) as never,
  }, { retryCount: 0 });
  const wallet = createWalletClient({ chain, transport: wrapped, account });
  return createViemChainClient({ publicClient, walletClient: wallet, account, chain, receiptPollMs: 5 });
}

const call: SweepCall = {
  sweepRelayer: SWEEP_CONTRACT,
  sweep: { token: USDC, owner: OWNER, destination: DEST, feeTo: FEE_TO, amount: 1000n, fee: 10n, deadline: 2_000_000_000n, nonce: 4n },
  sweepSig: `0x${'11'.repeat(65)}`,
  permit: undefined,
};
const permitCall: SweepCall = { ...call, permit: { value: 1000n, deadline: 2_000_000_000n, v: 27, r: `0x${'aa'.repeat(32)}`, s: `0x${'bb'.repeat(32)}` } };

describe('createViemChainClient', () => {
  it('reads gas price, balance and the pending nonce', async () => {
    const c = setup({ raw: [] });
    expect(c.chainId).toBe(CHAIN_ID);
    expect(c.relayerAddress).toBe(account.address);
    expect(await c.getGasPrice()).toBe(1_000_000_000n);
    expect(await c.getBalance()).toBe(10n ** 18n);
    expect(await c.getPendingNonce()).toBe(7);
  });

  it('simulates both entrypoints and adds 20% gas headroom', async () => {
    const c = setup({ raw: [] });
    expect(await c.simulateSweep(call)).toEqual({ gasLimit: 120_000n });
    expect(await c.simulateSweep(permitCall)).toEqual({ gasLimit: 120_000n });
  });

  it('classifies reverts by decoded custom error name', async () => {
    const data = encodeErrorResult({ abi: ghostPaySweepRelayerAbi, errorName: 'NonceAlreadyUsed' });
    const c = setup({
      raw: [],
      call: () => {
        throw rpcError(3, 'execution reverted', data);
      },
    });
    await expect(c.simulateSweep(call)).rejects.toMatchObject({ name: 'SimulationRevert', errorName: 'NonceAlreadyUsed' });
    await expect(c.simulateSweep(permitCall)).rejects.toBeInstanceOf(SimulationRevert);
  });

  it('classifies unknown-selector and data-less reverts without a name', async () => {
    const unknown = setup({
      raw: [],
      call: () => {
        throw rpcError(3, 'execution reverted', '0xdeadbeef');
      },
    });
    await expect(unknown.simulateSweep(call)).rejects.toMatchObject({ name: 'SimulationRevert', errorName: undefined });
    const bare = setup({
      raw: [],
      call: () => {
        throw rpcError(3, 'execution reverted');
      },
    });
    await expect(bare.simulateSweep(call)).rejects.toMatchObject({ name: 'SimulationRevert' });
  });

  it('treats a failing estimate as a revert and transport errors as operational failures', async () => {
    const est = setup({
      raw: [],
      estimate: () => {
        throw rpcError(3, 'execution reverted', encodeErrorResult({ abi: ghostPaySweepRelayerAbi, errorName: 'Expired' }));
      },
    });
    await expect(est.simulateSweep(call)).rejects.toMatchObject({ errorName: 'Expired' });
    const down = setup({
      raw: [],
      call: () => {
        throw new Error('socket hang up');
      },
    });
    const err = await down.simulateSweep(call).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SimulationRevert);
    const plain = await setup({ raw: [], call: () => { throw new Error('not rpc shaped'); } }).simulateSweep(call).catch((e: unknown) => e);
    expect(plain).not.toBeInstanceOf(SimulationRevert);
  });

  it('signs legacy transactions with the chosen nonce, gas and gas price', async () => {
    const raw: string[] = [];
    const c = setup({ raw });
    expect(await c.sendSweep(call, { nonce: 9, gas: 123_456n, gasPrice: 2_000_000_000n })).toBe(HASH);
    expect(await c.sendSweep(permitCall, { nonce: 10, gas: 223_456n, gasPrice: 2_000_000_000n })).toBe(HASH);
    const tx = parseTransaction(raw[0] as Hex);
    expect(tx).toMatchObject({ nonce: 9, gas: 123_456n, gasPrice: 2_000_000_000n, chainId: CHAIN_ID, to: SWEEP_CONTRACT.toLowerCase() });
    expect(parseTransaction(raw[1] as Hex)).toMatchObject({ nonce: 10, gas: 223_456n });
  });

  it('summarizes receipts and maps timeouts', async () => {
    const receipt = (status: '0x1' | '0x0') => () => ({
      blockHash: HASH, blockNumber: '0x1', contractAddress: null, cumulativeGasUsed: '0x186a0', effectiveGasPrice: '0x1',
      from: account.address, gasUsed: '0x186a0', logs: [], logsBloom: `0x${'00'.repeat(256)}`, status, to: SWEEP_CONTRACT,
      transactionHash: HASH, transactionIndex: '0x0', type: '0x0',
    });
    expect(await setup({ raw: [], receipt: receipt('0x1') }).waitForReceipt(HASH, 1000)).toEqual({ status: 'success', gasUsed: 100_000n });
    expect(await setup({ raw: [], receipt: receipt('0x0') }).waitForReceipt(HASH, 1000)).toEqual({ status: 'reverted', gasUsed: 100_000n });
    expect(await setup({ raw: [] }).waitForReceipt(HASH, 60)).toEqual({ status: 'timeout', gasUsed: 0n });
  });
});
