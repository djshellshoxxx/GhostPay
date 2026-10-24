import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ANNOUNCEMENT_TOPIC, erc20Abi, type RpcLog } from '@ghostpay/chain-adapters';
import type { RandomSource } from '@ghostpay/core-crypto';
import {
  ghostPayPolicyRouterAbi,
  policyAccountAbi,
  policyAccountFactoryAbi,
  type Address,
  type Hex,
} from '@ghostpay/policy-scheme';
import type { Abi } from 'viem';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, getAddress } from 'viem/utils';
import { mockRpc, type MockRpc } from '../../test/mockRpc';
import type { PolicyChainDeployment } from './chain';

interface VectorAccount {
  id: string;
  spendingPrivateKey: Hex;
  viewingPrivateKey: Hex;
  ephemeralPrivateKey: Hex;
  spendingPublicKey: Hex;
  viewingPublicKey: Hex;
  metaAddress: string;
  policy: { destination: Address; delaySeconds: string; limitsRoot: Hex; tree: string | null };
  policyHash: Hex;
  ephemeralPublicKey: Hex;
  viewTag: Hex;
  ownerAddress: Address;
  accountAddress: Address;
}
interface VectorTree { id: string; root: Hex; leaves: { token: Address; limit: string; windowSeconds: string }[] }
export interface PolicyVectors {
  deployment: { chainId: number; implementation: Address; factory: Address };
  limitTrees: VectorTree[];
  accounts: VectorAccount[];
}

const root = resolve(import.meta.dirname, '../../../../..');
export const vectors = JSON.parse(readFileSync(resolve(root, 'test-vectors/policy-scheme.json'), 'utf8')) as PolicyVectors;
export const clientVectors = JSON.parse(readFileSync(resolve(root, 'packages/policy-scheme/vectors/client-v1.json'), 'utf8')) as {
  records: { valid: { id: string; canonical: string }[] };
};

export const SEPOLIA = 11155111;
export const ROUTER: Address = '0x1111111111111111111111111111111111111112';
export const FEE_RECIPIENT: Address = '0x2222222222222222222222222222222222222223';
export const ANNOUNCER: Address = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';

/** Vector factory/implementation, placed on Sepolia for UI tests (no real deployment exists). */
export const DEPLOYMENT: PolicyChainDeployment = Object.freeze({
  chainId: SEPOLIA,
  factory: vectors.deployment.factory,
  implementation: vectors.deployment.implementation,
  router: ROUTER,
  feeRecipient: FEE_RECIPIENT,
  announcer: ANNOUNCER,
  flatFee: 0n,
});

export function account(id: string): VectorAccount {
  const a = vectors.accounts.find((x) => x.id === id);
  if (a === undefined) throw new Error(id);
  return a;
}

export function limitRows(a: VectorAccount): { token: string; limit: string; windowSeconds: string }[] {
  const t = vectors.limitTrees.find((x) => x.id === a.policy.tree);
  return (t?.leaves ?? []).map((l) => ({ token: l.token, limit: l.limit, windowSeconds: l.windowSeconds }));
}

export const hexToU8 = (h: string): Uint8Array => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

/** RNG that returns the given 32-byte chunk (ephemeral key from the vectors). */
export function fixedRng(chunk: Hex): RandomSource {
  const bytes = hexToU8(chunk);
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes.subarray(0, array.byteLength));
      return array;
    },
  };
}

const word = (a: string): Hex => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;

/** A scheme-2 Announcement log as the announcer emits it. */
export function scheme2Log(opts: { stealth: Address; ephemeralPublicKey: Hex; metadata: Hex; block: number; index?: number; caller?: Address; schemeId?: bigint }): RpcLog {
  const block = opts.block;
  return {
    address: ANNOUNCER,
    topics: [ANNOUNCEMENT_TOPIC, word(`0x${(opts.schemeId ?? 0x47500002n).toString(16)}`), word(opts.stealth), word(opts.caller ?? ROUTER)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [opts.ephemeralPublicKey, opts.metadata]),
    blockNumber: `0x${block.toString(16)}`,
    blockHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex: `0x${(opts.index ?? 0).toString(16)}`,
    transactionHash: `0x${(block * 4096 + (opts.index ?? 0)).toString(16).padStart(64, '0')}`,
  };
}

/** A PolicyAccount event log. */
export function accountLog(acct: Address, eventName: string, args: Record<string, unknown>, block: number): RpcLog {
  const ev = (policyAccountAbi as Abi).find((x) => x.type === 'event' && x.name === eventName) as unknown as { inputs: { name: string; type: string; indexed?: boolean }[] };
  const anyAbi: Abi = policyAccountAbi;
  const topics = encodeEventTopics({ abi: anyAbi, eventName, args }) as Hex[];
  const nonIndexed = ev.inputs.filter((i) => i.indexed !== true);
  return {
    address: acct,
    topics,
    data: encodeAbiParameters(nonIndexed.map((i) => ({ type: i.type })), nonIndexed.map((i) => args[i.name])),
    blockNumber: `0x${block.toString(16)}`,
    blockHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex: '0x0',
  };
}

