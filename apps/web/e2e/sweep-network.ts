import { expect, type BrowserContext, type Page } from '@playwright/test';
import { ghostPayRouterAbi, grossForNet, type Address, type Hex } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, keccak256, parseAbi, parseTransaction, recoverTransactionAddress, toBytes } from 'viem';
import { makeLog } from '../src/test/announcements';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER } from '../src/test/fakeManifest';
import { ORIGIN } from './helpers';

export const SWEEP_RPC = 'https://rpc.sweep.e2e.test';
export const SWEEP_JOURNAL = 'ghostpay.sweep-attempts.v1';
export const DESTINATION = '0x6666666666666666666666666666666666666666';
const ORACLE = '0x420000000000000000000000000000000000000f';
const CODE: Readonly<Record<string, Hex>> = {
  [FAKE_ROUTER]: '0x60016000',
  [FAKE_SWEEP_RELAYER]: '0x60026000',
  [FAKE_ANNOUNCER.toLowerCase()]: '0x60036000',
};
const word = (value: string): Hex => `0x${value.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
const selector = (signature: string): string => keccak256(toBytes(signature)).slice(0, 10);
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const erc20 = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

function isEip1559Raw(raw: Hex): raw is `0x02${string}` {
  return raw.startsWith('0x02');
}

export interface JournalLock {
  chainId: number;
  owner: string;
  nonce: number;
  expectedHash: string;
  status: string;
}

export function readSweepJournal(page: Page): Promise<JournalLock[]> {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '[]') as JournalLock[], SWEEP_JOURNAL);
}

/** Authored RPC evidence only: actual built Worker, signing and journal code remain untouched. */
export async function installSweepNetwork(context: BrowserContext, page: Page, outcome: 'success' | 'unknown') {
  const state = {
    evidence: undefined as { txHash: string; transaction: unknown; receipt: unknown } | undefined,
    logs: [] as unknown[],
    owner: '',
    asset: '',
    amount: 0n,
    raws: [] as Hex[],
    handoffLocks: [] as JournalLock[][],
    methods: [] as string[],
    unexpected: [] as string[],
    mined: false,
    releaseBroadcast: undefined as (() => void) | undefined,
  };
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
    state.unexpected.push(url.origin);
    return route.abort();
  });
  await context.route(`${SWEEP_RPC}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { id: number; method: string; params: unknown[] };
    state.methods.push(body.method);
    const reply = (result: unknown) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
    switch (body.method) {
      case 'eth_chainId': return reply('0x14a34');
      case 'eth_blockNumber': return reply('0x1f4');
      case 'eth_getBlockByNumber': {
        const n = body.params[0] === 'finalized' ? 500 : Number.parseInt(String(body.params[0]), 16);
        return reply({ number: `0x${n.toString(16)}`, hash: word(n.toString(16)), parentHash: word((n - 1).toString(16)), timestamp: '0x6b49d200' });
      }
      case 'eth_getLogs': {
        const filter = body.params[0] as { fromBlock: string; toBlock: string; address?: string | string[]; topics?: (string | string[] | null)[] };
        const addresses = filter.address === undefined ? undefined : [filter.address].flat().map((address) => address.toLowerCase());
        return reply(state.logs.filter((raw) => {
          const log = raw as { blockNumber: string; address: string; topics: string[] };
          const block = Number.parseInt(log.blockNumber, 16);
          return block >= Number.parseInt(filter.fromBlock, 16) && block <= Number.parseInt(filter.toBlock, 16)
            && (addresses === undefined || addresses.includes(log.address.toLowerCase()))
            && (filter.topics ?? []).every((topic, i) => topic === null || [topic].flat().some((t) => t.toLowerCase() === log.topics[i]?.toLowerCase()));
        }));
      }
      case 'eth_getCode': return reply(CODE[String(body.params[0]).toLowerCase()] ?? '0x');
      case 'eth_getBalance': return reply('0x16345785d8a0000'); // 0.1 authored ETH for gas.
      case 'eth_gasPrice': return reply('0x3b9aca00');
      case 'eth_getTransactionCount': return reply('0x0');
      case 'eth_estimateGas': return reply('0xc350');
      case 'eth_call': {
        const call = body.params[0] as { to: string; data: string };
        const to = call.to.toLowerCase();
        if (to === FAKE_ROUTER) {
          if (call.data.startsWith(selector('FEE_RECIPIENT()'))) return reply(word(FAKE_FEE_RECIPIENT));
          if (call.data.startsWith(selector('ANNOUNCER()'))) return reply(word(FAKE_ANNOUNCER));
          if (call.data.startsWith(selector('FEE_BPS()'))) return reply(word('19'));
        }
        if (to === ORACLE) return reply(word('0')); // OP-stack fee reads, as in Sweep.test.tsx.
        if (to === state.asset.toLowerCase() && call.data.startsWith('0x70a08231')) return reply(word(state.amount.toString(16)));
        if (to === state.asset.toLowerCase() && call.data.startsWith('0xa9059cbb')) return reply(word('1')); // Actual directSweep dry run.
        state.unexpected.push(`eth_call:${to}:${call.data.slice(0, 10)}`);
        return reply(null);
      }
      case 'eth_getTransactionByHash': {
        const hash = String(body.params[0]).toLowerCase();
        const evidence = state.evidence;
        if (evidence !== undefined && hash === evidence.txHash.toLowerCase()) return reply(evidence.transaction);
        const known = state.raws.some((raw) => keccak256(raw) === hash);
        return reply(outcome === 'success' && known ? { hash } : null);
      }
      case 'eth_getTransactionReceipt': {
        const hash = String(body.params[0]).toLowerCase();
        const evidence = state.evidence;
        if (evidence !== undefined && hash === evidence.txHash.toLowerCase()) return reply(evidence.receipt);
        const raw = state.raws.find((candidate) => keccak256(candidate) === hash);
        return reply(state.mined && raw !== undefined ? { transactionHash: hash, status: '0x1' } : null);
      }
      case 'eth_sendRawTransaction': {
        const raw = body.params[0] as Hex;
        if (!isEip1559Raw(raw)) throw new Error('Expected an EIP-1559 direct sweep transaction.');
        state.raws.push(raw);
        // Observe storage at the real raw-broadcast boundary, before replying to the actual directSweep request.
        const locks = await readSweepJournal(page);
        state.handoffLocks.push(locks);
        expect(locks).toHaveLength(1);
        expect(Object.keys(locks[0] ?? {}).sort((a, b) => {
          if (a < b) return -1;
          if (a > b) return 1;
          return 0;
        })).toEqual(['chainId', 'expectedHash', 'nonce', 'owner', 'status']);
        expect(locks[0]).toEqual({ chainId: 84532, owner: state.owner, nonce: 0, expectedHash: keccak256(raw), status: 'unknown-after-handoff' });
        const tx = parseTransaction(raw);
        expect(tx.chainId).toBe(84532);
        expect(tx.nonce).toBe(0);
        expect(tx.to?.toLowerCase()).toBe(state.asset.toLowerCase());
        expect(tx.value ?? 0n).toBe(0n);
        expect((await recoverTransactionAddress({ serializedTransaction: raw })).toLowerCase()).toBe(state.owner.toLowerCase());
        const transfer = decodeFunctionData({ abi: erc20, data: tx.data ?? '0x' });
        expect(transfer.functionName).toBe('transfer');
        expect(transfer.args[0].toLowerCase()).toBe(DESTINATION.toLowerCase());
        expect(transfer.args[1]).toBe(state.amount);
        // The generic RPC client may retry the same raw bytes after a transport failure. Hold only the first request;
        // transport retries must not become a fresh signature or nonce, and are counted separately by the spec.
        if (state.raws.length === 1) await new Promise<void>((resolve) => { state.releaseBroadcast = resolve; });
        return outcome === 'success' ? reply(keccak256(raw)) : route.abort('connectionreset');
      }
      default:
        state.unexpected.push(body.method);
        return reply(null);
    }
  });
  return {
    state,
    setPayment(metaAddress: string) {
      const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress, block: 120, index: 1, caller: FAKE_ROUTER, amount: 5_000_000n });
      const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], mine.log.data as Hex);
      const parsed = parseMetadata(metadata);
      if (parsed.kind !== 'erc20') throw new Error('ERC20 fixture required');
      const payer = `0x${'7'.repeat(40)}`;
      const txHash = mine.log.transactionHash as string;
      const transfer = { address: parsed.token.toLowerCase(), topics: [TRANSFER, word(payer), word(mine.stealthAddress)], data: word(parsed.netAmount.toString(16)), blockNumber: mine.log.blockNumber, blockHash: mine.log.blockHash, transactionHash: txHash, logIndex: '0x0' };
      const common = { to: FAKE_ROUTER, from: payer, blockHash: mine.log.blockHash, blockNumber: mine.log.blockNumber };
      state.logs = [mine.log, transfer];
      state.owner = mine.stealthAddress;
      state.asset = parsed.token;
      state.amount = parsed.netAmount;
      state.evidence = { txHash, transaction: { ...common, hash: txHash, value: '0x0', input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20', args: [parsed.token, mine.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata] }) }, receipt: { ...common, status: '0x1', transactionHash: txHash, logs: [transfer, mine.log] } };
      return mine;
    },
  };
}
