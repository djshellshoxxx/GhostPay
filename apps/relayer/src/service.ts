import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import {
  ChainAdapterError,
  FEE_SCHEDULE,
  buildSweepTypedData,
  sponsorFee,
  type SweepOrder,
} from '@ghostpay/chain-adapters';
import {
  GuardedBreaker,
  LossBudget,
  classifyRelayOutcome,
  type BreakerState,
  type LossReservation,
  type LossSource,
  type Outcome,
} from '@ghostpay/relayer-guard';
import { FailureBudgets } from './abuse.js';
import { allowAllPolicy, type PolicyGate } from './policy.js';
import { nullAlerts, type AlertSink } from './alerts.js';
import { DailyBudget } from './budget.js';
import type { ChainClient, MinedReceipt, ReceiptSummary, SweepCall } from './chain.js';
import type { ChainRuntimeConfig, RelayerConfig } from './config.js';
import { RelayerError, SimulationRevert } from './errors.js';
import { ChainLane, NonceManager, type JobOutcome } from './lane.js';
import { KeyHasher, type RateLimiter } from './limiter.js';
import type { Metrics } from './metrics.js';
import { nullLogger, type Logger } from './log.js';
import type { AllowedToken, GasPriceSource, TokenPriceSource } from './pricing.js';
import { makeKeyring, signQuote, verifyQuote, type QuoteKeyring } from './quoteToken.js';
import type { QuoteRequest, SweepRequest } from './validate.js';
import { RevertRate } from './revertRate.js';

/** Dependencies of {@link RelayerService}. */
export interface ServiceDeps {
  readonly config: RelayerConfig;
  readonly clients: ReadonlyMap<number, ChainClient>;
  readonly quoteSecret: Uint8Array;
  readonly previousQuoteSecret?: Uint8Array;
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
  /** Spec 04 per-owner costly-failure counter (default: 3 per hour, owner key only). */
  readonly failureBudgets?: FailureBudgets;
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
    readonly tokens: readonly {
      readonly address: Address;
      readonly symbol: string;
      readonly decimals: number;
      readonly permit: boolean;
    }[];
  }[];
}

/** Response of `GET /healthz`. */
export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'shutting_down';
  readonly chains: readonly {
    readonly chainId: number;
    readonly breaker: BreakerState;
    /** `sustained` while mined reverts (breaker-neutral, S3-06) are frequent; see {@link RevertRate}. */
    readonly minedReverts: 'normal' | 'sustained';
  }[];
}

/** Per-request context (logging only). */
export interface RequestContext {
  readonly requestId: string;
  /** Canonical client network bucket key (IPv4 /32, IPv6 /64); hashed before use, never logged. */
  readonly clientKey?: string;
  /** Canonical IPv4 /24 or IPv6 /48 abuse group; hashed before storage. */
  readonly clientGroupKey?: string;
}

/** A broadcast sweep and what was reserved for it, until its receipt settles the reservations. */
interface SentSweep {
  readonly txHash: Hex;
  readonly call: SweepCall;
  readonly gasPrice: bigint;
  readonly reserved: bigint;
  readonly reservedDay: number;
  readonly loss: LossReservation;
  /** Monotonic ms when the receipt wait timed out. */
  at: number;
}

