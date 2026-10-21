import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import {
  ChainAdapterError,
  FEE_SCHEDULE,
  buildSweepTypedData,
  sponsorFee,
  type SweepOrder,
} from '@ghostpay/chain-adapters';
import { GuardedBreaker, LossBudget, classifyRelayOutcome, type BreakerState, type Outcome } from '@ghostpay/relayer-guard';
import { allowAllPolicy, type PolicyGate } from './policy.js';
import { nullAlerts, type AlertSink } from './alerts.js';
import { DailyBudget } from './budget.js';
import type { ChainClient, SweepCall } from './chain.js';
import type { ChainRuntimeConfig, RelayerConfig } from './config.js';
import { RelayerError, SimulationRevert } from './errors.js';
import { ChainLane, NonceManager, type JobOutcome } from './lane.js';
import { KeyHasher, type RateLimiter } from './limiter.js';
import type { Metrics } from './metrics.js';
import { nullLogger, type Logger } from './log.js';
import type { AllowedToken, GasPriceSource, TokenPriceSource } from './pricing.js';
import { signQuote, verifyQuote } from './quoteToken.js';
import type { QuoteRequest, SweepRequest } from './validate.js';

/** Dependencies of {@link RelayerService}. */
export interface ServiceDeps {
  readonly config: RelayerConfig;
  readonly clients: ReadonlyMap<number, ChainClient>;
  readonly quoteSecret: Uint8Array;
  readonly gasPrices: GasPriceSource;
  readonly tokenPrices: TokenPriceSource;
  readonly ownerLimiter: RateLimiter;
  readonly policy?: PolicyGate;
  readonly logger?: Logger;
  /** Clock in ms. */
  readonly now?: () => number;
  /** Version string reported by `/v1/info`. */
  readonly version: string;
  /** Monotonic ms clock for breaker and loss accounting (default: `now`). */
  readonly monotonic?: () => number;
  /** Salted hasher for abuse keys (default: a fresh one). */
  readonly hasher?: KeyHasher;
  readonly lossBudget?: LossBudget;
  readonly alerts?: AlertSink;
  readonly metrics?: Metrics;
  /** How long a validated quote-path gas price is reused, ms (default 3000; 0 disables). */
  readonly gasPriceCacheMs?: number;
}

/** Response of `POST /v1/quote`. */
export interface QuoteResponse {
  readonly fee: string;
  readonly feeTo: Address;
  readonly expiresAt: number;
  readonly quoteToken: string;
}

/** Response of `POST /v1/sweep`. */
export interface SweepResponse {
  readonly txHash: Hex;
}

/** Response of `GET /v1/info`. */
export interface InfoResponse {
  readonly version: string;
  readonly feePolicy: {
    readonly id: 'F-SPONSOR';
    readonly gasMultiplierPercent: number;
    readonly minBps: number;
    readonly capBps: number;
    readonly quoteTtlSeconds: number;
    readonly deadlineWindowSeconds: { readonly min: number; readonly max: number };
  };
  readonly chains: readonly {
    readonly chainId: number;
    readonly name: string;
    readonly sweepRelayer: Address;
    readonly feeTo: Address;
    readonly tokens: readonly { readonly address: Address; readonly symbol: string; readonly decimals: number; readonly permit: boolean }[];
  }[];
}

/** Response of `GET /healthz`. */
export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'shutting_down';
  readonly chains: readonly { readonly chainId: number; readonly breaker: BreakerState }[];
}

/** Per-request context (logging only). */
export interface RequestContext {
  readonly requestId: string;
  /** Canonical client network bucket key (IPv4 /32, IPv6 /64); hashed before use, never logged. */
  readonly clientKey?: string;
}

interface ChainRuntime {
  readonly cfg: ChainRuntimeConfig;
  readonly client: ChainClient;
  readonly lane: ChainLane;
  readonly nonces: NonceManager;
  readonly budget: DailyBudget;
  readonly breaker: GuardedBreaker;
  lastBreakerState: BreakerState;
}

const REVERT_MAP: Readonly<Record<string, readonly [number, string]>> = {
  NonceAlreadyUsed: [409, 'nonce_used'],
  Expired: [422, 'expired'],
  InvalidSignature: [422, 'invalid_signature'],
  ECDSAInvalidSignature: [422, 'invalid_signature'],
  ECDSAInvalidSignatureLength: [422, 'invalid_signature'],
  ECDSAInvalidSignatureS: [422, 'invalid_signature'],
  PermitValueTooLow: [422, 'permit_value_too_low'],
  SafeERC20FailedOperation: [422, 'token_transfer_failed'],
  UnexpectedBalanceDelta: [422, 'token_transfer_failed'],
  InvalidAmount: [422, 'invalid_order'],
  ZeroAddress: [422, 'invalid_order'],
  SelfAddress: [422, 'invalid_order'],
};

