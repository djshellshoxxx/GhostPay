/* eslint-disable @typescript-eslint/require-await -- fakes implement async ports without awaiting */
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { GuardedBreaker, LossBudget, TokenBucketLimiter } from '@ghostpay/relayer-guard';
import { buildErc20Metadata, routerFee, type RouterTarget } from '../routerTargets.js';
import { createLogger, type SponsorLogEntry } from './log.js';
import { SponsorService, type SponsorServiceOptions } from './service.js';
import type { ChainSponsorConfig, ClientContext, SponsorCall, SponsorChain, SponsorReceipt } from './types.js';

export const CHAIN_ID = 31337;
export const TRANSFER: Hex = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const pad32 = (a: Address): Hex => `0x${'00'.repeat(12)}${a.slice(2).toLowerCase()}`;
export const addr = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}`;
export const ROUTER: RouterTarget = { kind: 'ghostpay', address: addr(0x200) };
export const POLICY_ROUTER: RouterTarget = { kind: 'policy', address: addr(0x201), policy: { owner: addr(0x300), policyHash: `0x${'cd'.repeat(32)}` } };
export const TOKEN = addr(0x400);
export const STEALTH = addr(0x500);
export const SPONSOR = addr(0x600);
export const FEE_TO = addr(0x601);
export const DEPLOY = {
  chainId: CHAIN_ID,
  relay: addr(0x100),
  delegate: addr(0x101),
  accountFactory: addr(0x102),
  paymaster: addr(0x103),
  entryPoint: addr(0x104),
  supports7702: true,
} as const;
export const CTX: ClientContext = { bucket: 'b1' };

/** Controllable fake of the chain port. */
export class FakeChain implements SponsorChain {
  public readonly chainId = CHAIN_ID;
  public readonly sponsorAddress = SPONSOR;
  public gas = 1_000_000_000n; // 1 gwei
  public simOk = true;
  public simThrows = false;
  public sendThrows = false;
  /** Default logs: a huge Transfer of TOKEN to FEE_TO (stands for the sponsor fee payment). */
  public logs: SponsorReceipt['logs'] = [
    { address: TOKEN, topics: [TRANSFER, pad32(addr(0x1234)), pad32(FEE_TO)], data: `0x${'ff'.repeat(32)}` },
  ];
  public receipt: Omit<SponsorReceipt, 'logs'> = { success: true, gasUsed: 200_000n, effectiveGasPrice: 1_000_000_000n };
  public sent: { call: SponsorCall; gasLimit: bigint }[] = [];
  public simulated: SponsorCall[] = [];
  public factoryAnswer: Hex = `0x${'00'.repeat(32)}`;
  public codes = new Map<string, Hex>();
  public gasPrice = async (): Promise<bigint> => this.gas;
  public call = async (): Promise<Hex> => this.factoryAnswer;
  public simulate = async (c: SponsorCall) => {
    this.simulated.push(c);
    if (this.simThrows) throw new Error('rpc down');
    return this.simOk ? ({ ok: true, gas: 250_000n } as const) : ({ ok: false } as const);
  };
  public send = async (c: SponsorCall, gasLimit: bigint): Promise<Hex> => {
    if (this.sendThrows) throw new Error('rpc down');
    this.sent.push({ call: c, gasLimit });
    return `0x${'ab'.repeat(32)}`;
  };
  public waitForReceipt = async (): Promise<SponsorReceipt> => ({ ...this.receipt, logs: this.logs });
  public getCode = async (a: Address): Promise<Hex | undefined> => this.codes.get(a.toLowerCase());
}

export interface Harness {
  readonly svc: SponsorService;
  readonly chain: FakeChain;
  readonly logs: string[];
  readonly entries: SponsorLogEntry[];
  readonly clock: { now: number };
  readonly limiter: TokenBucketLimiter;
  readonly breaker: GuardedBreaker;
  readonly loss: LossBudget;
  readonly paymasterKey: ReturnType<typeof privateKeyToAccount>;
}

export const PM_KEY = privateKeyToAccount(`0x${'42'.repeat(32)}`);

let counter = 0;

type Over<T> = { [K in keyof T]?: T[K] | undefined };

export function harness(over: Over<SponsorServiceOptions> = {}, deploy: Over<ChainSponsorConfig['deployment']> = {}): Harness {
  const chain = new FakeChain();
  const clock = { now: 1_700_000_000_000 };
  const logs: string[] = [];
  const entries: SponsorLogEntry[] = [];
  const limiter = new TokenBucketLimiter({ ratePerSecond: 1000, burst: 1000, maxKeys: 100 }, () => clock.now);
  const breaker = new GuardedBreaker({ windowSize: 4, minSamples: 2, failureRatio: 0.5, cooldownMs: 10_000, probeTimeoutMs: 5_000 }, () => clock.now);
  const loss = new LossBudget({ windowMs: 60_000, perKeyLimit: 10n ** 16n, globalLimit: 10n ** 17n, maxKeys: 100 }, () => clock.now);
  const log = createLogger((l) => logs.push(l));
  const svc = new SponsorService({
    chains: [
      {
        chain,
        deployment: { ...DEPLOY, ...deploy } as ChainSponsorConfig['deployment'],
        routers: [ROUTER, POLICY_ROUTER],
        tokens: [TOKEN],
        sponsorFeeTo: FEE_TO,
      },
    ],
    price: async () => 3_000n * 10n ** 6n, // 3000 USDC (6 decimals) per ETH
    safetyBps: 1000,
    quoteTtlMs: 60_000,
    maxQuotes: 100,
    maxQuotesPerBucket: 100,
    maxDeadlineSeconds: 3600,
    paymasterSigner: (h) => PM_KEY.signMessage({ message: { raw: h } }),
    paymasterSignerAddress: PM_KEY.address,
    limiter,
    breaker,
    loss,
    now: () => clock.now,
    randomBytes: (n) => {
      counter += 1;
      return new Uint8Array(n).map((_, i) => (i === 0 ? counter & 0xff : i === 1 ? (counter >> 8) & 0xff : i));
    },
    log: (e) => {
      entries.push(e);
      log(e);
    },
    ...(over as Partial<SponsorServiceOptions>),
  });
  return { svc, chain, logs, entries, clock, limiter, breaker, loss, paymasterKey: PM_KEY };
}

export const GROSS = 1_000_000_000n;
export const nowSec = (h: Harness): bigint => BigInt(Math.floor(h.clock.now / 1000));

export function payArgs(gross = GROSS) {
  const net = gross - routerFee(gross);
  return {
    token: TOKEN,
    stealth: STEALTH,
    gross,
    minNet: net,
    deadline: 1_700_086_400n,
    ephemeralPubKey: `0x02${'12'.repeat(32)}` as Hex,
    metadata: buildErc20Metadata(1, TOKEN, net),
  };
}
