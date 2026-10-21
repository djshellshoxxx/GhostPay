import type { BlockRef, DeploymentManifest, LogFilter, RpcClient, RpcLog } from '@ghostpay/chain-adapters';
import { keccak256 } from 'viem';
import { selector } from './util.js';

export const A = {
  announcer: '0x1111111111111111111111111111111111111111',
  router: '0x2222222222222222222222222222222222222222',
  sweep: '0x3333333333333333333333333333333333333333',
  fee: '0x4444444444444444444444444444444444444444',
  pImpl: '0x5555555555555555555555555555555555555555',
  pFactory: '0x6666666666666666666666666666666666666666',
  pToken: '0x7777777777777777777777777777777777777777',
  evil: '0x9999999999999999999999999999999999999999',
  hot: '0x8888888888888888888888888888888888888888',
} as const;

export const CODE = {
  router: '0x600160005260206000f3',
  sweep: '0x600260005260206000f3',
  pImpl: '0x600360005260206000f3',
  pFactory: '0x600460005260206000f3',
} as const;

const h = (c: string): `0x${string}` => keccak256(c as `0x${string}`);
export const addrWord = (a: string): string => `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
export const numWord = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

export function manifest(opts: { policy?: boolean; chainId?: number } = {}): DeploymentManifest {
  const z = `0x${'ab'.repeat(32)}` as const;
  return {
    chainId: opts.chainId ?? 1,
    announcer: A.announcer,
    router: A.router,
    sweepRelayer: A.sweep,
    feeRecipient: A.fee,
    feeBps: 25,
    deployTx: { router: z, sweepRelayer: z },
    solcVersion: '0.8.28',
    commit: 'a'.repeat(40),
    bytecodeHashes: { router: h(CODE.router), sweepRelayer: h(CODE.sweep) },
    date: '2026-10-21T00:00:00Z',
    ...(opts.policy === true
      ? {
          policy: {
            implementation: A.pImpl,
            factory: A.pFactory,
            feeToken: A.pToken,
            flatFee: 1n,
            feeRecipient: A.fee,
            deployTx: { implementation: z, factory: z },
            bytecodeHashes: { implementation: h(CODE.pImpl), factory: h(CODE.pFactory) },
          },
        }
      : {}),
  };
}

export type Handler = (method: string, params: readonly unknown[]) => unknown;

export interface FakeOpts {
  readonly chainId?: number;
  readonly handler: Handler;
  readonly head?: bigint | undefined;
  readonly blockHash?: ((n: bigint) => string | null) | undefined;
  readonly logs?: (f: LogFilter) => readonly RpcLog[];
}

export class FakeRpc implements RpcClient {
  public readonly chainId: number;
  public constructor(private readonly o: FakeOpts) {
    this.chainId = o.chainId ?? 1;
  }
  public request(method: string, params: readonly unknown[]): Promise<unknown> {
    try {
      return Promise.resolve(this.o.handler(method, params));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('x'));
    }
  }
  public blockNumber(): Promise<bigint> {
    const head = this.o.head;
    if (head === undefined) return Promise.reject(new Error('down'));
    return Promise.resolve(head);
  }
  public getBlock(n: bigint): Promise<BlockRef | null> {
    const f = this.o.blockHash;
    if (f === undefined) return Promise.reject(new Error('down'));
    const hash = f(n);
    return Promise.resolve(hash === null ? null : { number: n, hash: hash as `0x${string}`, parentHash: hash as `0x${string}` });
  }
  public getLogs(f: LogFilter): Promise<readonly RpcLog[]> {
    const l = this.o.logs;
    if (l === undefined) return Promise.reject(new Error('down'));
    return Promise.resolve(l(f));
  }
}

export interface Chain {
  codes?: Record<string, string>;
  calls?: Record<string, string>;
}

/** Healthy chain handler; `over` replaces code or call answers. */
export function healthy(over: Chain = {}, policy = false): Handler {
  const codes: Record<string, string> = {
    [A.router]: CODE.router,
    [A.sweep]: CODE.sweep,
    ...(policy ? { [A.pImpl]: CODE.pImpl, [A.pFactory]: CODE.pFactory } : {}),
    ...over.codes,
  };
  const calls: Record<string, string> = {
    [`${A.router}${selector('FEE_RECIPIENT()')}`]: addrWord(A.fee),
    [`${A.router}${selector('FEE_BPS()')}`]: numWord(25n),
    [`${A.router}${selector('ANNOUNCER()')}`]: addrWord(A.announcer),
    [`${A.pFactory}${selector('FEE_RECIPIENT()')}`]: addrWord(A.fee),
    ...over.calls,
  };
  return (method, params) => {
    if (method === 'eth_getCode') return codes[String((params as string[])[0])] ?? '0x';
    if (method === 'eth_call') {
      const p = (params as { to: string; data?: string }[])[0];
      const key = `${String(p?.to)}${String(p?.data ?? '')}`;
      const v = calls[key];
      if (v === undefined) {
        if (p?.data === undefined) return '0x';
        throw new Error('revert');
      }
      return v;
    }
    throw new Error('unsupported');
  };
}

export const rawLog = {} as RpcLog;