/** Maps a simulation revert to its HTTP class; only fixed class names leave this function. */
export function revertToError(r: SimulationRevert): RelayerError {
  const hit = r.errorName === undefined ? undefined : REVERT_MAP[r.errorName];
  return hit === undefined ? new RelayerError(422, 'simulation_reverted') : new RelayerError(hit[0], hit[1]);
}

/**
 * Core relay logic, independent of HTTP: quoting, sweep validation and submission.
 *
 * @remarks Order of checks in {@link RelayerService.sweep}: cheap structural/policy checks first, then
 * signature recovery, then the owner rate limit (keyed only by an authenticated owner so nobody can
 * exhaust another owner's quota), the compliance gate, and finally the per-chain serial lane where
 * the simulation runs immediately before the send.
 */
export class RelayerService {
  private readonly chains = new Map<number, ChainRuntime>();
  private readonly policy: PolicyGate;
  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly hasher: KeyHasher;
  private readonly lossBudget: LossBudget;
  private readonly alerts: AlertSink;
  private readonly gasCache = new Map<number, { price: bigint; at: number }>();
  private closing = false;

  public constructor(private readonly d: ServiceDeps) {
    this.policy = d.policy ?? allowAllPolicy;
    this.logger = d.logger ?? nullLogger;
    this.now = d.now ?? Date.now;
    const mono = d.monotonic ?? this.now;
    this.hasher = d.hasher ?? new KeyHasher(d.config.rateLimit.saltRotationHours * 3_600_000, mono);
    const lb = d.config.lossBudget;
    this.lossBudget =
      d.lossBudget ??
      new LossBudget({ windowMs: lb.windowSeconds * 1000, perKeyLimit: lb.perKeyWei, globalLimit: lb.globalWei, maxKeys: lb.maxKeys }, mono);
    this.alerts = d.alerts ?? nullAlerts;
    const b = d.config.breaker;
    for (const cfg of d.config.chains) {
      const client = d.clients.get(cfg.chainId);
      if (client === undefined) throw new Error('missing chain client');
      this.chains.set(cfg.chainId, {
        cfg,
        client,
        lane: new ChainLane(d.config.queue.maxPending),
        nonces: new NonceManager(() => client.getPendingNonce()),
        budget: new DailyBudget(cfg.dailyBudgetWei, this.now),
        breaker: new GuardedBreaker(
          {
            windowSize: b.windowSize,
            minSamples: b.minSamples,
            failureRatio: b.failureRatio,
            cooldownMs: b.cooldownSeconds * 1000,
            probeTimeoutMs: b.probeTimeoutSeconds * 1000,
          },
          mono,
        ),
        lastBreakerState: 'closed',
      });
    }
    d.metrics?.gauge('relayer_breaker_state', 'Circuit breaker per chain: 0 closed, 1 half_open, 2 open.', () =>
      [...this.chains.values()].map((r) => ({
        labels: { chain_id: String(r.cfg.chainId) },
        value: r.breaker.state === 'closed' ? 0 : r.breaker.state === 'half_open' ? 1 : 2,
      })),
    );
    d.metrics?.gauge('relayer_daily_budget_used_wei', 'Gas budget reserved today per chain, wei (float64).', () =>
      [...this.chains.values()].map((r) => ({ labels: { chain_id: String(r.cfg.chainId) }, value: Number(r.budget.used) })),
    );
    d.metrics?.gauge('relayer_queue_pending', 'Sweeps queued or in flight per chain.', () =>
      [...this.chains.values()].map((r) => ({ labels: { chain_id: String(r.cfg.chainId) }, value: r.lane.pending })),
    );
  }

