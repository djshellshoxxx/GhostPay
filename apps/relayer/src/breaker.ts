/** Breaker state. */
export type BreakerState = 'closed' | 'open' | 'half_open';

/** Breaker tunables. */
export interface BreakerOptions {
  /** Outcomes remembered. */
  readonly windowSize: number;
  /** Minimum outcomes before the failure ratio is evaluated. */
  readonly minSamples: number;
  /** Failure ratio (0..1) at or above which the breaker opens. */
  readonly failureRatio: number;
  /** Time open before one probe is allowed. */
  readonly cooldownMs: number;
}

/**
 * Circuit breaker: opens on a high recent error rate or an explicit trip (low balance); after the
 * cooldown it lets a single probe through (half-open) whose result closes or re-opens it.
 */
export class CircuitBreaker {
  private readonly outcomes: boolean[] = [];
  private current: BreakerState = 'closed';
  private openedAt = 0;

  public constructor(
    private readonly opts: BreakerOptions,
    private readonly now: () => number,
  ) {}

  /** @returns The state, without side effects (open stays open until {@link allow}). */
  public get state(): BreakerState {
    return this.current;
  }

  /** @returns True if the breaker is open and cooling down (no probe is due yet). */
  public isBlocking(): boolean {
    return this.current === 'open' && this.now() - this.openedAt < this.opts.cooldownMs;
  }

  /** @returns Whether one request may proceed now; moves open to half-open when the cooldown elapsed. */
  public allow(): boolean {
    if (this.current === 'closed') return true;
    if (this.current === 'open' && this.now() - this.openedAt >= this.opts.cooldownMs) {
      this.current = 'half_open';
      return true;
    }
    return false;
  }

  /** Records a successful operation. */
  public recordSuccess(): void {
    if (this.current === 'half_open') {
      this.current = 'closed';
      this.outcomes.length = 0;
      return;
    }
    this.push(true);
  }

  /** Records an operational failure (RPC/send failure, reverted mined tx), never a user error. */
  public recordFailure(): void {
    if (this.current === 'half_open') {
      this.trip();
      return;
    }
    this.push(false);
    if (this.outcomes.length >= this.opts.minSamples) {
      const failures = this.outcomes.filter((ok) => !ok).length;
      if (failures / this.outcomes.length >= this.opts.failureRatio) this.trip();
    }
  }

  /** Opens the breaker immediately (e.g. relayer balance below the configured floor). */
  public trip(): void {
    this.current = 'open';
    this.openedAt = this.now();
    this.outcomes.length = 0;
  }

  private push(ok: boolean): void {
    this.outcomes.push(ok);
    if (this.outcomes.length > this.opts.windowSize) this.outcomes.shift();
  }
}
