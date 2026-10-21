import { BreakerOpenError, monotonicNow, requireConfig, type Clock } from './errors.js';

/** Breaker state. */
export type BreakerState = 'closed' | 'open' | 'half_open';

/** Health derived from the state: `half_open` is never reported as `ok` (audit S3-05). */
export type BreakerHealth = 'ok' | 'degraded' | 'unhealthy';

/**
 * How one operation affects the breaker.
 *
 * - `success`: the downstream dependency worked (closes a half-open breaker).
 * - `failure`: an **operational** failure (RPC down, send failed, receipt timeout).
 * - `neutral`: the result says nothing about the dependency's health (user input error, simulation
 *   revert, nonce already used, budget or gas-price cap, a mined revert the user caused). Neutral
 *   outcomes are never counted and release a half-open probe slot.
 */
export type Outcome = 'success' | 'failure' | 'neutral';

/** Breaker tunables. All durations in milliseconds of the injected clock. */
export interface GuardedBreakerOptions {
  /** Outcomes remembered (sliding count window), >= minSamples. */
  readonly windowSize: number;
  /** Minimum counted outcomes before the failure ratio is evaluated, >= 1. */
  readonly minSamples: number;
  /** Failure ratio in (0, 1] at or above which the breaker opens. */
  readonly failureRatio: number;
  /** Time open before a probe is admitted, > 0. */
  readonly cooldownMs: number;
  /** A probe not settled within this time counts as a failure and re-opens the breaker, > 0. */
  readonly probeTimeoutMs: number;
}

/** A single-use admission ticket. Exactly one {@link Permit.settle} call has an effect. */
export interface Permit {
  /** True when this permit is the half-open probe. */
  readonly probe: boolean;
  /** True once settled (or once superseded by a state change). */
  readonly settled: boolean;
  /**
   * Reports the outcome.
   *
   * @returns True if the outcome was applied; false for a repeated call or a stale permit (the
   *   breaker changed state since it was issued).
   */
  settle(outcome: Outcome): boolean;
}

/** Result passed to a {@link GuardedBreaker.run} classifier. */
export type RunResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

/**
 * Count-window circuit breaker whose half-open probe can never wedge.
 *
 * Differences from `apps/relayer/src/breaker.ts` at commit ce9996b (audit S3-05/S3-06):
 * every admission is a {@link Permit} that must be settled; a `neutral` probe result frees the probe
 * slot instead of leaving the breaker half-open forever; an unsettled probe expires after
 * `probeTimeoutMs`; late settlements from an earlier state are ignored; {@link GuardedBreaker.health}
 * reports `half_open` as `degraded`.
 *
 * @security Availability control only. It decides whether the relayer spends gas, it never decides
 *   whether a sweep is valid. A caller that classifies attacker-caused reverts as `failure` re-opens
 *   breaker poisoning (S3-06); use {@link classifyRelayOutcome} or an equivalent table.
 */
export class GuardedBreaker {
  private readonly outcomes: boolean[] = [];
  private current: BreakerState = 'closed';
  private openedAt = 0;
  private generation = 0;
  private probeIssuedAt: number | null = null;

  /**
   * @param opts Tunables (validated; throws `GuardError` INVALID_CONFIG).
   * @param now Monotonic clock (default `performance.now`).
   */
  public constructor(
    private readonly opts: GuardedBreakerOptions,
    private readonly now: Clock = monotonicNow,
  ) {
    requireConfig(Number.isInteger(opts.minSamples) && opts.minSamples >= 1, 'minSamples must be an integer >= 1');
    requireConfig(
      Number.isInteger(opts.windowSize) && opts.windowSize >= opts.minSamples,
      'windowSize must be an integer >= minSamples',
    );
    requireConfig(opts.failureRatio > 0 && opts.failureRatio <= 1, 'failureRatio must be in (0, 1]');
    requireConfig(Number.isFinite(opts.cooldownMs) && opts.cooldownMs > 0, 'cooldownMs must be > 0');
    requireConfig(Number.isFinite(opts.probeTimeoutMs) && opts.probeTimeoutMs > 0, 'probeTimeoutMs must be > 0');
  }

  /** Current state after applying any due probe expiry. */
  public get state(): BreakerState {
    this.expireProbe();
    return this.current;
  }

  /** @returns `ok` (closed), `degraded` (half-open, or open with the cooldown elapsed), `unhealthy` (open, cooling down). */
  public health(): BreakerHealth {
    const s = this.state;
    if (s === 'closed') return 'ok';
    if (s === 'half_open') return 'degraded';
    return this.now() - this.openedAt >= this.opts.cooldownMs ? 'degraded' : 'unhealthy';
  }

  /** @returns Milliseconds until {@link tryAcquire} can succeed (0 when it can now or a probe is in flight). */
  public retryAfterMs(): number {
    const s = this.state;
    if (s !== 'open') return 0;
    return Math.max(0, this.opts.cooldownMs - (this.now() - this.openedAt));
  }

