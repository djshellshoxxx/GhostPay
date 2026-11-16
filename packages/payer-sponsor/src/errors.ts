/** Stable error codes of this package. Messages never contain addresses, calldata or keys. */
export type PayerSponsorErrorCode =
  | 'MAINNET_FORBIDDEN'
  | 'INVALID_ARGUMENT'
  | 'PAYLOAD_MISMATCH'
  | 'MANIFEST_MISMATCH'
  | 'ENTRYPOINT_MISMATCH'
  | 'FUNDER_IS_KNOWN'
  | 'NO_7702'
  | 'MODE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'BREAKER_OPEN'
  | 'BUDGET_EXCEEDED'
  | 'SIMULATION_FAILED'
  | 'QUOTE_UNKNOWN'
  | 'QUOTE_EXPIRED'
  | 'FEE_TOO_LOW'
  | 'BAD_REQUEST'
  | 'UNAVAILABLE'
  | 'OUTCOME_UNKNOWN';

/** Error carrying a stable {@link PayerSponsorErrorCode}. */
export class PayerSponsorError extends Error {
  public readonly code: PayerSponsorErrorCode;
  /** Set for `OUTCOME_UNKNOWN`: the broadcast transaction whose outcome could not be confirmed. */
  public readonly txHash: `0x${string}` | undefined;

  /**
   * @param code Stable code.
   * @param message Human readable message without secrets or user data.
   */
  public constructor(code: PayerSponsorErrorCode, message: string, txHash?: `0x${string}`) {
    super(message);
    this.txHash = txHash;
    this.name = 'PayerSponsorError';
    this.code = code;
  }
}

/**
 * Throws `INVALID_ARGUMENT` when `ok` is false.
 *
 * @param ok Condition that must hold.
 * @param message Error message.
 */
export function ensure(ok: boolean, message: string): asserts ok {
  if (!ok) throw new PayerSponsorError('INVALID_ARGUMENT', message);
}
