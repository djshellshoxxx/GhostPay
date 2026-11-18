/** Thresholds of {@link RevertRate}. */
export interface RevertRateOptions {
  /** Most recent mined sweeps considered, >= 1. */
  readonly size: number;
  /** Fewest reverts that can be sustained, >= 1. */
  readonly minReverts: number;
  /** Share of the considered sweeps that must have reverted, in (0, 1]. */
  readonly ratio: number;
  /** A mined sweep older than this no longer counts, ms > 0. */
  readonly windowMs: number;
}

/**
 * Recent mined sweeps of one chain. A mined revert is breaker-neutral (S3-06) and charged to the loss budget, so
 * without this a stream of them would leave `/healthz` at `ok` while the budget drains (audit L5-02): sustained means
 * at least `minReverts` reverts that are at least `ratio` of the last `size` mined sweeps within `windowMs`.
 */
export class RevertRate {
  private readonly mined: { readonly at: number; readonly reverted: boolean }[] = [];

  public constructor(
    private readonly o: RevertRateOptions,
    private readonly now: () => number,
  ) {}

  /**
   * Records one mined sweep.
   *
   * @returns Whether reverts are now sustained.
   */
  public record(reverted: boolean): boolean {
    this.mined.push({ at: this.now(), reverted });
    if (this.mined.length > this.o.size) this.mined.shift();
    return this.sustained;
  }

  /** Whether recent mined sweeps revert at a sustained rate. */
  public get sustained(): boolean {
    const t = this.now();
    for (
      let first = this.mined[0];
      first !== undefined && t - first.at >= this.o.windowMs;
      first = this.mined[0]
    ) {
      this.mined.shift();
    }
    const reverts = this.mined.filter((m) => m.reverted).length;
    return reverts >= this.o.minReverts && reverts >= this.o.ratio * this.mined.length;
  }
}