interface ChainRuntime {
  readonly cfg: ChainRuntimeConfig;
  readonly client: ChainClient;
  readonly lane: ChainLane;
  readonly nonces: NonceManager;
  readonly budget: DailyBudget;
  readonly breaker: GuardedBreaker;
  lastBreakerState: BreakerState;
  /** Sweeps whose receipt wait timed out, looked up again at the start of later jobs (L5-06), oldest first. */
  readonly pending: SentSweep[];
  readonly reverts: RevertRate;
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

/**
 * Part of `lossBudget.globalWei` kept for sweeps whose sources lost nothing in the current window, so sources that
 * keep losing cannot spend it (L5-02). A network group new to the window is clean until its first loss, so enough
 * distinct groups, one loss each, can still use it up (README).
 */
export function lossCleanReserve(globalWei: bigint): bigint {
  return globalWei / 4n;
}

/** Timed-out sweeps looked up again per chain; beyond this the oldest is dropped and keeps its reservations. */
const MAX_PENDING_RECEIPTS = 8;
/** A timed-out sweep never found for this long is dropped: its budget day and loss window are over by then. */
const PENDING_RECEIPT_MAX_AGE_MS = 86_400_000;

/** Spec 04: costly failures tolerated per proven owner per window before sweeps are refused up front. */
const OWNER_FAILURES_PER_WINDOW = 3;
const OWNER_FAILURE_WINDOW_MS = 3_600_000;
/**
 * User-attributable classes that cost the relayer an RPC simulation (or more) and count against the owner. Excluded:
 * `nonce_used` (honest client retries after success) and every operational class.
 */
const OWNER_STRIKE_CODES: ReadonlySet<string> = new Set([
  'insufficient_token_balance', 'insufficient_allowance', 'permit_expired', 'permit_failed', 'simulation_reverted',
  'token_transfer_failed', 'fee_below_gas_cost', 'gas_limit_too_high', 'invalid_signature', 'expired',
  'permit_value_too_low', 'invalid_order',
]);

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
  private readonly mono: () => number;
  private readonly hasher: KeyHasher;
  private readonly lossBudget: LossBudget;
  private readonly alerts: AlertSink;
  private readonly gasCache = new Map<number, { price: bigint; at: number }>();
  private readonly gasLookups = new Map<number, Promise<bigint>>();
  private readonly quoteKeys: QuoteKeyring;
  private readonly failures: FailureBudgets;
  private closing = false;

