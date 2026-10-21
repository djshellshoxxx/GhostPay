/** Per-chain daily gas budget in wei (UTC day). Reservation-based so concurrent jobs cannot overshoot. */
export class DailyBudget {
  private spent = 0n;
  private day: number;

  public constructor(
    private readonly limitWei: bigint,
    private readonly now: () => number,
  ) {
    this.day = this.dayOf();
  }

  private dayOf(): number {
    return Math.floor(this.now() / 86_400_000);
  }

  private roll(): void {
    const d = this.dayOf();
    if (d !== this.day) {
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

  /** @returns The UTC day (since the epoch) the next reservation counts against. */
  public dayIndex(): number {
    this.roll();
    return this.day;
  }

  /**
   * Returns an unused part of a reservation.
   *
   * @param wei Amount to give back (clamped to what is spent).
   * @param day The {@link DailyBudget.dayIndex} at reservation time; a release for an earlier day is
   * dropped (that day's counter is already gone) so it cannot reduce today's spend.
   */
  public release(wei: bigint, day?: number): void {
    this.roll();
    if (day !== undefined && day !== this.day) return;
    this.spent = wei > this.spent ? 0n : this.spent - wei;
  }

  /** @returns Wei spent so far today. */
  public get used(): bigint {
    this.roll();
    return this.spent;
  }

  /** @returns Seconds until the next UTC midnight. */
  public secondsToReset(): number {
    return Math.max(1, Math.ceil(((this.day + 1) * 86_400_000 - this.now()) / 1000));
  }
}
