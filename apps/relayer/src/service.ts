import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import {
  ChainAdapterError,
  FEE_SCHEDULE,
  buildSweepTypedData,
  sponsorFee,
  type SweepOrder,
} from '@ghostpay/chain-adapters';
import { nullAlertSink, type AlertKind, type AlertSink } from './alerts.js';
import { FailureBudgets } from './abuse.js';
import { Metrics } from './metrics.js';
import { allowAllPolicy, type PolicyGate } from './policy.js';
import { CircuitBreaker, type BreakerState } from './breaker.js';
import { DailyBudget } from './budget.js';
import type { ChainClient, SweepCall } from './chain.js';
import type { ChainRuntimeConfig, RelayerConfig } from './config.js';
import { RelayerError, SimulationRevert } from './errors.js';
import { ChainLane, NonceManager, type JobOutcome } from './lane.js';
import type { RateLimiter } from './limiter.js';
import { nullLogger, type Logger } from './log.js';
import type { AllowedToken, GasPriceSource, TokenPriceSource } from './pricing.js';
import { signQuote, verifyQuote, type QuoteKeyring } from './quoteToken.js';
import type { QuoteRequest, SweepRequest } from './validate.js';

/** Dependencies of {@link RelayerService}. */
export interface ServiceDeps {
  readonly config: RelayerConfig;
  readonly clients: ReadonlyMap<number, ChainClient>;
  readonly quoteKeys: QuoteKeyring;
  readonly gasPrices: GasPriceSource;
  readonly tokenPrices: TokenPriceSource;
  readonly ownerLimiter: RateLimiter;
  /** Per-owner / per-destination budgets of costly failures. */
  readonly abuse: FailureBudgets;
  readonly alerts?: AlertSink;
  readonly metrics?: Metrics;
  readonly policy?: PolicyGate;
  readonly logger?: Logger;
  /** Clock in ms. */
  readonly now?: () => number;
  /** Version string reported by `/v1/info`. */
  readonly version: string;
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
  /**
   * `ok`: every breaker closed. `degraded`: some chain is open or half-open. `unhealthy`: no chain can serve
   * (all open or half-open). `shutting_down`: draining.
   */
  readonly status: 'ok' | 'degraded' | 'unhealthy' | 'shutting_down';
  readonly chains: readonly { readonly chainId: number; readonly breaker: BreakerState }[];
}

/** Per-request context (logging only). */
export interface RequestContext {
  readonly requestId: string;
}

interface ChainRuntime {
  readonly cfg: ChainRuntimeConfig;
  readonly client: ChainClient;
  readonly lane: ChainLane;
  readonly nonces: NonceManager;
  readonly budget: DailyBudget;
  readonly breaker: CircuitBreaker;
  gasQuote: { readonly price: bigint; readonly at: number } | undefined;
  lastBalance: bigint | undefined;
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
  private closing = false;
  private monitorTimer: NodeJS.Timeout | undefined;
  private readonly alerts: AlertSink;
  /** Operational counters/gauges (`/metrics`). */
  public readonly metrics: Metrics;