export interface FakeChainState {
  head?: number;
  timestamp?: bigint;
  code?: Set<string>;
  /** Overrides of `FUNCTION@address` (lowercase address) results. */
  calls?: Record<string, unknown>;
  balances?: Record<string, bigint>;
  logs?: RpcLog[];
}

const ABIS: Abi[] = [ghostPayPolicyRouterAbi, policyAccountFactoryAbi, policyAccountAbi, erc20Abi];

/** Answers eth_call for the policy contracts from a result table. */
export function fakeChain(chainId: number, s: FakeChainState): MockRpc {
  const head = s.head ?? 1000;
  return mockRpc(chainId, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = params[0] === 'latest' ? head : Number(params[0]);
      return { hash: `0x${n.toString(16).padStart(64, '0')}`, parentHash: `0x${(n - 1).toString(16).padStart(64, '0')}`, number: `0x${n.toString(16)}`, timestamp: `0x${(s.timestamp ?? 1_800_000_000n).toString(16)}` };
    }
    if (method === 'eth_getCode') return s.code?.has(String(params[0]).toLowerCase()) === true ? '0x6001' : '0x';
    if (method === 'eth_getBalance') return `0x${(s.balances?.[`native@${String(params[0]).toLowerCase()}`] ?? 0n).toString(16)}`;
    if (method === 'eth_getLogs') {
      const f = params[0] as { address: string; fromBlock: bigint; toBlock: bigint };
      return (s.logs ?? []).filter((l) => l.address.toLowerCase() === f.address.toLowerCase() && BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    if (method === 'eth_call') {
      const c = params[0] as { to: string; data: Hex };
      for (const abi of ABIS) {
        let d: { functionName: string; args?: readonly unknown[] };
        try {
          d = decodeFunctionData({ abi, data: c.data }) as never;
        } catch {
          continue;
        }
        const to = c.to.toLowerCase();
        const argKey = d.args !== undefined && d.args.length > 0 ? `(${String(d.args[0]).toLowerCase()})` : '';
        const key = `${d.functionName}${argKey}@${to}`;
        const fallback = `${d.functionName}@${to}`;
        let result = s.calls?.[key] ?? s.calls?.[fallback];
        if (result === undefined && d.functionName === 'balanceOf') result = s.balances?.[`${to}@${String(d.args?.[0]).toLowerCase()}`] ?? 0n;
        if (result === undefined) throw new Error(`no result for ${key}`);
        return encodeFunctionResult({ abi, functionName: d.functionName, result });
      }
      throw new Error('unknown call');
    }
    throw new Error(`unexpected ${method}`);
  });
}

/** Results that make `verifyPolicyDeployment` succeed for {@link DEPLOYMENT}. */
export function deploymentCalls(over: Record<string, unknown> = {}): { code: Set<string>; calls: Record<string, unknown> } {
  const r = ROUTER.toLowerCase();
  const f = DEPLOYMENT.factory.toLowerCase();
  return {
    code: new Set([r, f, DEPLOYMENT.implementation.toLowerCase(), ANNOUNCER.toLowerCase()]),
    calls: {
      [`FACTORY@${r}`]: DEPLOYMENT.factory,
      [`SCHEME_ID@${r}`]: 0x47500002n,
      [`FEE_BPS@${r}`]: 25n,
      [`FEE_RECIPIENT@${r}`]: FEE_RECIPIENT,
      [`ANNOUNCER@${r}`]: ANNOUNCER,
      [`IMPLEMENTATION@${f}`]: DEPLOYMENT.implementation,
      [`FLAT_FEE@${f}`]: 0n,
      ...over,
    },
  };
}

/** Results for a deployed account matching a vector account. */
export function accountCalls(a: VectorAccount, over: Record<string, unknown> = {}): Record<string, unknown> {
  const x = a.accountAddress.toLowerCase();
  return {
    [`owner@${x}`]: a.ownerAddress,
    [`destination@${x}`]: a.policy.destination,
    [`delay@${x}`]: BigInt(a.policy.delaySeconds),
    [`limitsRoot@${x}`]: a.policy.limitsRoot,
    [`policyHash@${x}`]: a.policyHash,
    [`pendingDestination@${x}`]: '0x0000000000000000000000000000000000000000',
    [`pendingEffectiveAt@${x}`]: 0n,
    [`nonceUsed@${x}`]: false,
    [`windowState@${x}`]: [0n, 0n, 0n, 0n],
    ...over,
  };
}

export { getAddress };