  public constructor(private readonly d: ServiceDeps) {
    this.quoteKeys = makeKeyring(d.quoteSecret, d.previousQuoteSecret);
    this.policy = d.policy ?? allowAllPolicy;
    this.logger = d.logger ?? nullLogger;
    this.now = d.now ?? Date.now;
    const mono = d.monotonic ?? this.now;
    this.mono = mono;
    this.hasher = d.hasher ?? new KeyHasher(d.config.rateLimit.saltRotationHours * 3_600_000, mono);
    const lb = d.config.lossBudget;
    this.lossBudget =
      d.lossBudget ??
      new LossBudget(
        {
          windowMs: lb.windowSeconds * 1000,
          perKeyLimit: lb.perKeyWei,
          globalLimit: lb.globalWei,
          maxKeys: lb.maxKeys,
          cleanReserve: lossCleanReserve(lb.globalWei),
        },
        mono,
      );
    this.alerts = d.alerts ?? nullAlerts;
    this.failures =
      d.failureBudgets ??
      new FailureBudgets({ ownerMax: OWNER_FAILURES_PER_WINDOW, destinationMax: 0, windowMs: OWNER_FAILURE_WINDOW_MS, maxKeys: d.config.rateLimit.maxKeys }, this.hasher, mono);
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
            // A broadcast probe holds its permit until its receipt wait ends (L5-06), so it gets that wait on top of
            // probeTimeoutSeconds, which covers the in-lane work up to the broadcast. With the probe timeout alone a
            // probe mined late in the wait would re-open the breaker and its success would be ignored.
            probeTimeoutMs: (b.probeTimeoutSeconds + d.config.queue.receiptTimeoutSeconds) * 1000,
          },
          mono,
        ),
        lastBreakerState: 'closed',
        pending: [],
        // The breaker's thresholds, applied to the mined reverts the breaker ignores (S3-06, L5-02).
        reverts: new RevertRate(
          { size: b.windowSize, minReverts: b.minSamples, ratio: b.failureRatio, windowMs: lb.windowSeconds * 1000 },
          mono,
        ),
      });
    }
    d.metrics?.gauge(
      'relayer_breaker_state',
      'Circuit breaker per chain: 0 closed, 1 half_open, 2 open.',
      () =>
        [...this.chains.values()].map((r) => ({
          labels: { chain_id: String(r.cfg.chainId) },
          value: r.breaker.state === 'closed' ? 0 : r.breaker.state === 'half_open' ? 1 : 2,
        })),
    );
    d.metrics?.gauge(
      'relayer_daily_budget_used_wei',
      'Gas budget reserved today per chain, wei (float64).',
      () =>
        [...this.chains.values()].map((r) => ({
          labels: { chain_id: String(r.cfg.chainId) },
          value: Number(r.budget.used),
        })),
    );
    d.metrics?.gauge('relayer_queue_pending', 'Sweeps queued or in flight per chain.', () =>
      [...this.chains.values()].map((r) => ({
        labels: { chain_id: String(r.cfg.chainId) },
        value: r.lane.pending,
      })),
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
        tokens: x.tokens.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          decimals: t.decimals,
          permit: t.permit,
        })),
      })),
    };
  }

  /** @returns Liveness/readiness (`GET /healthz`). */
  public health(): HealthResponse {
    const chains = [...this.chains.values()].map((r) => ({
      chainId: r.cfg.chainId,
      breaker: r.breaker.state,
      minedReverts: r.reverts.sustained ? ('sustained' as const) : ('normal' as const),
    }));
    let status: HealthResponse['status'] = 'ok';
    if (this.closing) status = 'shutting_down';
    else if (
      [...this.chains.values()].some((r) => r.breaker.health() !== 'ok') ||
      chains.some((c) => c.minedReverts === 'sustained')
    )
      status = 'degraded';
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
    // Spec 04 grief reserve: price a margin for gas lost when the owner drains or revokes first (rounded up).
    const griefBps = BigInt(this.d.config.gas.griefReserveBps ?? 0);
    const pricedGas = (gasCost * (FEE_SCHEDULE.BPS + griefBps) + FEE_SCHEDULE.BPS - 1n) / FEE_SCHEDULE.BPS;
    const { fee } = sponsorFee(req.amount, pricedGas);
    // If even the 300 bps cap cannot reimburse the gas, the sweep is uneconomical: refuse to quote.
    if (fee * 100n < gasCost * BigInt(this.d.config.gas.coverPercent))
      throw new RelayerError(422, 'amount_too_small');
    const expiresAt = Math.floor(this.now() / 1000) + this.d.config.quoteTtlSeconds;
    const quoteToken = signQuote(this.quoteKeys.primary, {
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

    const quote = verifyQuote(this.quoteKeys, req.quoteToken, {
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
    if (s.fee > (s.amount * FEE_SCHEDULE.SPONSOR_CAP_BPS) / FEE_SCHEDULE.BPS)
      throw new RelayerError(422, 'fee_above_cap');

    const cfg = this.d.config;
    if (s.deadline <= BigInt(nowSec + cfg.minDeadlineSeconds))
      throw new RelayerError(422, 'deadline_too_soon');
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
    const ownerKey = s.owner.toLowerCase();
    const strikes = this.failures.check(ownerKey, s.destination.toLowerCase());
    if (!strikes.ok) throw new RelayerError(429, 'owner_failure_limit', strikes.retryAfterSeconds);

    let decision;
    try {
      decision = await this.policy.check({
        chainId: req.chainId,
        token: s.token,
        owner: s.owner,
        destination: s.destination,
        amount: s.amount,
      });
    } catch {
      throw new RelayerError(503, 'policy_unavailable');
    }
    if (!decision.allow) throw new RelayerError(403, 'policy_denied');

    if (rt.breaker.retryAfterMs() > 0)
      throw new RelayerError(503, 'breaker_open', cfg.breaker.cooldownSeconds);

    const keys = this.abuseKeys(s.destination, ctx);
    this.requireLossBudget(rt, keys);
    const call: SweepCall = {
      sweepRelayer: rt.cfg.sweepRelayer,
      sweep: s,
      sweepSig: req.sweepSig,
      permit: req.permit,
    };
    try {
      return await rt.lane.submit(() => this.runJob(rt, call, ctx, keys));
    } catch (e) {
      if (e instanceof RelayerError && OWNER_STRIKE_CODES.has(e.code)) this.strike(call);
      throw e;
    }
  }

  /** Records one costly, user-attributable failure against the order's owner (spec 04 failure counter). */
  private strike(call: SweepCall): void {
    this.failures.record(call.sweep.owner.toLowerCase(), call.sweep.destination.toLowerCase());
    this.d.metrics?.inc('relayer_owner_failures_total');
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

  /**
   * Hashed per-destination and per-source loss-budget sources (the destination is free to mint, the network is not).
   * Their kinds keep the two apart in the loss budget's overflow entries (L5-04).
   */
  private abuseKeys(destination: Address, ctx: RequestContext): readonly LossSource[] {
    const dst = this.hasher.hash(destination.toLowerCase());
    const keys: LossSource[] = [{ key: `dst:${dst}`, group: `dst:${dst}`, kind: 'dst' }];
    if (ctx.clientKey !== undefined) {
      const net = this.hasher.hash(ctx.clientKey);
      const group = this.hasher.hash(ctx.clientGroupKey ?? ctx.clientKey);
      keys.push({ key: `net:${net}`, group: `net:${group}`, kind: 'net' });
    }
    return keys;
  }

  private requireLossBudget(rt: ChainRuntime, keys: readonly LossSource[]): void {
    if (this.lossBudget.allowsAll(keys)) return;
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

  /**
   * Quote path only: briefly reuses a validated price so anonymous quotes cannot force one RPC call each (S3-07), and
   * concurrent quotes that find the cache cold share one lookup (L5-03).
   */
  private async quoteGasPrice(rt: ChainRuntime): Promise<bigint> {
    const ttl = this.d.gasPriceCacheMs ?? this.d.config.gas.quoteCacheSeconds * 1000;
    const chainId = rt.cfg.chainId;
    const t = this.now();
    const hit = this.gasCache.get(chainId);
    if (ttl > 0 && hit !== undefined && t >= hit.at && t - hit.at < ttl) return hit.price;
    let lookup = this.gasLookups.get(chainId);
    if (lookup === undefined) {
      lookup = this.gasPrice(rt).finally(() => this.gasLookups.delete(chainId));
      this.gasLookups.set(chainId, lookup);
    }
    const price = await lookup;
    this.gasCache.set(chainId, { price, at: t });
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
    return this.capGasPrice(rt, price);
  }

  /** The configured gas price cap; refusing above it is neutral for the breaker (a spike, not an outage). */
  private capGasPrice(rt: ChainRuntime, price: bigint): bigint {
    if (price > rt.cfg.maxGasPriceWei) throw new RelayerError(503, 'gas_price_too_high', 30);
    return price;
  }

  /** Runs inside the chain lane: exactly one of these is active per chain at any time. */
  private async runJob(
    rt: ChainRuntime,
    call: SweepCall,
    ctx: RequestContext,
    keys: readonly LossSource[],
  ): Promise<JobOutcome<SweepResponse>> {
    const { cfg, breaker } = rt;
    const permit = breaker.tryAcquire({ validated: true });
    if (permit === null) throw new RelayerError(503, 'breaker_open', this.d.config.breaker.cooldownSeconds);
    // Every exit settles the permit; anything not named below is neutral (user-attributable), so a
    // half-open probe can never wedge (S3-05) and attacker-caused failures cannot open it (S3-06).
    // A broadcast sweep settles it when its receipt wait ends, so the receipt decides the outcome and a
    // half-open probe stays in flight until then (L5-06).
    let outcome = classifyRelayOutcome('invalid_request');
    const finish = (): void => {
      permit.settle(outcome);
      this.noteBreaker(rt);
      this.d.metrics?.inc('relayer_sweeps_total', { chain_id: cfg.chainId, outcome });
    };
    try {
      const out = await this.runSettled(rt, call, ctx, keys, (o) => {
        outcome = o;
      });
      return { value: out.value, settled: out.settled.finally(finish) };
    } catch (e) {
      finish();
      throw e;
    }
  }

  private async runSettled(
    rt: ChainRuntime,
    requested: SweepCall,
    ctx: RequestContext,
    keys: readonly LossSource[],
    setOutcome: (o: Outcome) => void,
  ): Promise<JobOutcome<SweepResponse>> {
    const { cfg, client, breaker, budget, nonces } = rt;
    // Queue time can consume the sweep's margin. Keep the same neutral, pre-broadcast reason as at admission.
    const deadlineTooSoon = (): boolean =>
      requested.sweep.deadline <= BigInt(Math.floor(this.now() / 1000) + this.d.config.minDeadlineSeconds);
    if (deadlineTooSoon()) throw new RelayerError(422, 'deadline_too_soon');
    await this.reconcilePending(rt);

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

    // Read through op() so a failed read counts as an RPC failure (L5-10); the cap check stays neutral.
    const readGasPrice = async (): Promise<bigint> =>
      this.capGasPrice(rt, await op(() => this.d.gasPrices.getGasPrice(cfg.chainId)));
    const gasPrice = await readGasPrice();
    const balance = await op(() => client.getBalance());
    if (balance < cfg.minBalanceWei) {
      breaker.trip();
      this.alerts.send({ kind: 'low_balance', chainId: cfg.chainId });
      this.logger.log('error', 'breaker_tripped_low_balance', {
        requestId: ctx.requestId,
        chainId: cfg.chainId,
        errorClass: 'low_balance',
      });
      throw new RelayerError(503, 'breaker_open', this.d.config.breaker.cooldownSeconds);
    }

    let call = requested;
    if (deadlineTooSoon()) throw new RelayerError(422, 'deadline_too_soon');
    const state = await op(() => client.readOrderState(call));
    // A slow RPC can also consume that margin; check before attributing a state or permit error to the owner.
    if (deadlineTooSoon()) throw new RelayerError(422, 'deadline_too_soon');
    if (state.nonceUsed) throw new RelayerError(409, 'nonce_used');
    if (state.ownerBalance < call.sweep.amount) throw new RelayerError(422, 'insufficient_token_balance');
    if (call.permit === undefined && state.allowance < call.sweep.amount)
      throw new RelayerError(422, 'insufficient_allowance');
    // Spec 04 fallback ladder: allowance already covers (e.g. a front-runner submitted the owner's permit) -> skip the
    // permit and use the plain `sweep` path; otherwise an expired permit is refused before paying for a simulation.
    // The permit is outside the sweep signature and the quote MAC and the contract swallows a failed permit, so one
    // that can lapse while the order is still valid would be a mined revert paid by the relayer (L5-01): it must last
    // until the sweep deadline. No margin: clients sign `permit.deadline == sweep.deadline`.
    if (call.permit !== undefined) {
      if (state.allowance >= call.sweep.amount) {
        call = { ...call, permit: undefined };
        this.d.metrics?.inc('relayer_permit_skipped_total', { chain_id: cfg.chainId });
      } else if (
        call.permit.deadline < call.sweep.deadline ||
        call.permit.deadline <= BigInt(Math.floor(this.now() / 1000))
      ) {
        throw new RelayerError(422, 'permit_expired');
      }
    }
    // With a permit still in use the allowance is short, so a generic transfer revert means the permit was not
    // accepted (bad signature, consumed nonce, non-standard token): report that class instead of a generic one.
    const permitInUse = call.permit !== undefined;
    const simulationError = (e: SimulationRevert): RelayerError => {
      const mapped = revertToError(e);
      if (permitInUse && (mapped.code === 'simulation_reverted' || mapped.code === 'token_transfer_failed')) return new RelayerError(422, 'permit_failed');
      return mapped;
    };

    let firstSimulation: Awaited<ReturnType<ChainClient['simulateSweep']>>;
    try {
      firstSimulation = await op(() => client.simulateSweep(call));
    } catch (e) {
      if (e instanceof SimulationRevert) throw simulationError(e);
      throw e;
    }
    if (firstSimulation.gasLimit > cfg.maxGasLimit) throw new RelayerError(422, 'gas_limit_too_high');
    const token = cfg.tokens.find((t) => t.address === call.sweep.token);
    if (token === undefined) throw new RelayerError(422, 'token_not_supported');
    const coversGas = async (estimate: bigint, price: bigint): Promise<boolean> => {
      const cost = await this.d.tokenPrices.nativeToTokenUnits(cfg.chainId, token, estimate * price);
      return call.sweep.fee * 100n >= cost * BigInt(this.d.config.gas.coverPercent);
    };
    if (!(await coversGas(firstSimulation.gasEstimate, gasPrice)))
      throw new RelayerError(422, 'fee_below_gas_cost');

    const sendGasPrice = await readGasPrice();
    if (sendGasPrice * 100n > gasPrice * BigInt(100 + this.d.config.gas.maxMovePercent)) {
      throw new RelayerError(503, 'gas_price_moved', 5);
    }
    // The deadline was checked before the queue wait: a sweep left with no more than the minimum could lapse before
    // inclusion, a mined revert the relayer pays for. Refused like at admission (neutral, not the owner's doing), here
    // and again after the final simulation, whose RPC calls can use up the margin.
    if (deadlineTooSoon()) throw new RelayerError(422, 'deadline_too_soon');
    let finalSimulation: Awaited<ReturnType<ChainClient['simulateSweep']>>;
    try {
      finalSimulation = await op(() => client.simulateSweep(call));
    } catch (e) {
      if (e instanceof SimulationRevert) throw simulationError(e);
      throw e;
    }
    if (finalSimulation.gasLimit > cfg.maxGasLimit) throw new RelayerError(422, 'gas_limit_too_high');
    if (!(await coversGas(finalSimulation.gasEstimate, sendGasPrice)))
      throw new RelayerError(422, 'fee_below_gas_cost');
    // Next to the send and before anything is reserved: only the nonce read and the send itself follow.
    if (deadlineTooSoon()) throw new RelayerError(422, 'deadline_too_soon');

    const gasLimit = finalSimulation.gasLimit;
    const reserved = gasLimit * sendGasPrice;
    // One reservation for the whole sweep: each source's key and group, and the global cap once (L5-02).
    const loss = this.lossBudget.reserveAll(keys, reserved);
    if (loss === null) {
      this.d.metrics?.inc('relayer_loss_budget_denied_total', { chain_id: cfg.chainId });
      this.alerts.send({ kind: 'loss_budget_exhausted', chainId: cfg.chainId });
      throw new RelayerError(429, 'loss_budget_exhausted', this.d.config.lossBudget.windowSeconds);
    }
    if (loss.overflow) this.d.metrics?.inc('relayer_loss_budget_overflow_total', { chain_id: cfg.chainId });
    if (!budget.reserve(reserved)) {
      loss.release();
      this.alerts.send({ kind: 'daily_budget_exhausted', chainId: cfg.chainId });
      throw new RelayerError(503, 'budget_exhausted', budget.secondsToReset());
    }
    const reservedDay = budget.currentDay;

    let txHash: Hex;
    try {
      const nonce = await nonces.acquire();
      txHash = await client.sendSweep(call, { nonce, gas: gasLimit, gasPrice: sendGasPrice });
    } catch {
      nonces.invalidate();
      budget.release(reserved, reservedDay);
      loss.release();
      setOutcome(classifyRelayOutcome('send_failed'));
      throw new RelayerError(503, 'send_failed');
    }
    this.logger.log('info', 'sweep_sent', { requestId: ctx.requestId, chainId: cfg.chainId, txHash });

    // The breaker outcome is the receipt's, not the broadcast's (L5-06): a mined sweep is a success, a receipt
    // timeout a failure, and a mined revert neutral (S3-06; attributed to a state change, not re-simulated).
    const sent: SentSweep = { txHash, call, gasPrice: sendGasPrice, reserved, reservedDay, loss, at: 0 };
    const settled = (async (): Promise<void> => {
      let r: ReceiptSummary;
      try {
        r = await client.waitForReceipt(txHash, this.d.config.queue.receiptTimeoutSeconds * 1000);
      } catch {
        r = { status: 'timeout', gasUsed: 0n };
      }
      if (r.status === 'timeout') {
        nonces.invalidate();
        setOutcome(classifyRelayOutcome('receipt_timeout'));
        this.receiptTimedOut(rt, sent);
        return;
      }
      setOutcome(classifyRelayOutcome(r.status === 'success' ? 'confirmed' : 'mined_revert_state_changed'));
      this.settleReceipt(rt, sent, { status: r.status, gasUsed: r.gasUsed });
    })();
    return { value: { txHash }, settled };
  }

  /**
   * The broadcast may still be mined, so its worst-case reservations are kept and its receipt is looked up again by
   * later jobs (L5-06); the job's breaker permit records the failure. Nothing bumps or cancels the transaction (README).
   */
  private receiptTimedOut(rt: ChainRuntime, sent: SentSweep): void {
    const chainId = rt.cfg.chainId;
    this.logger.log('warn', 'receipt_timeout', { chainId, txHash: sent.txHash, errorClass: 'receipt_timeout' });
    this.d.metrics?.inc('relayer_receipt_timeouts_total', { chain_id: chainId });
    this.alerts.send({ kind: 'receipt_timeout', chainId });
    sent.at = this.mono();
    rt.pending.push(sent);
    if (rt.pending.length > MAX_PENDING_RECEIPTS) rt.pending.shift();
  }

  /** In-lane: looks up the receipts of earlier timed-out sweeps and settles the ones that were mined (L5-06). */
  private async reconcilePending(rt: ChainRuntime): Promise<void> {
    for (const sent of [...rt.pending]) {
      if (this.mono() - sent.at >= PENDING_RECEIPT_MAX_AGE_MS) {
        rt.pending.splice(rt.pending.indexOf(sent), 1);
        continue;
      }
      let r: MinedReceipt | null;
      try {
        r = await rt.client.getReceipt(sent.txHash);
      } catch {
        return; // RPC trouble: this job's own reads decide; look again next time
      }
      if (r === null) continue;
      rt.pending.splice(rt.pending.indexOf(sent), 1);
      this.logger.log('info', 'receipt_late', { chainId: rt.cfg.chainId, txHash: sent.txHash });
      this.settleReceipt(rt, sent, r);
    }
  }

  /** Settles a mined sweep: returns unused budget and releases its loss reservations, or charges a mined revert. */
  private settleReceipt(rt: ChainRuntime, sent: SentSweep, r: MinedReceipt): void {
    const { cfg, budget } = rt;
    const spent = r.gasUsed * sent.gasPrice;
    budget.release(sent.reserved > spent ? sent.reserved - spent : 0n, sent.reservedDay);
    if (r.status === 'success') {
      sent.loss.release();
      rt.reverts.record(false);
      return;
    }
    // The simulation passed moments earlier, so a mined revert means state changed in between
    // (front-run, S3-06): the relayer paid gas and earned no fee. Charge the sources, do not
    // count it against the breaker; a sustained rate degrades health instead (L5-02).
    sent.loss.settle(spent);
    this.strike(sent.call); // owner-drains-first / front-run: counts against the owner (spec 04)
    this.d.metrics?.inc('relayer_mined_reverts_total', { chain_id: cfg.chainId });
    this.alerts.send({ kind: 'mined_revert', chainId: cfg.chainId });
    if (rt.reverts.record(true)) this.alerts.send({ kind: 'mined_revert_rate', chainId: cfg.chainId });
    this.logger.log('error', 'sweep_reverted', {
      chainId: cfg.chainId,
      txHash: sent.txHash,
      errorClass: 'mined_revert',
    });
  }
}
