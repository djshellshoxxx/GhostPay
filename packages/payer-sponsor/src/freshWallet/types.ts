import type { Address } from 'viem';

/** One observed or planned funding transfer (native when `token` is undefined). */
export interface FundingTx {
  readonly from: Address;
  readonly to: Address;
  /** Wei for native transfers, token base units otherwise. */
  readonly value: bigint;
  readonly token?: Address | undefined;
  /** Epoch milliseconds. */
  readonly atMs: number;
}

/** Warning codes (PH-1-REQ-2/3/6/7). */
export type FundingWarningCode =
  | 'FUNDER_IS_KNOWN'
  | 'SAME_SENDER_RECEIVER'
  | 'SHARED_FUNDER'
  | 'EXACT_AMOUNT'
  | 'NO_DELAY'
  | 'LEFTOVER_RETURN'
  | 'TOKEN_FUNDING_LINK'
  | 'PAYER_REUSE';

/** A linkage warning for the user. */
export interface FundingWarning {
  readonly code: FundingWarningCode;
  readonly message: string;
}

/** One step of a funding plan. */
export interface FundingStep {
  readonly kind: 'native' | 'token';
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly token?: Address | undefined;
  /** Wait this long (ms) after the plan starts before sending. */
  readonly afterMs: number;
}
