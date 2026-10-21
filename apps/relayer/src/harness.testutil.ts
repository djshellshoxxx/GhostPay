import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { buildSweepTypedData } from '@ghostpay/chain-adapters';
import type { ChainClient, OrderState, ReceiptSummary, SendOptions, SimulationResult, SweepCall } from './chain.js';
import type { RelayerConfig } from './config.js';
import { SimulationRevert } from './errors.js';
import { createLogger, type Logger } from './log.js';
import type { PolicyGate } from './policy.js';
import { buildRelayer, type Relayer } from './runtime.js';
import type { QuoteResponse } from './service.js';

export const CHAIN_ID = 11155111;
export const SWEEP_CONTRACT: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const FEE_TO: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const HOT_ADDRESS: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
export const USDC: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export const NOPERMIT: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
export const STRANGER: Address = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';
export const DEST: Address = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
export const ORIGIN = 'https://app.example';
export const OWNER_KEY: Hex = `0x${'11'.repeat(32)}`;
export const OTHER_KEY: Hex = `0x${'22'.repeat(32)}`;
export const OWNER: Address = privateKeyToAccount(OWNER_KEY).address;
export const NOW_MS = 1_900_000_000_000;
export const NOW_SEC = NOW_MS / 1000;

/** Fully scriptable chain used instead of an RPC. */
export class FakeChain implements ChainClient {
  public readonly relayerAddress: Address = HOT_ADDRESS;
  public gasPrice = 1_000_000_000n;
  public balance = 10n ** 18n;
  public pendingNonce = 7;
  public gasLimit = 150_000n;
  public receipt: ReceiptSummary = { status: 'success', gasUsed: 100_000n };
  public rpcDown = false;
  public sendFails = false;
  public simulateError: Error | undefined;
  /** When set, simulations from this number on (1-based) throw this error (state change between simulations). */
  public simulateErrorFrom: { n: number; error: Error } | undefined;
  public ownerBalance = 10n ** 12n;
  public allowance = 10n ** 12n;
  public stateError: Error | undefined;
  /** Awaited inside `sendSweep`; lets tests hold a transaction open. */
  public sendGate: Promise<void> | undefined;
  /** Awaited inside `waitForReceipt`. */
  public receiptGate: Promise<void> | undefined;
  public readonly sent: { call: SweepCall; opts: SendOptions }[] = [];
  public readonly used = new Set<string>();
  public inFlight = 0;
  public maxInFlight = 0;
  public simulations = 0;
  private counter = 0;

  public constructor(public readonly chainId: number = CHAIN_ID) {}

  public getGasPrice(): Promise<bigint> {
    return this.rpcDown ? Promise.reject(new Error('down')) : Promise.resolve(this.gasPrice);
  }
  public getBalance(): Promise<bigint> {
    return this.rpcDown ? Promise.reject(new Error('down')) : Promise.resolve(this.balance);
  }
  public getPendingNonce(): Promise<number> {
    return Promise.resolve(this.pendingNonce);
  }
  public readOrderState(call: SweepCall): Promise<OrderState> {
    if (this.rpcDown) return Promise.reject(new Error('down'));
    if (this.stateError !== undefined) return Promise.reject(this.stateError);
    return Promise.resolve({
      ownerBalance: this.ownerBalance,
      allowance: this.allowance,
      nonceUsed: this.used.has(`${call.sweep.owner}:${call.sweep.nonce.toString()}`),
    });
  }
  public simulateSweep(call: SweepCall): Promise<SimulationResult> {
    this.simulations += 1;
    if (this.rpcDown) return Promise.reject(new Error('down'));
    if (this.simulateErrorFrom !== undefined && this.simulations >= this.simulateErrorFrom.n) return Promise.reject(this.simulateErrorFrom.error);
    if (this.simulateError !== undefined) return Promise.reject(this.simulateError);
    if (this.used.has(`${call.sweep.owner}:${call.sweep.nonce.toString()}`)) return Promise.reject(new SimulationRevert('NonceAlreadyUsed'));
    return Promise.resolve({ gasLimit: this.gasLimit });
  }
  public async sendSweep(call: SweepCall, opts: SendOptions): Promise<Hex> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    if (this.sendGate !== undefined) await this.sendGate;
    if (this.sendFails) {
      this.inFlight -= 1;
      throw new Error('send failed');
    }
    this.sent.push({ call, opts });
    this.used.add(`${call.sweep.owner}:${call.sweep.nonce.toString()}`);
    this.counter += 1;
    return `0x${this.counter.toString(16).padStart(64, '0')}`;
  }
  public async waitForReceipt(): Promise<ReceiptSummary> {
    if (this.receiptGate !== undefined) await this.receiptGate;
    this.inFlight -= 1;
    return this.receipt;
  }
}

