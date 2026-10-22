/** Stable machine-readable failure codes for @ghostpay/hygiene. */
export type HygieneErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_ADDRESS'
  | 'INVALID_LEDGER'
  | 'CHAIN_NOT_ALLOWED'
  | 'DEST_REUSE'
  | 'RPC_MALFORMED'
  | 'ADDRESS_LEAK'
  | 'DECOY_SHORTAGE'
  | 'BATCH_UNSUPPORTED';

/**
 * Error thrown by every function in this package. Messages are fixed strings:
 * they never embed keys, seeds, addresses or RPC payloads.
 */
export class HygieneError extends Error {
  /** Machine-readable failure code. */
  public readonly code: HygieneErrorCode;

  public constructor(code: HygieneErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'HygieneError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: HygieneErrorCode, detail: string): never {
  throw new HygieneError(code, detail);
}