  /** @returns Public configuration (`GET /v1/info`). */
  public info(): InfoResponse {
    const c = this.d.config;
    return {
      version: this.d.version,
      feePolicy: {
        id: 'F-SPONSOR',
        gasMultiplierPercent: Number(FEE_SCHEDULE.SPONSOR_GAS_NUM),
        minBps: Number(FEE_SCHEDULE.SPONSOR_MIN_BPS),
        capBps: Number(FEE_SCHEDULE.SPONSOR_CAP_BPS),
        quoteTtlSeconds: c.quoteTtlSeconds,
        deadlineWindowSeconds: { min: c.minDeadlineSeconds, max: c.maxDeadlineSeconds },
      },
      chains: c.chains.map((x) => ({
        chainId: x.chainId,
        name: x.name,
        sweepRelayer: x.sweepRelayer,
        feeTo: x.feeTo,
        tokens: x.tokens.map((t) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, permit: t.permit })),
      })),
    };
  }

  /** @returns Liveness/readiness (`GET /healthz`). */
  public health(): HealthResponse {
    const chains = [...this.chains.values()].map((r) => ({ chainId: r.cfg.chainId, breaker: r.breaker.state }));
    let status: HealthResponse['status'] = 'ok';
    if (this.closing) status = 'shutting_down';
    else if ([...this.chains.values()].some((r) => r.breaker.health() !== 'ok')) status = 'degraded';
    return { status, chains };
  }

  /**
   * Prices a sweep.
   *
   * @param req Validated request.
   * @returns Fee, expiry and the HMAC token.
   * @throws {RelayerError} 422 unsupported chain/token/too small; 503 RPC or gas price cap.
   */
  public async quote(req: QuoteRequest): Promise<QuoteResponse> {
    const { rt, token } = this.resolve(req.chainId, req.token);
    if (req.destination === req.owner || rt.cfg.feeTo === req.owner || rt.cfg.feeTo === req.destination) {
      throw new RelayerError(422, 'invalid_order');
    }
    const gasPrice = await this.quoteGasPrice(rt);
    const units = token.permit ? rt.cfg.gasUnits.sweepWithPermit : rt.cfg.gasUnits.sweep;
    const gasCost = await this.d.tokenPrices.nativeToTokenUnits(req.chainId, token, units * gasPrice);
    const { fee } = sponsorFee(req.amount, gasCost);
    // If even the 300 bps cap cannot reimburse the gas, the sweep is uneconomical: refuse to quote.
    if (fee < gasCost) throw new RelayerError(422, 'amount_too_small');
    const expiresAt = Math.floor(this.now() / 1000) + this.d.config.quoteTtlSeconds;
    const quoteToken = signQuote(this.d.quoteSecret, {
      chainId: req.chainId,
      token: req.token,
      owner: req.owner,
      destination: req.destination,
      amount: req.amount,
      fee,
      feeTo: rt.cfg.feeTo,
      expiresAt,
    });
    return { fee: fee.toString(), feeTo: rt.cfg.feeTo, expiresAt, quoteToken };
  }

  /**
   * Validates and submits a sweep.
   *
   * @param req Validated request.
   * @param ctx Logging context.
   * @returns Transaction hash once broadcast.
   * @throws {RelayerError} with a fixed class; see README for the table.
   */
  public async sweep(req: SweepRequest, ctx: RequestContext): Promise<SweepResponse> {
    if (this.closing) throw new RelayerError(503, 'shutting_down');
    const s = req.sweep;
    const { rt, token } = this.resolve(req.chainId, s.token);
    if (req.permit !== undefined) {
      if (!token.permit) throw new RelayerError(422, 'permit_not_supported');
      if (req.permit.value < s.amount) throw new RelayerError(422, 'permit_value_too_low');
    }
    if (s.feeTo !== rt.cfg.feeTo) throw new RelayerError(422, 'fee_to_mismatch');

    const quote = verifyQuote(this.d.quoteSecret, req.quoteToken, {
      chainId: req.chainId,
      token: s.token,
      owner: s.owner,
      destination: s.destination,
      amount: s.amount,
      feeTo: s.feeTo,
    });
    const nowSec = Math.floor(this.now() / 1000);
    if (quote === null) throw new RelayerError(400, 'invalid_quote');
    if (quote.expiresAt <= nowSec) throw new RelayerError(410, 'quote_expired');
    if (s.fee < quote.fee) throw new RelayerError(422, 'fee_below_quote');
    if (s.fee > (s.amount * FEE_SCHEDULE.SPONSOR_CAP_BPS) / FEE_SCHEDULE.BPS) throw new RelayerError(422, 'fee_above_cap');

    const cfg = this.d.config;
    if (s.deadline <= BigInt(nowSec + cfg.minDeadlineSeconds)) throw new RelayerError(422, 'deadline_too_soon');
    if (s.deadline > BigInt(nowSec + cfg.maxDeadlineSeconds)) throw new RelayerError(422, 'deadline_too_far');

    const order: SweepOrder = { ...s };
    let typed;
    try {
      typed = buildSweepTypedData(req.chainId, rt.cfg.sweepRelayer, order);
    } catch (e) {
      if (e instanceof ChainAdapterError) throw new RelayerError(422, 'invalid_order');
      throw e;
    }
    let recovered: Address;
    try {
      recovered = await recoverTypedDataAddress({
        domain: typed.domain,
        types: typed.types,
        primaryType: typed.primaryType,
        message: typed.message,
        signature: req.sweepSig,
      });
    } catch {
      throw new RelayerError(422, 'invalid_signature');
    }
    if (recovered !== s.owner) throw new RelayerError(422, 'invalid_signature');

    const limit = this.d.ownerLimiter.take(s.owner.toLowerCase());
    if (!limit.ok) throw new RelayerError(429, 'rate_limited_owner', limit.retryAfterSeconds);

    let decision;
    try {
      decision = await this.policy.check({ chainId: req.chainId, token: s.token, owner: s.owner, destination: s.destination, amount: s.amount });
    } catch {
      throw new RelayerError(503, 'policy_unavailable');
    }
    if (!decision.allow) throw new RelayerError(403, 'policy_denied');

    if (rt.breaker.retryAfterMs() > 0) throw new RelayerError(503, 'breaker_open', cfg.breaker.cooldownSeconds);

    const keys = this.abuseKeys(s.destination, ctx);
    this.requireLossBudget(rt, keys);
    const call: SweepCall = { sweepRelayer: rt.cfg.sweepRelayer, sweep: s, sweepSig: req.sweepSig, permit: req.permit };
    return rt.lane.submit(() => this.runJob(rt, call, ctx, keys));
  }

  /** Stops admitting work and waits for every queued/in-flight transaction to settle. */
  public async shutdown(): Promise<void> {
    this.closing = true;
    const lanes = [...this.chains.values()].map((r) => r.lane);
    for (const l of lanes) l.close();
    await Promise.all(lanes.map((l) => l.drain()));
  }

  private resolve(chainId: number, tokenAddr: Address): { rt: ChainRuntime; token: AllowedToken } {
    const rt = this.chains.get(chainId);
    if (rt === undefined) throw new RelayerError(422, 'chain_not_supported');
    const token = rt.cfg.tokens.find((t) => t.address === tokenAddr);
    if (token === undefined) throw new RelayerError(422, 'token_not_supported');
    return { rt, token };
  }

  /** Hashed per-source and per-destination loss-budget keys (the destination is free to mint, the network is not). */
  private abuseKeys(destination: Address, ctx: RequestContext): readonly string[] {
    const keys = [`dst:${this.hasher.hash(destination.toLowerCase())}`];
    if (ctx.clientKey !== undefined) keys.push(`net:${this.hasher.hash(ctx.clientKey)}`);
    return keys;
  }

  private requireLossBudget(rt: ChainRuntime, keys: readonly string[]): void {
    if (keys.every((k) => this.lossBudget.allows(k))) return;
    this.d.metrics?.inc('relayer_loss_budget_denied_total', { chain_id: rt.cfg.chainId });
    this.alerts.send({ kind: 'loss_budget_exhausted', chainId: rt.cfg.chainId });
    throw new RelayerError(429, 'loss_budget_exhausted', this.d.config.lossBudget.windowSeconds);
  }

  /** Reports a breaker transition to metrics and the alert sink (once per transition). */
  private noteBreaker(rt: ChainRuntime): void {
    const s = rt.breaker.state;
    if (s === rt.lastBreakerState) return;
    rt.lastBreakerState = s;
    this.d.metrics?.inc('relayer_breaker_transitions_total', { chain_id: rt.cfg.chainId, to: s });
    if (s === 'open') this.alerts.send({ kind: 'breaker_open', chainId: rt.cfg.chainId });
  }

  /** Quote path only: briefly reuses a validated price so anonymous quotes cannot force one RPC call each (S3-07). */
  private async quoteGasPrice(rt: ChainRuntime): Promise<bigint> {
    const ttl = this.d.gasPriceCacheMs ?? 3000;
    const t = this.now();
    const hit = this.gasCache.get(rt.cfg.chainId);
    if (ttl > 0 && hit !== undefined && t >= hit.at && t - hit.at < ttl) return hit.price;
    const price = await this.gasPrice(rt);
    this.gasCache.set(rt.cfg.chainId, { price, at: t });
    return price;
  }

  private async gasPrice(rt: ChainRuntime): Promise<bigint> {
    let price: bigint;
    try {
      price = await this.d.gasPrices.getGasPrice(rt.cfg.chainId);
    } catch (e) {
      if (e instanceof RelayerError) throw e;
      throw new RelayerError(503, 'rpc_unavailable');
    }
    if (price > rt.cfg.maxGasPriceWei) throw new RelayerError(503, 'gas_price_too_high', 30);
    return price;
  }

  /** Runs inside the chain lane: exactly one of these is active per chain at any time. */
  private async runJob(rt: ChainRuntime, call: SweepCall, ctx: RequestContext, keys: readonly string[]): Promise<JobOutcome<SweepResponse>> {
    const { cfg, breaker } = rt;
    const permit = breaker.tryAcquire();
    if (permit === null) throw new RelayerError(503, 'breaker_open', this.d.config.breaker.cooldownSeconds);
    // Every exit settles the permit; anything not named below is neutral (user-attributable), so a
    // half-open probe can never wedge (S3-05) and attacker-caused failures cannot open it (S3-06).
    let outcome = classifyRelayOutcome('invalid_request');
    try {
      const out = await this.runSettled(rt, call, ctx, keys, (o) => {
        outcome = o;
      });
      return out;
    } finally {
      permit.settle(outcome);
      this.noteBreaker(rt);
      this.d.metrics?.inc('relayer_sweeps_total', { chain_id: cfg.chainId, outcome });
    }
  }

  private async runSettled(
    rt: ChainRuntime,
    call: SweepCall,
    ctx: RequestContext,
    keys: readonly string[],
    setOutcome: (o: Outcome) => void,
  ): Promise<JobOutcome<SweepResponse>> {
    const { cfg, client, breaker, budget, nonces } = rt;

    // Operational (non-user) failures feed the breaker; user-caused reverts do not.
    const op = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof SimulationRevert || e instanceof RelayerError) throw e;
        setOutcome(classifyRelayOutcome('rpc_error'));
        throw new RelayerError(503, 'rpc_unavailable');
      }
    };

    const gasPrice = await this.gasPrice(rt);
    const balance = await op(() => client.getBalance());
    if (balance < cfg.minBalanceWei) {
      breaker.trip();
      this.alerts.send({ kind: 'low_balance', chainId: cfg.chainId });
      this.logger.log('error', 'breaker_tripped_low_balance', { requestId: ctx.requestId, chainId: cfg.chainId, errorClass: 'low_balance' });
      throw new RelayerError(503, 'breaker_open', this.d.config.breaker.cooldownSeconds);
    }

    this.requireLossBudget(rt, keys);
    let gasLimit: bigint;
    try {
      gasLimit = (await op(() => client.simulateSweep(call))).gasLimit;
    } catch (e) {
      if (e instanceof SimulationRevert) throw revertToError(e);
      throw e;
    }
    if (gasLimit > cfg.maxGasLimit) throw new RelayerError(422, 'gas_limit_too_high');

    const reserved = gasLimit * gasPrice;
    if (!budget.reserve(reserved)) {
      this.alerts.send({ kind: 'daily_budget_exhausted', chainId: cfg.chainId });
      throw new RelayerError(503, 'budget_exhausted', budget.secondsToReset());
    }

    let txHash: Hex;
    try {
      const nonce = await nonces.acquire();
      txHash = await client.sendSweep(call, { nonce, gas: gasLimit, gasPrice });
    } catch {
      nonces.invalidate();
      budget.release(reserved);
      setOutcome(classifyRelayOutcome('send_failed'));
      throw new RelayerError(503, 'send_failed');
    }
    setOutcome(classifyRelayOutcome('confirmed'));
    this.logger.log('info', 'sweep_sent', { requestId: ctx.requestId, chainId: cfg.chainId, txHash });

    const settled = (async (): Promise<void> => {
      const r = await client.waitForReceipt(txHash, this.d.config.queue.receiptTimeoutSeconds * 1000);
      if (r.status === 'timeout') {
        nonces.invalidate();
        this.logger.log('warn', 'receipt_timeout', { chainId: cfg.chainId, txHash, errorClass: 'receipt_timeout' });
        return;
      }
      const spent = r.gasUsed * gasPrice;
      budget.release(reserved > spent ? reserved - spent : 0n);
      if (r.status === 'reverted') {
        // The simulation passed moments earlier, so a mined revert means state changed in between
        // (front-run, S3-06): the relayer paid gas and earned no fee. Charge the sources, do not
        // count it against the breaker.
        for (const k of keys) this.lossBudget.charge(k, spent);
        this.d.metrics?.inc('relayer_mined_reverts_total', { chain_id: cfg.chainId });
        this.alerts.send({ kind: 'mined_revert', chainId: cfg.chainId });
        this.logger.log('error', 'sweep_reverted', { chainId: cfg.chainId, txHash, errorClass: 'mined_revert' });
      }
    })();
    return { value: { txHash }, settled };
  }
}