export function testConfig(over: Partial<RelayerConfig> = {}): RelayerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    allowedOrigins: [ORIGIN],
    allowInsecureLocalhostRpc: false,
    trustProxy: [],
    quoteTtlSeconds: 120,
    minDeadlineSeconds: 30,
    maxDeadlineSeconds: 1800,
    rateLimit: { ipPerMinute: 600, ipBurst: 100, ownerPerMinute: 60, ownerBurst: 20, maxKeys: 100, saltRotationHours: 24, quotePerMinute: 6000, quoteBurst: 1000 },
    breaker: { windowSize: 10, minSamples: 3, failureRatio: 0.5, cooldownSeconds: 60, halfOpenTimeoutSeconds: 30 },
    abuse: { ownerMaxFailures: 3, destinationMaxFailures: 5, windowSeconds: 3600 },
    gas: { coverPercent: 100, maxMovePercent: 25, quoteCacheSeconds: 0 },
    server: {
      headersTimeoutMs: 10_000, requestTimeoutMs: 15_000, keepAliveTimeoutMs: 5000, bodyTimeoutMs: 5000,
      maxConnections: 1024, maxConnectionsPerIp: 64, maxHeadersCount: 50,
    },
    metrics: { enabled: false, bearerToken: undefined },
    alerts: { webhookUrl: undefined, cooldownSeconds: 900 },
    allowFeeToHotKey: false,
    queue: { maxPending: 4, receiptTimeoutSeconds: 30 },
    shutdownGraceSeconds: 2,
    chains: [
      {
        chainId: CHAIN_ID,
        name: 'Ethereum Sepolia',
        rpcUrl: 'https://rpc.example/',
        sweepRelayer: SWEEP_CONTRACT,
        feeTo: FEE_TO,
        tokens: [
          { address: USDC, symbol: 'USDC', decimals: 6, permit: true, usdStable: true },
          { address: NOPERMIT, symbol: 'USDX', decimals: 6, permit: false, usdStable: true },
        ],
        nativeUsdMicro: 3_000_000_000n,
        gasUnits: { sweep: 100_000n, sweepWithPermit: 130_000n },
        maxGasLimit: 400_000n,
        maxGasPriceWei: 50_000_000_000n,
        dailyBudgetWei: 10n ** 17n,
        minBalanceWei: 10n ** 15n,
      },
    ],
    ...over,
  };
}

export interface Harness {
  readonly relayer: Relayer;
  readonly fake: FakeChain;
  readonly url: string;
  readonly logs: string[];
  readonly clock: { ms: number };
  stop(): Promise<void>;
}

export interface HarnessOptions {
  readonly config?: Partial<RelayerConfig>;
  readonly policy?: PolicyGate;
  readonly fake?: FakeChain;
  readonly quoteSecret?: Uint8Array;
  readonly previousQuoteSecret?: Uint8Array;
}

export async function startHarness(o: HarnessOptions = {}): Promise<Harness> {
  const fake = o.fake ?? new FakeChain();
  const clock = { ms: NOW_MS };
  const logs: string[] = [];
  const logger: Logger = createLogger((l) => logs.push(l), () => clock.ms);
  const relayer = await buildRelayer({
    config: testConfig(o.config),
    hotKey: new Uint8Array(32).fill(3),
    quoteSecret: o.quoteSecret ?? new Uint8Array(32).fill(9),
    ...(o.previousQuoteSecret === undefined ? {} : { previousQuoteSecret: o.previousQuoteSecret }),
    logger,
    clients: new Map([[CHAIN_ID, fake]]),
    now: () => clock.ms,
    ...(o.policy === undefined ? {} : { policy: o.policy }),
  });
  const addr = await relayer.server.listen();
  return {
    relayer,
    fake,
    url: `http://127.0.0.1:${String(addr.port)}`,
    logs,
    clock,
    stop: () => relayer.server.close(),
  };
}

export interface Reply {
  readonly status: number;
  readonly json: unknown;
  readonly headers: Headers;
}

export async function call(h: Harness, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const init: RequestInit = {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  };
  const res = await fetch(`${h.url}${path}`, init);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

export function errCode(r: Reply): string {
  return ((r.json as { error: { code: string } }).error).code;
}

export interface PrepareOptions {
  amount?: bigint;
  fee?: bigint;
  feeTo?: Address;
  token?: Address;
  permit?: boolean;
  deadlineOffset?: number;
  nonce?: bigint;
  signerKey?: Hex;
  chainId?: number;
  destination?: Address;
  permitValue?: bigint;
}

export interface Prepared {
  readonly body: Record<string, unknown>;
  readonly quote: QuoteResponse;
}

/** Quotes and signs a sweep; options deliberately allow producing every invalid variant. */
export async function prepare(h: Harness, o: PrepareOptions = {}): Promise<Prepared> {
  const amount = o.amount ?? 100_000_000n;
  const token = o.token ?? USDC;
  const destination = o.destination ?? DEST;
  const quote = await h.relayer.service.quote({ chainId: CHAIN_ID, token, owner: OWNER, destination, amount });
  const fee = o.fee ?? BigInt(quote.fee);
  const feeTo = o.feeTo ?? quote.feeTo;
  const deadline = BigInt(Math.floor(h.clock.ms / 1000) + (o.deadlineOffset ?? 600));
  const order = { token, owner: OWNER, destination, feeTo, amount, fee, deadline, nonce: o.nonce ?? 1n };
  const td = buildSweepTypedData(o.chainId ?? CHAIN_ID, SWEEP_CONTRACT, order);
  const sig = await privateKeyToAccount(o.signerKey ?? OWNER_KEY).signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
  const body: Record<string, unknown> = {
    chainId: CHAIN_ID,
    sweep: {
      token, owner: OWNER, destination, feeTo,
      amount: amount.toString(), fee: fee.toString(), deadline: deadline.toString(), nonce: order.nonce.toString(),
    },
    sweepSig: sig,
    quoteToken: quote.quoteToken,
  };
  if (o.permit === true) {
    body['permit'] = { value: (o.permitValue ?? amount).toString(), deadline: deadline.toString(), v: 27, r: `0x${'aa'.repeat(32)}`, s: `0x${'bb'.repeat(32)}` };
  }
  return { body, quote };
}
