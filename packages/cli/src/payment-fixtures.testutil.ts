import { encodeAbiParameters, encodeFunctionData, keccak256 } from 'viem/utils';
import {
  ANNOUNCEMENT_TOPIC, CANONICAL_ANNOUNCER, ghostPayRouterAbi, manifestDigest, validateManifest,
  type Hex, type RpcTransport,
} from '@ghostpay/chain-adapters';
import { buildNativeMetadata } from '@ghostpay/core-crypto';
import { G, makeIo, type TestIo } from './fixtures.testutil.js';

export const ROUTER = '0x0000000000000000000000000000000000000b22';
export const RELAYER = '0x0000000000000000000000000000000000000c33';
export const FEE_RECIPIENT = '0x0000000000000000000000000000000000000d44';
export const RECIPIENT = '0x1111111111111111111111111111111111111111';
export const PAYER = '0x2222222222222222222222222222222222222222';
export const BLOCK: Hex = `0x${'ab'.repeat(32)}`;
export const TX: Hex = `0x${'cd'.repeat(32)}`;
export const ROUTER_CODE = '0x60016000';
export const RELAYER_CODE = '0x60026000';
export const pad = (a: string): Hex => `0x${a.slice(2).padStart(64, '0')}`;
export const word = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`;
export const metadata: Hex = `0x${Buffer.from(buildNativeMetadata(7, 100n)).toString('hex')}`;

export function rawLog(): Record<string, unknown> {
  return {
    address: CANONICAL_ANNOUNCER,
    topics: [ANNOUNCEMENT_TOPIC, word(1n), pad(RECIPIENT), pad(ROUTER)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${G}`, metadata]),
    blockNumber: '0x64', blockHash: BLOCK, transactionHash: TX, logIndex: '0x4',
  };
}

export function observation(): Record<string, unknown> {
  return {
    version: 1, family: 'evm', chainId: 11155111,
    expected: { recipient: RECIPIENT, asset: 'native', amount: '100' },
    log: rawLog(),
  };
}

export function manifestWire(): Record<string, unknown> {
  return {
    chainId: 11155111, announcer: CANONICAL_ANNOUNCER, router: ROUTER,
    sweepRelayer: RELAYER, feeRecipient: FEE_RECIPIENT, feeBps: 25,
    deployTx: { router: `0x${'1'.repeat(64)}`, sweepRelayer: `0x${'2'.repeat(64)}` },
    solcVersion: '0.8.28', commit: 'a'.repeat(40),
    bytecodeHashes: { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE) },
    date: '2026-01-01T00:00:00Z',
  };
}

export const PIN = manifestDigest(validateManifest(manifestWire(), 11155111));

export function paymentWorld(): {
  io: TestIo & { rpcTransport: RpcTransport };
  calls: { url: string; method: string; params: readonly unknown[] }[];
  state: {
    chainId: string; head: string; blockHash: string; code: string; receipt: unknown; tx: unknown;
    fail: boolean; logs: readonly unknown[]; secondaryBlockHash: string | undefined; blockReads: number; reorgAfter: number | undefined;
  };
} {
  const calls: { url: string; method: string; params: readonly unknown[] }[] = [];
  const common = { blockHash: BLOCK, blockNumber: '0x64', from: PAYER, to: ROUTER, transactionIndex: '0x0' };
  const state = {
    chainId: '0xaa36a7', head: '0xc8', blockHash: BLOCK as string, code: ROUTER_CODE as string, fail: false,
    receipt: { ...common, status: '0x1', transactionHash: TX, logs: [rawLog()] } as unknown,
    tx: { ...common, hash: TX, input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative',
      args: [RECIPIENT, 100n, 1_900_000_000n, `0x${G}`, metadata] }), value: '0x64' } as unknown,
    logs: [rawLog()] as readonly unknown[], secondaryBlockHash: undefined as string | undefined,
    blockReads: 0, reorgAfter: undefined as number | undefined,
  };
  const io = Object.assign(makeIo({
    'claim.json': JSON.stringify(observation()), 'manifest.json': JSON.stringify(manifestWire()),
    'rpc.txt': 'https://primary.example.test/PRIVATE_API_TOKEN', 'secondary.txt': 'https://secondary.example.test/PRIVATE_API_TOKEN',
  }), { rpcTransport: {
    send(url: string, body: string): Promise<string> {
      const request = JSON.parse(body) as { id: number; method: string; params: readonly unknown[] };
      const { id, method, params } = request;
      calls.push({ url, method, params });
      if (state.fail) throw new Error('PRIVATE_API_TOKEN must not escape');
      let result: unknown;
      if (method === 'eth_chainId') result = state.chainId;
      else if (method === 'eth_blockNumber') result = state.head;
      else if (method === 'eth_getCode') result = params[0] === ROUTER || String(params[0]).toLowerCase() === ROUTER
        ? state.code : String(params[0]).toLowerCase() === RELAYER ? RELAYER_CODE : '0x6003';
      else if (method === 'eth_call') {
        const data = (params[0] as { data: string }).data;
        if (data === encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'FEE_BPS' })) result = word(25n);
        else if (data === encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'FEE_RECIPIENT' })) result = pad(FEE_RECIPIENT);
        else if (data === encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'ANNOUNCER' })) result = pad(CANONICAL_ANNOUNCER);
      } else if (method === 'eth_getBlockByNumber') {
        state.blockReads++;
        result = { number: params[0], hash: state.reorgAfter !== undefined && state.blockReads > state.reorgAfter ? `0x${'ee'.repeat(32)}`
          : url.includes('secondary') ? state.secondaryBlockHash ?? state.blockHash : state.blockHash,
        parentHash: `0x${'11'.repeat(32)}` };
      } else if (method === 'eth_getTransactionReceipt') result = state.receipt;
      else if (method === 'eth_getTransactionByHash') result = state.tx;
      else if (method === 'eth_getLogs') {
        const filter = params[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
        result = state.logs.filter((entry) => {
          const log = entry as { blockNumber: string; topics: string[] };
          return BigInt(log.blockNumber) >= BigInt(filter.fromBlock) && BigInt(log.blockNumber) <= BigInt(filter.toBlock) &&
            (filter.topics[3] === undefined || filter.topics[3] === null || filter.topics[3] === log.topics[3]);
        });
      }
      if (result === undefined) throw new Error('unexpected fixture request');
      return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id, result }));
    },
  } });
  return { io, calls, state };
}

export const VERIFY_ARGS = ['--in', 'claim.json', '--manifest', 'manifest.json', '--manifest-digest', PIN, '--online', '--rpc-file', 'rpc.txt'];