  public constructor(private readonly d: ServiceDeps) {
    this.alerts = d.alerts ?? nullAlertSink;
    this.metrics = d.metrics ?? new Metrics();
    this.policy = d.policy ?? allowAllPolicy;
    this.logger = d.logger ?? nullLogger;
    this.now = d.now ?? Date.now;
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
        breaker: new CircuitBreaker(
          { windowSize: b.windowSize, minSamples: b.minSamples, failureRatio: b.failureRatio, cooldownMs: b.cooldownSeconds * 1000, halfOpenTimeoutMs: b.halfOpenTimeoutSeconds * 1000 },
          this.now,
        ),
        gasQuote: undefined,
        lastBalance: undefined,
      });
    }
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
    else if (chains.every((c) => c.breaker !== 'closed')) status = 'unhealthy';
    else if (chains.some((c) => c.breaker !== 'closed')) status = 'degraded';
    return { status, chains };
  }

  /**
   * Starts the background monitor: it polls the hot-key balance even when no traffic arrives, so the
   * low-balance alert does not depend on a user request. The timer never keeps the process alive.
   *
   * @param intervalMs Polling interval.
   */
  public startMonitor(intervalMs: number): void {
    this.stopMonitor();
    this.monitorTimer = setInterval(() => {
      void this.monitorOnce();
    }, intervalMs);
    this.monitorTimer.unref();
  }

  /** Stops the background monitor. */
  public stopMonitor(): void {
    if (this.monitorTimer !== undefined) clearInterval(this.monitorTimer);
    this.monitorTimer = undefined;
  }

  /** One monitor pass: refreshes the balance gauge and raises low-balance alerts. Never throws. */
  public async monitorOnce(): Promise<void> {
    for (const rt of this.chains.values()) {
      try {
        this.observeBalance(rt, await rt.client.getBalance());
      } catch {
        this.metrics.inc('ghostpay_relayer_errors_total', { class: 'monitor_rpc' });
      }
    }
  }

  /** @returns Prometheus text with current gauges (no RPC calls). */
  public renderMetrics(): string {
    for (const rt of this.chains.values()) {
      const chain = rt.cfg.chainId;
      const st = rt.breaker.state;
      this.metrics.set('ghostpay_relayer_breaker_state', { chain }, st === 'closed' ? 0 : st === 'half_open' ? 1 : 2);
      this.metrics.set('ghostpay_relayer_daily_budget_used_wei', { chain }, Number(rt.budget.used));
      this.metrics.set('ghostpay_relayer_daily_budget_limit_wei', { chain }, Number(rt.cfg.dailyBudgetWei));
      this.metrics.set('ghostpay_relayer_queue_pending', { chain }, rt.lane.pending);
    }
    return this.metrics.render();
  }

  private alert(kind: AlertKind, severity: 'warning' | 'critical', chainId: number): void {
    this.metrics.inc('ghostpay_relayer_alerts_total', { kind });
    this.alerts.notify({ kind, severity, chainId });
  }

  private observeBalance(rt: ChainRuntime, balance: bigint): void {
    rt.lastBalance = balance;
    this.metrics.set('ghostpay_relayer_hot_balance_wei', { chain: rt.cfg.chainId }, Number(balance));
    if (balance < rt.cfg.minBalanceWei) this.alert('low_balance', 'critical', rt.cfg.chainId);
    else if (balance < rt.cfg.minBalanceWei * 2n) this.alert('balance_warning', 'warning', rt.cfg.chainId);
  }

  /** Records an operational failure; a resulting trip on error rate raises an alert. */
  private fail(rt: ChainRuntime): void {
    const before = rt.breaker.state;
    rt.breaker.recordFailure();
    if (before === 'closed' && rt.breaker.state === 'open') this.alert('error_rate', 'critical', rt.cfg.chainId);
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
    // If even the 300 bps cap cannot reimburse the gas (times the configured cover), the sweep is uneconomical.
    if (fee * 100n < gasCost * BigInt(this.d.config.gas.coverPercent)) throw new RelayerError(422, 'amount_too_small');
    const expiresAt = Math.floor(this.now() / 1000) + this.d.config.quoteTtlSeconds;
    const quoteToken = signQuote(this.d.quoteKeys.primary, {
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

    const quote = verifyQuote(this.d.quoteKeys, req.quoteToken, {
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

    const budget = this.d.abuse.check(s.owner.toLowerCase(), s.destination.toLowerCase());
    if (!budget.ok) throw new RelayerError(429, 'failure_budget_exceeded', budget.retryAfterSeconds);

    let decision;
    try {
      decision = await this.policy.check({ chainId: req.chainId, token: s.token, owner: s.owner, destination: s.destination, amount: s.amount });
    } catch {
      throw new RelayerError(503, 'policy_unavailable');
    }
    if (!decision.allow) throw new RelayerError(403, 'policy_denied');

    if (rt.breaker.isBlocking()) throw new RelayerError(503, 'breaker_open', cfg.breaker.cooldownSeconds);

    const call: SweepCall = { sweepRelayer: rt.cfg.sweepRelayer, sweep: s, sweepSig: req.sweepSig, permit: req.permit };
    return rt.lane.submit(() => this.runJob(rt, call, ctx));
  }

  /** Stops admitting work and waits for every queued/in-flight transaction to settle. */
  public async shutdown(): Promise<void> {
    this.closing = true;
    this.stopMonitor();
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

  /** Gas price for quotes: cached for a few seconds so unauthenticated quote spam costs one RPC call per window. */
  private async quoteGasPrice(rt: ChainRuntime): Promise<bigint> {
    const ttl = this.d.config.gas.quoteCacheSeconds * 1000;
    const hit = rt.gasQuote;
    if (hit !== undefined && ttl > 0 && this.now() - hit.at < ttl && this.now() >= hit.at) return hit.price;
    const price = await this.gasPrice(rt);
    rt.gasQuote = { price, at: this.now() };
    return price;
  }

  /** Runs inside the chain lane: exactly one of these is active per chain at any time. */
  private async runJob(rt: ChainRuntime, call: SweepCall, ctx: RequestContext): Promise<JobOutcome<SweepResponse>> {
    if (!rt.breaker.allow()) throw new RelayerError(503, 'breaker_open', this.d.config.breaker.cooldownSeconds);
    try {
      return await this.runAdmitted(rt, call, ctx);
    } finally {
      // Every exit path settles a half-open probe: success/failure/trip already resolved it, anything else
      // (user error, cap, budget) frees the probe slot so the next request is admitted as the probe.
      rt.breaker.releaseProbe();
    }
  }

  private async runAdmitted(rt: ChainRuntime, call: SweepCall, ctx: RequestContext): Promise<JobOutcome<SweepResponse>> {
    const { cfg, client, breaker, budget, nonces } = rt;
    const gas = this.d.config.gas;
    const s = call.sweep;
    const owner = s.owner.toLowerCase();
    const destination = s.destination.toLowerCase();

    // Operational (non-user) failures feed the breaker; user-caused outcomes never do.
    const op = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof SimulationRevert || e instanceof RelayerError) throw e;
        this.fail(rt);
        throw new RelayerError(503, 'rpc_unavailable');
      }
    };
    const strike = (): void => {
      this.d.abuse.record(owner, destination);
    };
    const simulate = async (): Promise<{ gasLimit: bigint; gasEstimate: bigint }> => {
      try {
        const r = await op(() => client.simulateSweep(call));
        return { gasLimit: r.gasLimit, gasEstimate: r.gasEstimate ?? r.gasLimit };
      } catch (e) {
        if (e instanceof SimulationRevert) throw revertToError(e);
        throw e;
      }
    };
    const coversGas = async (gasUnits: bigint, price: bigint): Promise<boolean> => {
      const token = cfg.tokens.find((t) => t.address === s.token);
      if (token === undefined) return false;
      const cost = await this.d.tokenPrices.nativeToTokenUnits(cfg.chainId, token, gasUnits * price);
      return s.fee * 100n >= cost * BigInt(gas.coverPercent);
    };

    // A queued job may have waited: re-check the failure budget before spending anything.
    const earlyBudget = this.d.abuse.check(owner, destination);
    if (!earlyBudget.ok) throw new RelayerError(429, 'failure_budget_exceeded', earlyBudget.retryAfterSeconds);

    const gasPrice = await this.gasPrice(rt);
    const balance = await op(() => client.getBalance());
    this.observeBalance(rt, balance);
    if (balance < cfg.minBalanceWei) {
      breaker.trip();
      this.logger.log('error', 'breaker_tripped_low_balance', { requestId: ctx.requestId, chainId: cfg.chainId, errorClass: 'low_balance' });
      throw new RelayerError(503, 'breaker_open', this.d.config.breaker.cooldownSeconds);
    }

    // Cheap reads first: an order that cannot succeed on chain never reaches the gas-spending path.
    const state = await op(() => client.readOrderState(call));
    if (state.nonceUsed) throw new RelayerError(409, 'nonce_used');
    if (state.ownerBalance < s.amount) {
      strike();
      throw new RelayerError(422, 'insufficient_token_balance');
    }
    if (call.permit === undefined && state.allowance < s.amount) {
      strike();
      throw new RelayerError(422, 'insufficient_allowance');
    }

    const first = await simulate();
    if (first.gasLimit > cfg.maxGasLimit) throw new RelayerError(422, 'gas_limit_too_high');
    if (!(await coversGas(first.gasEstimate, gasPrice))) throw new RelayerError(422, 'fee_below_gas_cost');
    if (first.gasLimit * gasPrice > budget.remaining) throw new RelayerError(503, 'budget_exhausted', budget.secondsToReset());

    // Immediately before sending: fresh price, fresh simulation. A change between the two simulations is the
    // signature of the front-run-then-revert griefing pattern, so it costs the source a strike.
    const sendPrice = await this.gasPrice(rt);
    if (sendPrice * 100n > gasPrice * BigInt(100 + gas.maxMovePercent)) throw new RelayerError(503, 'gas_price_moved', 5);
    let second: { gasLimit: bigint; gasEstimate: bigint };
    try {
      second = await simulate();
    } catch (e) {
      if (e instanceof RelayerError && e.status < 500) strike();
      throw e;
    }
    if (second.gasLimit > cfg.maxGasLimit) throw new RelayerError(422, 'gas_limit_too_high');
    if (!(await coversGas(second.gasEstimate, sendPrice))) throw new RelayerError(422, 'fee_below_gas_cost');

    const gasLimit = second.gasLimit;
    const reserved = gasLimit * sendPrice;
    if (!budget.reserve(reserved)) {
      throw new RelayerError(503, 'budget_exhausted', budget.secondsToReset());
    }
    const reservedDay = budget.currentDay;

    let txHash: Hex;
    try {
      const nonce = await nonces.acquire();
      txHash = await client.sendSweep(call, { nonce, gas: gasLimit, gasPrice: sendPrice });
    } catch {
      nonces.invalidate();
      budget.release(reserved, reservedDay);
      this.fail(rt);
      this.metrics.inc('ghostpay_relayer_sweeps_total', { chain: cfg.chainId, result: 'send_failed' });
      throw new RelayerError(503, 'send_failed');
    }
    breaker.recordSuccess();
    this.metrics.inc('ghostpay_relayer_sweeps_total', { chain: cfg.chainId, result: 'sent' });
    this.logger.log('info', 'sweep_sent', { requestId: ctx.requestId, chainId: cfg.chainId, txHash });

    const settled = (async (): Promise<void> => {
      const r = await client.waitForReceipt(txHash, this.d.config.queue.receiptTimeoutSeconds * 1000);
      if (r.status === 'timeout') {
        nonces.invalidate();
        this.metrics.inc('ghostpay_relayer_sweeps_total', { chain: cfg.chainId, result: 'receipt_timeout' });
        this.logger.log('warn', 'receipt_timeout', { chainId: cfg.chainId, txHash, errorClass: 'receipt_timeout' });
        return;
      }
      const used = r.gasUsed * sendPrice;
      // Gas of reverted transactions stays counted against the daily budget.
      budget.release(reserved > used ? reserved - used : 0n, reservedDay);
      if (r.status === 'reverted') {
        // A mined revert after two clean simulations is attributed to the sweep's source (the owner moved the
        // funds or similar), not to chain health: it spends the source's failure budget, not the breaker.
        strike();
        this.metrics.inc('ghostpay_relayer_sweeps_total', { chain: cfg.chainId, result: 'reverted' });
        this.metrics.inc('ghostpay_relayer_failed_gas_wei_total', { chain: cfg.chainId }, Number(used));
        this.logger.log('error', 'sweep_reverted', { chainId: cfg.chainId, txHash, errorClass: 'mined_revert' });
      }
    })();
    return { value: { txHash }, settled };
  }
}