  /**
   * Requests admission.
   *
   * @returns A permit, or `null` when the breaker is open and cooling down, or half-open with a probe
   *   already in flight.
   */
  public tryAcquire(): Permit | null {
    const s = this.state;
    if (s === 'closed') return this.permit(false);
    if (s === 'open') {
      if (this.now() - this.openedAt < this.opts.cooldownMs) return null;
      this.transition('half_open');
    }
    if (this.probeIssuedAt !== null) return null;
    this.probeIssuedAt = this.now();
    return this.permit(true);
  }

  /**
   * Opens the breaker immediately (for example, hot-key balance below the floor).
   *
   * @security Call on operator-observed conditions only, never on request content.
   */
  public trip(): void {
    this.transition('open');
  }

  /** Closes the breaker and forgets history (operator action). */
  public reset(): void {
    this.transition('closed');
  }

  /**
   * Runs `fn` under a permit and settles it on every path, including a throwing classifier
   * (settled `neutral`).
   *
   * @param fn Operation.
   * @param classify Maps the result or thrown error to an {@link Outcome}.
   * @returns The value of `fn`.
   * @throws {BreakerOpenError} When no permit is available; otherwise whatever `fn` threw.
   */
  public async run<T>(fn: () => Promise<T>, classify: (r: RunResult<T>) => Outcome): Promise<T> {
    const permit = this.tryAcquire();
    if (permit === null) throw new BreakerOpenError(this.retryAfterMs());
    try {
      let value: T;
      try {
        value = await fn();
      } catch (error) {
        permit.settle(classify({ ok: false, error }));
        throw error;
      }
      permit.settle(classify({ ok: true, value }));
      return value;
    } finally {
      if (!permit.settled) permit.settle('neutral');
    }
  }

  private permit(probe: boolean): Permit {
    const gen = this.generation;
    let done = false;
    const stale = (): boolean => gen !== this.generation;
    const settle = (outcome: Outcome): boolean => {
      if (done) return false;
      done = true;
      this.expireProbe();
      if (stale()) return false;
      this.apply(probe, outcome);
      return true;
    };
    return {
      probe,
      get settled(): boolean {
        return done || stale();
      },
      settle,
    };
  }

  private apply(probe: boolean, outcome: Outcome): void {
    if (probe) {
      if (outcome === 'success') this.transition('closed');
      else if (outcome === 'failure') this.transition('open');
      else this.probeIssuedAt = null;
      return;
    }
    if (outcome === 'neutral') return;
    this.outcomes.push(outcome === 'success');
    if (this.outcomes.length > this.opts.windowSize) this.outcomes.shift();
    if (outcome === 'failure' && this.outcomes.length >= this.opts.minSamples) {
      const failures = this.outcomes.filter((ok) => !ok).length;
      if (failures / this.outcomes.length >= this.opts.failureRatio) this.transition('open');
    }
  }

  private expireProbe(): void {
    const issued = this.probeIssuedAt;
    if (this.current === 'half_open' && issued !== null && this.now() - issued >= this.opts.probeTimeoutMs) {
      this.transition('open');
      // Expiry is evaluated lazily; the cooldown runs from the moment the probe expired, not from
      // the first later observation (found by the property test in breaker.test.ts).
      this.openedAt = issued + this.opts.probeTimeoutMs;
    }
  }

  private transition(to: BreakerState): void {
    this.current = to;
    this.generation += 1;
    this.probeIssuedAt = null;
    this.outcomes.length = 0;
    if (to === 'open') this.openedAt = this.now();
  }
}

/** Relay result classes known to {@link classifyRelayOutcome}. */
export type RelayResultClass =
  | 'confirmed'
  | 'rpc_error'
  | 'send_failed'
  | 'receipt_timeout'
  | 'mined_revert_unexplained'
  | 'simulation_reverted'
  | 'invalid_request'
  | 'nonce_used'
  | 'quote_invalid'
  | 'budget_exhausted'
  | 'gas_price_too_high'
  | 'gas_limit_too_high'
  | 'loss_budget_exhausted'
  | 'mined_revert_state_changed';

const OUTCOME_TABLE: Readonly<Record<RelayResultClass, Outcome>> = {
  confirmed: 'success',
  rpc_error: 'failure',
  send_failed: 'failure',
  receipt_timeout: 'failure',
  mined_revert_unexplained: 'failure',
  simulation_reverted: 'neutral',
  invalid_request: 'neutral',
  nonce_used: 'neutral',
  quote_invalid: 'neutral',
  budget_exhausted: 'neutral',
  gas_price_too_high: 'neutral',
  gas_limit_too_high: 'neutral',
  loss_budget_exhausted: 'neutral',
  mined_revert_state_changed: 'neutral',
};

/**
 * Default outcome table for a sweep relayer.
 *
 * `mined_revert_state_changed` is a mined revert whose re-simulation at the inclusion block shows the
 * owner's state changed after the relayer's simulation (front-run, S3-06): it is the attacker's doing,
 * so it is neutral for the breaker and must be charged to a {@link LossBudget} instead.
 *
 * @param c Result class.
 * @returns The breaker outcome.
 */
export function classifyRelayOutcome(c: RelayResultClass): Outcome {
  return OUTCOME_TABLE[c];
}
