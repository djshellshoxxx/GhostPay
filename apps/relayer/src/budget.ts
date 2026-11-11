const DAY_MS = 86_400_000;
/** Wall/monotonic disagreement tolerated as clock slew (NTP) rather than a step. */
const SLEW_TOLERANCE_MS = 600_000;

/**
 * Per-chain daily gas budget in wei (UTC day). Reservation-based so concurrent jobs cannot overshoot.
 *
 * @remarks Clock steps must not grant budget (financial exposure). A new day starts only when BOTH the wall clock and
 * the monotonic clock say a UTC midnight has passed since the wall clock was last seen consistent: a wall clock stepped
 * back keeps today's spending, and one stepped (or flapping) forward gets no fresh budget until real time has passed.
 * Slow drift within {@link SLEW_TOLERANCE_MS} re-anchors the two clocks. A restored snapshot from today or tomorrow is
 * kept; one more than a day ahead (a wrong reading that was saved) keeps its spending on today's day.
 * Residual: a host whose wall clock is wrong at process start, across repeated restarts, is trusted at each start.
 */
export class DailyBudget {
  private spent: bigint;
  private day: number;
  private anchorWall: number;
  private anchorMono: number;

  /**
   * @param limitWei Daily limit.
   * @param now Wall clock ms.
   * @param restored Persisted `{day, spentWei}` from the state journal; ignored when from an earlier day.
   * @param mono Monotonic ms clock (default: `now`, which disables the step check).
   */
  public constructor(
    private readonly limitWei: bigint,
    private readonly now: () => number,
    restored?: { readonly day: number; readonly spentWei: bigint },
    private readonly mono: () => number = now,
  ) {
    this.anchorWall = now();
    this.anchorMono = mono();
    const today = Math.floor(this.anchorWall / DAY_MS);
    if (restored !== undefined && restored.day >= today) {
      this.day = restored.day > today + 1 ? today : restored.day;
      this.spent = restored.spentWei;
    } else {
      this.day = today;
      this.spent = 0n;
    }
  }

  private roll(): void {
    const wall = this.now();
    const m = this.mono();
    const expectedWall = this.anchorWall + (m - this.anchorMono);
    if (Math.abs(wall - expectedWall) <= SLEW_TOLERANCE_MS) {
      this.anchorWall = wall;
      this.anchorMono = m;
    }
    // Both clocks must agree that the day changed (the monotonic one with slew tolerance).
    const d = Math.min(Math.floor(wall / DAY_MS), Math.floor((expectedWall + SLEW_TOLERANCE_MS) / DAY_MS));
    if (d > this.day) {
      this.day = d;
      this.spent = 0n;
    }
  }

  /**
   * Reserves `wei`.
   *
   * @param wei Worst-case cost.
   * @returns False when it would exceed today's limit (nothing reserved).
   */
  public reserve(wei: bigint): boolean {
    this.roll();
    if (this.spent + wei > this.limitWei) return false;
    this.spent += wei;
    return true;
  }

  /**
   * Returns an unused part of a reservation.
   *
   * @param wei Amount to give back (clamped to what is spent).
   * @param reservedDay The value of {@link currentDay} when the reservation was made. A late
   * settlement from a prior UTC day must not reduce the new day's reservations.
   */
  public release(wei: bigint, reservedDay?: number): void {
    this.roll();
    if (reservedDay !== undefined && reservedDay !== this.day) return;
    this.spent = wei > this.spent ? 0n : this.spent - wei;
  }

  /** @returns The UTC day index that a new reservation will belong to. */
  public get currentDay(): number {
    this.roll();
    return this.day;
  }

  /** @returns Wei still available today. */
  public get remaining(): bigint {
    this.roll();
    return this.limitWei > this.spent ? this.limitWei - this.spent : 0n;
  }

  /** @returns Wei spent so far today. */
  public get used(): bigint {
    this.roll();
    return this.spent;
  }

  /** @returns `{day, spentWei}` for the state journal. */
  public snapshot(): { day: number; spentWei: bigint } {
    this.roll();
    return { day: this.day, spentWei: this.spent };
  }

  /** @returns Seconds until the next UTC midnight. */
  public secondsToReset(): number {
    return Math.max(1, Math.ceil(((this.day + 1) * DAY_MS - this.now()) / 1000));
  }
}
