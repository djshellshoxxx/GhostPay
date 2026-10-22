/** Blur modes. `off` is the default everywhere. */
export type BlurMode = 'off' | 'delay' | 'round' | 'split' | 'denom';

/** One planned router call. */
export interface PlannedPart {
  readonly index: number;
  readonly gross: bigint;
  readonly fee: bigint;
  readonly net: bigint;
  /** Due time from plan start (monotonic clock domain). */
  readonly dueOffsetMs: number;
  /** Router `deadline` offset: due + margin, never beyond the invoice expiry. */
  readonly deadlineOffsetMs: number;
  /** True for the single denomination-mode part that absorbed the remainder. */
  readonly isRemainder: boolean;
}

/** Output of `planSplit`. */
export interface SplitPlan {
  readonly parts: readonly PlannedPart[];
  readonly grossTotal: bigint;
  readonly feeTotal: bigint;
  readonly netTotal: bigint;
  /** `netTotal - invoiceNet`, always `>= 0`. The seller keeps it; there is no refund. */
  readonly overpayNet: bigint;
  /** `k - 1`. */
  readonly extraGasParts: number;
  /** Sum of upward rounding increments (gross base units), part of the AB-S1 bound. */
  readonly snapSlackGross: bigint;
}
