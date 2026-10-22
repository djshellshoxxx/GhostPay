/** Failure codes. Messages are fixed strings and never echo input. */
export type BillingErrorCode =
  | 'AMOUNT'
  | 'BPS'
  | 'PLAN'
  | 'SCHEDULE'
  | 'STATE'
  | 'LEDGER'
  | 'REFUND'
  | 'IDEMPOTENCY'
  | 'META_ADDRESS'
  | 'CSV'
  | 'LIMIT';

/** Base class of every error thrown by this package. */
export class BillingError extends Error {
  public readonly code: BillingErrorCode;
  /** Schema-defined location only (e.g. `row 3`, `plan.every`); never input data. */
  public readonly where: string | undefined;

  public constructor(code: BillingErrorCode, message: string, where?: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.where = where;
  }
}
