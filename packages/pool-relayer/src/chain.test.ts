import { createServer, type Server } from 'node:http';
import { encodeAbiParameters, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createViemChainPort } from './chain.js';
import { SimulationRevert } from './errors.js';
import { DEST, POOL, goodRequest } from './harness.testutil.js';

interface Mode {
  estimate: 'ok' | 'revert' | 'down';
  receipt: 'ok' | 'reverted' | 'none';
  chainId: string;
}
const mode: Mode = { estimate: 'ok', receipt: 'ok', chainId: '0x7a69' };
const H32: Hex = `0x${'11'.repeat(32)}`;
const seen: string[] = [];
let srv: Server;
let url = '';

function result(method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string; data?: string } } {
  seen.push(method);
  switch (method) {
    case 'eth_chainId':
      return { result: mode.chainId };
    case 'eth_gasPrice':
      return { result: '0x3e8' };
    case 'eth_getBalance':
      return { result: '0xde0b6b3a7640000' };
    case 'eth_blockNumber':
      return { result: '0x10' };
    case 'eth_getBlockByNumber':
      return { result: { number: '0x10', hash: H32, parentHash: H32, timestamp: '0xf4240', nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: DEST, extraData: '0x', transactions: [], uncles: [], baseFeePerGas: '0x1', logsBloom: `0x${'00'.repeat(256)}`, sha3Uncles: H32, stateRoot: H32, receiptsRoot: H32, transactionsRoot: H32, mixHash: H32, size: '0x1' } };
    case 'eth_call': {
      const data = (params[0] as { data: string }).data;
      if (data.length === 10) return { result: encodeAbiParameters([{ type: 'uint256' }], [777n]) };
      return { result: encodeAbiParameters([{ type: 'bool' }], [true]) };
    }
    case 'eth_estimateGas':
      if (mode.estimate === 'revert') return { error: { code: 3, message: 'execution reverted: InvalidProof', data: '0x09bde339' } };
      if (mode.estimate === 'down') return { error: { code: -32000, message: 'node on fire' } };
      return { result: '0x30d40' };
    case 'eth_getTransactionCount':
      return { result: '0x0' };
    case 'eth_sendRawTransaction':
      return { result: H32 };
    case 'eth_getTransactionReceipt':
      if (mode.receipt === 'none') return { result: null };
      return { result: { transactionHash: H32, blockHash: H32, blockNumber: '0x10', transactionIndex: '0x0', from: DEST, to: POOL, cumulativeGasUsed: '0x5', gasUsed: '0x5', effectiveGasPrice: '0x2', status: mode.receipt === 'ok' ? '0x1' : '0x0', logs: [], logsBloom: `0x${'00'.repeat(256)}`, type: '0x2', contractAddress: null } };
    default:
      return { error: { code: -32601, message: 'method not found' } };
  }
}

beforeAll(async () => {
  srv = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const b = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; method: string; params: unknown[] } | { id: number; method: string; params: unknown[] }[];
      const one = (r: { id: number; method: string; params: unknown[] }) => ({ jsonrpc: '2.0', id: r.id, ...result(r.method, r.params) });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(Array.isArray(b) ? b.map(one) : one(b)));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${String((srv.address() as { port: number }).port)}`;
});
afterAll(() => {
  srv.close();
});

const account = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const mk = () => createViemChainPort({ chainId: 31337, rpcUrl: url, account });

describe('viem chain port (fake JSON-RPC node)', () => {
  it('reads state', async () => {
    const c = mk();
    mode.chainId = '0x7a69';
    await expect(c.verifyChain()).resolves.toBeUndefined();
    expect(c.relayerAddress).toBe(account.address);
    expect(await c.getGasPrice()).toBe(1000n);
    expect(await c.getBalance()).toBe(10n ** 18n);
    expect(await c.blockTimestamp()).toBe(1_000_000n);
    expect(await c.readScope(POOL)).toBe(777n);
    expect(await c.isKnownRoot(POOL, 1n)).toBe(true);
    expect(await c.nullifierSpent(POOL, 1n)).toBe(true);
    mode.chainId = '0x1';
    await expect(c.verifyChain()).rejects.toThrow(/mismatch/);
    mode.chainId = '0x7a69';
  });
  it('simulates, sends, waits', async () => {
    const c = mk();
    const r = goodRequest();
    mode.estimate = 'ok';
    expect((await c.simulateWithdraw(POOL, r.withdrawal, r.proof)).gasLimit).toBe((200_000n * 120n) / 100n);
    expect(await c.sendWithdraw(POOL, r.withdrawal, r.proof, { gas: 300_000n, gasPrice: 1000n })).toBe(H32);
    expect(await c.waitForReceipt(H32, 2000)).toEqual({ status: 'success', costWei: 10n });
    mode.receipt = 'reverted';
    expect((await c.waitForReceipt(H32, 2000)).status).toBe('reverted');
    mode.receipt = 'none';
    expect(await c.waitForReceipt(H32, 300)).toEqual({ status: 'timeout', costWei: 0n });
    mode.receipt = 'ok';
  });
  it('maps reverts and node failures differently', async () => {
    const c = mk();
    const r = goodRequest();
    mode.estimate = 'revert';
    await expect(c.simulateWithdraw(POOL, r.withdrawal, r.proof)).rejects.toBeInstanceOf(SimulationRevert);
    mode.estimate = 'down';
    await expect(c.simulateWithdraw(POOL, r.withdrawal, r.proof)).rejects.not.toBeInstanceOf(SimulationRevert);
    mode.estimate = 'ok';
    expect(seen.length).toBeGreaterThan(5);
  });
});
